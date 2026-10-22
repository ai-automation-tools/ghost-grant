import { test } from "node:test";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run, type Context } from "../src/run.ts";

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
  return { home, write, exec, records };
}

test("--version prints the package version", async () => {
  const r = await sandbox().exec(["--version"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /^\d+\.\d+\.\d+\n$/);
});

test("no arguments prints help", async () => {
  const r = await sandbox().exec([]);
  assert.equal(r.code, 0);
  assert.match(r.out, /Usage:/);
});

test("report says it isn't built yet", async () => {
  const r = await sandbox().exec(["report", "billing-bot"]);
  assert.equal(r.code, 1);
  assert.match(r.err, /not built yet/);
});

test("an unknown command fails with help on stderr", async () => {
  const r = await sandbox().exec(["revoke"]);
  assert.equal(r.code, 1);
  assert.match(r.err, /Unknown command: revoke/);
});

test("decommission records a valid manifest with timestamp and checksum", async () => {
  const s = sandbox();
  const r = await s.exec(["decommission", s.write("m.yaml", VALID)]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /Recorded 2 credential\(s\) for billing-bot/);
  const rec = JSON.parse(readFileSync(join(s.home, "records", "billing-bot.json"), "utf8"));
  assert.equal(rec.agent, "billing-bot");
  assert.equal(rec.decommissionedAt, NOW.toISOString());
  assert.equal(rec.manifestSha256, createHash("sha256").update(VALID).digest("hex"));
  assert.deepEqual(rec.credentials[0], { provider: "github", type: "personal-access-token", prefix: "ghp_FAKE", hash: HASH_A });
});

test("decommission refuses to overwrite an existing record", async () => {
  const s = sandbox();
  const m = s.write("m.yaml", VALID);
  assert.equal((await s.exec(["decommission", m])).code, 0);
  const r = await s.exec(["decommission", m]);
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
  test(`decommission rejects ${name} and writes nothing`, async () => {
    const s = sandbox();
    const r = await s.exec(["decommission", s.write("m.yaml", text)]);
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
  test(`decommission rejects a raw secret in ${field} without echoing it`, async () => {
    const s = sandbox();
    const r = await s.exec(["decommission", s.write("m.yaml", VALID.replace(line, `${field}: "${secret}"`))]);
    assert.equal(r.code, 1);
    assert.match(r.err, /looks like a raw secret/);
    assert.ok(!r.err.includes(secret) && !r.out.includes(secret), "the secret was echoed");
    assert.deepEqual(s.records(), []);
  });
}

test("a secret inside malformed YAML is not echoed in the parse error", async () => {
  const s = sandbox();
  const secret = FAKE_SECRETS[0][2];
  const r = await s.exec(["decommission", s.write("m.yaml", `agent: [${secret}\n`)]);
  assert.equal(r.code, 1);
  assert.ok(!r.err.includes(secret));
});

test("a prefix longer than 12 characters is rejected", async () => {
  const s = sandbox();
  const r = await s.exec(["decommission", s.write("m.yaml", VALID.replace("prefix: ghp_FAKE", "prefix: ghp_FAKE12345678"))]);
  assert.equal(r.code, 1);
  assert.match(r.err, /prefix is longer than 12/);
  assert.ok(!r.err.includes("ghp_FAKE12345678"));
});

test("decommission with a missing file fails cleanly", async () => {
  const r = await sandbox().exec(["decommission", "no-such-manifest.yaml"]);
  assert.equal(r.code, 1);
  assert.match(r.err, /Can't read the manifest/);
});

test("check --mock with no records says so", async () => {
  const r = await sandbox().exec(["check", "--mock"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /No decommission records yet/);
});

test("check needs exactly one of --mock or --live", async () => {
  for (const argv of [["check"], ["check", "--mock", "--live"]]) {
    const r = await sandbox().exec(argv);
    assert.equal(r.code, 1);
    assert.match(r.err, /--mock.*--live/);
  }
});

test("check --mock prints canned alive/dead per credential", async () => {
  const s = sandbox();
  await s.exec(["decommission", s.write("m.yaml", VALID)]);
  const r = await s.exec(["check", "--mock"], { mockResponses: { [HASH_B]: "alive" } });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /no provider was called/);
  assert.match(r.out, /billing-bot \(decommissioned 2026-10-08T12:00:00\.000Z\)/);
  assert.match(r.out, /github .*ghp_FAKE\s+dead\n/);
  assert.match(r.out, /slack .*xoxb-FAKE\s+alive\n/);
  assert.ok(!r.out.includes(HASH_A), "hashes stay out of the check output");
});

// Fake on purpose, shaped like a classic PAT so the prefix match is realistic.
const LIVE_TOKEN = "ghp_FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE";

test("check --live sends the matching stdin token to GitHub and never prints it", async () => {
  const s = sandbox();
  await s.exec(["decommission", s.write("m.yaml", VALID)]);
  const calls: string[] = [];
  const r = await s.exec(["check", "--live"], {
    readSecrets: async () => [LIVE_TOKEN],
    fetch: async (url, init) => {
      calls.push(`${url} ${new Headers(init?.headers).get("authorization")}`);
      return new Response("{}", { status: 401 });
    },
  });
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(calls, [`https://api.github.com/user Bearer ${LIVE_TOKEN}`]);
  assert.match(r.out, /github .*ghp_FAKE\s+dead\n/);
  assert.match(r.out, /slack .*unknown \(no live adapter/);
  assert.ok(!r.out.includes(LIVE_TOKEN) && !r.err.includes(LIVE_TOKEN), "the token was echoed");
  assert.ok(!readFileSync(join(s.home, "records", "billing-bot.json"), "utf8").includes(LIVE_TOKEN));
});

test("check --live without a matching token reports unknown and calls nobody", async () => {
  const s = sandbox();
  await s.exec(["decommission", s.write("m.yaml", VALID)]);
  for (const tokens of [[], [LIVE_TOKEN, LIVE_TOKEN + "2"]]) {
    const r = await s.exec(["check", "--live"], { readSecrets: async () => tokens });
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /github .*ghp_FAKE\s+unknown \((no|more than one) token/);
  }
});

const HOUR = 3600_000;
const at = (hours: number) => () => new Date(NOW.getTime() + hours * HOUR);
const record = (home: string) => JSON.parse(readFileSync(join(home, "records", "billing-bot.json"), "utf8"));
const alerts = (home: string) =>
  existsSync(join(home, "alerts.log")) ? readFileSync(join(home, "alerts.log"), "utf8").split("\n").filter(Boolean) : [];

test("check re-checks a record once its 24h window has passed", async () => {
  const s = sandbox();
  await s.exec(["decommission", s.write("m.yaml", VALID)]);
  assert.match((await s.exec(["check", "--mock"])).out, /billing-bot .*initial check\n/);
  const r = await s.exec(["check", "--mock"], { now: at(25) });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /billing-bot .*24h check\n/);
  assert.match(r.out, /github .*ghp_FAKE\s+dead\n/);
  const checks = record(s.home).checks;
  assert.deepEqual(checks.map((c: { window: string }) => c.window), ["initial", "initial", "24h", "24h"]);
  assert.equal(checks[2].checkedAt, at(25)().toISOString());
  assert.equal(checks[2].source, "mock");
});

test("check skips a record whose next window isn't due", async () => {
  const s = sandbox();
  await s.exec(["decommission", s.write("m.yaml", VALID)]);
  await s.exec(["check", "--mock"]);
  const before = record(s.home);
  const r = await s.exec(["check", "--mock"], { now: at(23) });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /billing-bot: nothing due\. Next check \(24h\) at 2026-10-09T12:00:00\.000Z\./);
  assert.doesNotMatch(r.out, /github/);
  assert.deepEqual(record(s.home), before);
});

test("a missed window is skipped for the latest one that's due", async () => {
  const s = sandbox();
  await s.exec(["decommission", s.write("m.yaml", VALID)]);
  const r = await s.exec(["check", "--mock"], { now: at(8 * 24) });
  assert.match(r.out, /7d check\n/);
  assert.deepEqual(new Set(record(s.home).checks.map((c: { window: string }) => c.window)), new Set(["7d"]));
});

test("a dead credential that comes back alive raises exactly one alert", async () => {
  const s = sandbox();
  await s.exec(["decommission", s.write("m.yaml", VALID)]);
  assert.doesNotMatch((await s.exec(["check", "--mock"])).out, /ALERT/);
  const flipped = await s.exec(["check", "--mock"], { now: at(25), mockResponses: { [HASH_A]: "alive" } });
  assert.match(flipped.out, /ALERT: github personal-access-token ghp_FAKE was dead at the initial check and is alive again\./);
  // Still alive a week later: no new flip, so no new alert.
  const still = await s.exec(["check", "--mock"], { now: at(7 * 24), mockResponses: { [HASH_A]: "alive" } });
  assert.doesNotMatch(still.out, /ALERT/);
  const log = alerts(s.home);
  assert.equal(log.length, 1);
  assert.deepEqual(JSON.parse(log[0]), {
    at: at(25)().toISOString(),
    agent: "billing-bot",
    window: "24h",
    source: "mock",
    provider: "github",
    type: "personal-access-token",
    prefix: "ghp_FAKE",
  });
  assert.ok(!log[0].includes(HASH_A), "hashes stay out of the alert log");
});

test("an unknown answer is asked again in the same window, and doesn't hide a flip", async () => {
  const s = sandbox();
  await s.exec(["decommission", s.write("m.yaml", VALID)]);
  await s.exec(["check", "--mock"]); // both dead
  const unknown = await s.exec(["check", "--mock"], { now: at(25), mockResponses: { [HASH_A]: "unknown" } });
  assert.match(unknown.out, /github .*ghp_FAKE\s+unknown\n/);
  const retry = await s.exec(["check", "--mock"], { now: at(26), mockResponses: { [HASH_A]: "alive" } });
  assert.match(retry.out, /24h check\n/);
  assert.match(retry.out, /github .*ghp_FAKE\s+alive\n/);
  assert.doesNotMatch(retry.out, /slack/, "slack was settled at 24h and isn't asked again");
  assert.match(retry.out, /ALERT: github .*dead at the initial check/);
  assert.equal(alerts(s.home).length, 1);
});

test("live and mock answers keep separate histories", async () => {
  const s = sandbox();
  await s.exec(["decommission", s.write("m.yaml", VALID)]);
  await s.exec(["check", "--mock"]);
  const r = await s.exec(["check", "--live"], {
    readSecrets: async () => [LIVE_TOKEN],
    fetch: async () => new Response("{}", { status: 200 }),
  });
  assert.match(r.out, /initial check\n/);
  assert.doesNotMatch(r.out, /ALERT/, "a canned dead answer can't set up a live flip");
  assert.ok(!readFileSync(join(s.home, "records", "billing-bot.json"), "utf8").includes(LIVE_TOKEN));
});

test("after the 90d window every check is done", async () => {
  const s = sandbox();
  await s.exec(["decommission", s.write("m.yaml", VALID)]);
  await s.exec(["check", "--mock"], { now: at(91 * 24) });
  const r = await s.exec(["check", "--mock"], { now: at(200 * 24) });
  assert.match(r.out, /billing-bot: nothing due\. Every window has been checked\./);
});
