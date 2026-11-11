import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { type Inventory, RULE_STILL_LIVE, validateInventory } from "../src/inventory.ts";
import { type Context, run } from "../src/run.ts";

const NOW = new Date("2026-11-10T12:00:00.000Z");
const later = (hours: number) => () => new Date(NOW.getTime() + hours * 3600_000);
// Fake on purpose, like every token in these tests.
const GH_TOKEN = "ghp_FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE";
const FP = createHash("sha256").update(GH_TOKEN).digest("hex").slice(0, 12);

// Another producer's inventory: one retired GitHub agent GhostGrant can check, one retired
// Slack bot whose credential has no fingerprint, an active agent and a retired GCP account
// that it can't, a finding of its own, and its own `x` data.
const INVENTORY = {
  schemaVersion: "0.1",
  generatedAt: "2026-11-09T08:00:00Z",
  producer: { name: "scope-drift-trimmer", version: "0.3.0" },
  identities: [
    {
      id: "github:app/1001",
      kind: "ai-agent",
      platform: "github",
      displayName: "Release Bot (old)",
      owner: { name: "Platform team", email: "platform@example.com" },
      status: "retired",
      retiredAt: "2026-11-01T00:00:00Z",
      credentials: [{ id: "pat-1", type: "personal-access-token", fingerprint: FP, location: "ci-secret" }],
      grants: [{ id: "g1", resource: "repo:example/api", permission: "contents:write", access: "write" }],
      tags: ["fake"],
    },
    {
      id: "slack:B0FAKE",
      kind: "bot",
      platform: "slack",
      displayName: "standup-bot",
      status: "retired",
      credentials: [{ id: "bot-token", type: "oauth-token" }],
    },
    { id: "github:app/1002", kind: "ai-agent", platform: "github", displayName: "live-bot", status: "active" },
    { id: "gcp:sa/fake", kind: "service-account", platform: "gcp", displayName: "gcp-sa", status: "retired" },
  ],
  findings: [
    { id: "f1", identityId: "github:app/1001", ruleId: "scope-drift-trimmer/unused-grant", severity: "medium", title: "Unused write grant" },
    { id: "f2", identityId: "github:app/1002", ruleId: "scope-drift-trimmer/unused-grant", severity: "low", title: "Not retired" },
  ],
  x: { "scope-drift-trimmer": { observationDays: 30, nested: { keep: [1, "two", null] } } },
};

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "ghostgrant-inv-"));
  const home = join(dir, "home");
  const write = (name: string, body: unknown) => {
    const p = join(dir, name);
    writeFileSync(p, typeof body === "string" ? body : JSON.stringify(body));
    return p;
  };
  const exec = async (argv: string[], opts: Partial<Context> = {}) => {
    let out = "";
    let err = "";
    const code = await run(argv, {
      out: (s) => (out += s),
      err: (s) => (err += s),
      home,
      now: () => NOW,
      mockResponses: {},
      fetch: () => assert.fail("no provider may be called"),
      readSecrets: async () => [],
      ...opts,
    });
    return { code, out, err };
  };
  const records = () => (existsSync(join(home, "records")) ? readdirSync(join(home, "records")) : []);
  const exported = async (flags: string[] = []) => {
    const r = await exec(["export", "--format", "inventory", ...flags]);
    assert.equal(r.code, 0, r.err);
    return JSON.parse(r.out) as Inventory;
  };
  return { home, write, exec, records, exported };
}

