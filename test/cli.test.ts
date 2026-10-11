import { test } from "node:test";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run, type Status } from "../src/run.ts";

const NOW = new Date("2026-10-08T12:00:00.000Z");
// Obviously fake hashes. GhostGrant only checks their format.
const HASH_A = "sha256:" + "a".repeat(64);
const HASH_B = "sha256:" + "b".repeat(64);

const VALID = `agent: billing-bot
credentials:
  - provider: github
    type: personal-access-token
    prefix: ghp_FAKE
    hash: ${HASH_A}
  - provider: slack
    type: bot-token
    prefix: xoxb-FAKE
    hash: ${HASH_B}
`;

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "ghostgrant-test-"));
  const home = join(dir, "home");
  const write = (name: string, text: string) => {
    const p = join(dir, name);
    writeFileSync(p, text);
    return p;
  };
  const exec = (argv: string[], mockResponses: Record<string, Status> = {}) => {
    let out = "";
    let err = "";
    const code = run(argv, { out: (s) => (out += s), err: (s) => (err += s), home, now: () => NOW, mockResponses });
    return { code, out, err };
  };
  const records = () => (existsSync(join(home, "records")) ? readdirSync(join(home, "records")) : []);
  return { home, write, exec, records };
}

test("--version prints the package version", () => {
  const r = sandbox().exec(["--version"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /^\d+\.\d+\.\d+\n$/);
});

test("no arguments prints help", () => {
  const r = sandbox().exec([]);
  assert.equal(r.code, 0);
  assert.match(r.out, /Usage:/);
});

test("report says it isn't built yet", () => {
  const r = sandbox().exec(["report", "billing-bot"]);
  assert.equal(r.code, 1);
  assert.match(r.err, /not built yet/);
});

test("an unknown command fails with help on stderr", () => {
  const r = sandbox().exec(["revoke"]);
  assert.equal(r.code, 1);
  assert.match(r.err, /Unknown command: revoke/);
});

test("decommission records a valid manifest with timestamp and checksum", () => {
  const s = sandbox();
  const r = s.exec(["decommission", s.write("m.yaml", VALID)]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /Recorded 2 credential\(s\) for billing-bot/);
  const rec = JSON.parse(readFileSync(join(s.home, "records", "billing-bot.json"), "utf8"));
  assert.equal(rec.agent, "billing-bot");
  assert.equal(rec.decommissionedAt, NOW.toISOString());
  assert.equal(rec.manifestSha256, createHash("sha256").update(VALID).digest("hex"));
  assert.deepEqual(rec.credentials[0], { provider: "github", type: "personal-access-token", prefix: "ghp_FAKE", hash: HASH_A });
});

test("decommission refuses to overwrite an existing record", () => {
  const s = sandbox();
  const m = s.write("m.yaml", VALID);
  assert.equal(s.exec(["decommission", m]).code, 0);
  const r = s.exec(["decommission", m]);
  assert.equal(r.code, 1);
  assert.match(r.err, /already exists/);
});

for (const [name, text, why] of [
  ["malformed YAML", "agent: billing-bot\ncredentials: [\n", /not valid YAML \(line \d+, column \d+\)/],
  ["an empty file", "", /empty/],
  ["a comment-only file", "# nothing here\n", /empty/],
  ["no credentials", "agent: billing-bot\ncredentials: []\n", /at least one entry/],
  ["an unknown provider", VALID.replace("provider: slack", "provider: stripe"), /credentials\[1\]\.provider must be one of/],
  ["a bad hash", VALID.replace(HASH_B, "sha256:nothex"), /credentials\[1\]\.hash/],
  ["a missing type", VALID.replace("    type: bot-token\n", ""), /credentials\[1\]\.type/],
  ["an agent name with a slash", VALID.replace("billing-bot", "../evil"), /agent must be/],
] as const) {
  test(`decommission rejects ${name} and writes nothing`, () => {
    const s = sandbox();
    const r = s.exec(["decommission", s.write("m.yaml", text)]);
    assert.equal(r.code, 1);
    assert.match(r.err, why);
    assert.match(r.err, /Nothing was recorded/);
    assert.deepEqual(s.records(), []);
  });
}

// Fake on purpose: right shape, wrong checksums, no real provider would accept them.
// Each entry swaps one line of VALID for one carrying a secret-shaped value.
const FAKE_SECRETS = [
  ["prefix", "prefix: ghp_FAKE", "ghp_FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE"],
  ["hash", `hash: ${HASH_B}`, "xoxb-FAKE-FAKE-FAKEFAKEFAKE"],
  ["type", "type: bot-token", "FAKEfakeFAKEfakeFAKEfakeFAKEfakeFAKEfake"],
  ["agent", "agent: billing-bot", "github_pat_FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE"],
] as const;

for (const [field, line, secret] of FAKE_SECRETS) {
  test(`decommission rejects a raw secret in ${field} without echoing it`, () => {
    const s = sandbox();
    const r = s.exec(["decommission", s.write("m.yaml", VALID.replace(line, `${field}: "${secret}"`))]);
    assert.equal(r.code, 1);
    assert.match(r.err, /looks like a raw secret/);
    assert.ok(!r.err.includes(secret) && !r.out.includes(secret), "the secret was echoed");
    assert.deepEqual(s.records(), []);
  });
}

test("a secret inside malformed YAML is not echoed in the parse error", () => {
  const s = sandbox();
  const secret = FAKE_SECRETS[0][2];
  const r = s.exec(["decommission", s.write("m.yaml", `agent: [${secret}\n`)]);
  assert.equal(r.code, 1);
  assert.ok(!r.err.includes(secret));
});

test("a prefix longer than 12 characters is rejected", () => {
  const s = sandbox();
  const r = s.exec(["decommission", s.write("m.yaml", VALID.replace("prefix: ghp_FAKE", "prefix: ghp_FAKE12345678"))]);
  assert.equal(r.code, 1);
  assert.match(r.err, /prefix is longer than 12/);
  assert.ok(!r.err.includes("ghp_FAKE12345678"));
});

test("decommission with a missing file fails cleanly", () => {
  const r = sandbox().exec(["decommission", "no-such-manifest.yaml"]);
  assert.equal(r.code, 1);
  assert.match(r.err, /Can't read the manifest/);
});

test("check --mock with no records says so", () => {
  const r = sandbox().exec(["check", "--mock"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /No decommission records yet/);
});

test("check without --mock refuses until live adapters exist", () => {
  const r = sandbox().exec(["check"]);
  assert.equal(r.code, 1);
  assert.match(r.err, /--mock/);
});

test("check --mock prints canned alive/dead per credential", () => {
  const s = sandbox();
  s.exec(["decommission", s.write("m.yaml", VALID)]);
  const r = s.exec(["check", "--mock"], { [HASH_B]: "alive" });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /no provider was called/);
  assert.match(r.out, /billing-bot \(decommissioned 2026-10-08T12:00:00\.000Z\)/);
  assert.match(r.out, /github .*ghp_FAKE\s+dead\n/);
  assert.match(r.out, /slack .*xoxb-FAKE\s+alive\n/);
  assert.ok(!r.out.includes(HASH_A), "hashes stay out of the check output");
});