test("the vendored schema is v0.1 and the fixture is valid against it", () => {
  const schema = JSON.parse(readFileSync(new URL("../schemas/agent-inventory.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.$id, "https://ai-automation-tools.dev/schemas/agent-inventory/v0.1.json");
  assert.equal(validateInventory(INVENTORY), undefined);
});

test("the validator names the first error by path", () => {
  const bad = (patch: (d: typeof INVENTORY & Record<string, unknown>) => void) => {
    const d = structuredClone(INVENTORY) as typeof INVENTORY & Record<string, unknown>;
    patch(d);
    return validateInventory(d);
  };
  assert.equal(bad((d) => (d.schemaVersion = "0.2")), 'inventory.schemaVersion must be "0.1"');
  assert.equal(bad((d) => delete (d as Partial<typeof d>).producer), "inventory.producer is required");
  assert.equal(bad((d) => (d.extra = 1)), "inventory.extra is not allowed");
  assert.equal(bad((d) => (d.generatedAt = "yesterday")), "inventory.generatedAt must be a valid date-time");
  assert.equal(bad((d) => (d.identities[0].id = "no-colon")), "inventory.identities[0].id must match ^[a-z0-9-]+:.+$");
  assert.equal(
    bad((d) => (d.identities[1].credentials![0].type = "token")),
    "inventory.identities[1].credentials[0].type must be one of: api-key, oauth-token, personal-access-token, access-key, certificate, ssh-key, password, session, other",
  );
  assert.equal(bad((d) => (d.identities[0].owner!.email = "nobody")), "inventory.identities[0].owner.email must be a valid email");
  assert.equal(bad((d) => (d.identities[0].retiredAt = null as unknown as string)), undefined, "timestamps may be null");
  assert.equal(bad((d) => (d.x = [] as unknown as typeof d.x)), "inventory.x must be object");
});

test("import records each retired identity GhostGrant can check, and says why it skipped the rest", async () => {
  const s = sandbox();
  const r = await s.exec(["import", s.write("inv.json", INVENTORY)]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /Recorded 1 credential\(s\) for Release-Bot-old \(github:app\/1001\)/);
  assert.match(r.out, /Recorded 1 credential\(s\) for standup-bot \(slack:B0FAKE\)/);
  assert.match(r.out, /Skipped gcp:sa\/fake: GhostGrant doesn't check gcp credentials\./);
  assert.doesNotMatch(r.out, /live-bot/);
  assert.deepEqual(s.records().sort(), ["Release-Bot-old.json", "standup-bot.json"]);
  const rec = JSON.parse(readFileSync(join(s.home, "records", "Release-Bot-old.json"), "utf8"));
  assert.deepEqual(rec.credentials, [
    { provider: "github", type: "personal-access-token", prefix: "", hash: "inventory:pat-1", fingerprint: FP },
  ]);
  assert.deepEqual(rec.inventory.findings.map((f: { id: string }) => f.id), ["f1"]);

  // Importing the same file again changes nothing.
  const again = await s.exec(["import", s.write("inv.json", INVENTORY)]);
  assert.equal(again.code, 0, again.err);
  assert.match(again.out, /Skipped github:app\/1001: a decommission record for Release-Bot-old already exists\./);
});

test("an inventory with no retired identities records nothing", async () => {
  const s = sandbox();
  const r = await s.exec(["import", s.write("inv.json", { ...INVENTORY, identities: [], findings: [] })]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /No retired identities in the inventory\. Nothing was recorded\./);
  assert.deepEqual(s.records(), []);
});

for (const [name, body, message] of [
  ["an empty file", "", /The inventory is empty\./],
  ["malformed JSON", '{"schemaVersion": "0.1", "x": {"token": "' + GH_TOKEN, /The inventory is not valid JSON\./],
  ["a schema error", { ...INVENTORY, identities: [{ ...INVENTORY.identities[0], status: "gone" }] }, /inventory\.identities\[0\]\.status must be one of: active, disabled, retired, unknown\./],
  ["a missing field", { ...INVENTORY, producer: undefined }, /inventory\.producer is required\./],
  ["a raw secret in x", { ...INVENTORY, x: { other: { leaked: GH_TOKEN } } }, /inventory\.x\.other\.leaked looks like a raw secret/],
] as const) {
  test(`import rejects ${name}, exits non-zero, writes nothing and echoes no token`, async () => {
    const s = sandbox();
    const r = await s.exec(["import", s.write("bad.json", body)]);
    assert.equal(r.code, 1);
    assert.match(r.err, message);
    assert.match(r.err, /Nothing was recorded\.\n$/);
    assert.ok(!r.err.includes(GH_TOKEN) && !r.out.includes(GH_TOKEN), "the token was echoed");
    assert.deepEqual(s.records(), []);
  });
}

test("import and export need their arguments", async () => {
  const s = sandbox();
  assert.equal((await s.exec(["import"])).code, 1);
  assert.match((await s.exec(["import", join(s.home, "missing.json")])).err, /Can't read the inventory/);
  for (const argv of [["export"], ["export", "--format"], ["export", "--format", "csv"], ["export", "inventory"]]) {
    const r = await s.exec(argv);
    assert.equal(r.code, 1, argv.join(" "));
    assert.match(r.err, /Usage: ghostgrant export --format inventory/);
  }
});

test("check --live pairs an imported credential with its token by fingerprint and never prints it", async () => {
  const s = sandbox();
  await s.exec(["import", s.write("inv.json", INVENTORY)]);
  const calls: string[] = [];
  const r = await s.exec(["check", "--live"], {
    readSecrets: async () => ["ghp_FAKEsomethingelse", GH_TOKEN],
    fetch: async (url, init) => {
      calls.push(`${url} ${new Headers(init?.headers).get("authorization")}`);
      return new Response("{}", { status: 401 });
    },
  });
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(calls, [`https://api.github.com/user Bearer ${GH_TOKEN}`]);
  assert.match(r.out, new RegExp(`github .*${FP}\\s+dead\\n`));
  assert.match(r.out, /slack .*inventory:bot-token\s+unknown \(no prefix or fingerprint to pair a token with\)/);
  assert.ok(!r.out.includes(GH_TOKEN), "the token was echoed");
  for (const f of s.records()) assert.ok(!readFileSync(join(s.home, "records", f), "utf8").includes(GH_TOKEN));

  // The live dead answer becomes lastVerifiedDeadAt; the slack credential has none yet.
  const inv = await s.exported();
  assert.deepEqual(inv.identities[0].credentials, [
    { id: "pat-1", type: "personal-access-token", fingerprint: FP, location: "ci-secret", lastVerifiedDeadAt: NOW.toISOString() },
  ]);
  assert.deepEqual(inv.identities[1].credentials, [{ id: "bot-token", type: "oauth-token" }]);
  assert.ok(!JSON.stringify(inv).includes(GH_TOKEN));
});

test("export hands back the identities, other producers' findings and x keys unchanged", async () => {
  const s = sandbox();
  await s.exec(["import", s.write("inv.json", INVENTORY)]);
  const inv = await s.exported();
  assert.equal(validateInventory(inv), undefined);
  assert.equal(inv.generatedAt, NOW.toISOString());
  assert.equal(inv.producer.name, "ghost-grant");
  assert.deepEqual(inv.identities, [INVENTORY.identities[0], INVENTORY.identities[1]]);
  assert.deepEqual(inv.findings, [INVENTORY.findings[0]]);
  assert.deepEqual(inv.x, { ...INVENTORY.x, "ghost-grant": { source: "live" } });
});

test("a live answer on a retired credential is a critical finding; mock answers stay out of a live export", async () => {
  const s = sandbox();
  await s.exec(["import", s.write("inv.json", INVENTORY)]);
  await s.exec(["check", "--mock"]); // all dead
  const flip = await s.exec(["check", "--mock"], { now: later(25), mockResponses: { "inventory:pat-1": "alive" } });
  assert.match(flip.out, new RegExp(`ALERT: github personal-access-token ${FP} was dead at the initial check`));

  const mock = await s.exported(["--mock"]);
  assert.equal(validateInventory(mock), undefined);
  assert.equal(mock.identities[0].credentials![0].lastVerifiedDeadAt, NOW.toISOString());
  assert.equal(mock.identities[1].credentials![0].lastVerifiedDeadAt, later(25)().toISOString());
  const ours = mock.findings!.filter((f) => f.ruleId === RULE_STILL_LIVE);
  assert.equal(ours.length, 1);
  assert.equal(ours[0].identityId, "github:app/1001");
  assert.equal(ours[0].severity, "critical");
  assert.match(ours[0].evidence!, /answered alive at the 24h check .*canned mock responses/);
  assert.deepEqual(mock.x!["ghost-grant"], { source: "mock" });

  const live = await s.exported();
  assert.ok(live.identities.every((i) => i.credentials!.every((c) => c.lastVerifiedDeadAt === undefined)));
  assert.ok(!live.findings!.some((f) => f.ruleId === RULE_STILL_LIVE));
});

test("a record decommissioned from a manifest exports as a schema-valid identity without its hashes", async () => {
  const s = sandbox();
  const hash = "sha256:" + "a".repeat(64);
  const manifest = `agent: billing-bot\ncredentials:\n  - provider: github\n    type: personal-access-token\n    prefix: ghp_FAKE\n    hash: ${hash}\n  - provider: github\n    type: fine-grained-token\n    prefix: github_pat_\n    hash: sha256:${"b".repeat(64)}\n`;
  await s.exec(["decommission", s.write("m.yaml", manifest)]);
  await s.exec(["check", "--mock"]);
  const inv = await s.exported(["--mock"]);
  assert.equal(validateInventory(inv), undefined);
  assert.deepEqual(inv.identities, [
    {
      id: "ghost-grant:billing-bot",
      kind: "ai-agent",
      platform: "github",
      displayName: "billing-bot",
      status: "retired",
      retiredAt: NOW.toISOString(),
      credentials: [
        { id: "github:ghp_FAKE:1", type: "personal-access-token", lastVerifiedDeadAt: NOW.toISOString() },
        { id: "github:github_pat_:2", type: "other", lastVerifiedDeadAt: NOW.toISOString() },
      ],
    },
  ]);
  assert.ok(!JSON.stringify(inv).includes("sha256:"), "hashes stay out of the export");
});

test("export validates what it writes: a record the schema can't hold fails without output", async () => {
  const s = sandbox();
  await s.exec(["import", s.write("inv.json", INVENTORY)]);
  const f = join(s.home, "records", "standup-bot.json");
  const rec = JSON.parse(readFileSync(f, "utf8"));
  rec.inventory.identity.kind = "robot"; // a hand-edited record
  writeFileSync(f, JSON.stringify(rec));
  const r = await s.exec(["export", "--format", "inventory"]);
  assert.equal(r.code, 1);
  assert.equal(r.out, "");
  assert.match(r.err, /Export failed the inventory schema: inventory\.identities\[1\]\.kind must be one of: .*Nothing was written\./);
});

test("report shows an imported credential by its fingerprint", async () => {
  const s = sandbox();
  await s.exec(["import", s.write("inv.json", INVENTORY)]);
  await s.exec(["check", "--mock"]);
  const r = await s.exec(["report", "Release-Bot-old", "--mock"]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, new RegExp(`github personal-access-token fingerprint ${FP}\\n`));
  const json = JSON.parse((await s.exec(["report", "Release-Bot-old", "--mock", "--json"])).out);
  assert.equal(json.credentials[0].fingerprint, FP);
});
