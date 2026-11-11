import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { text } from "node:stream/consumers";
import { ADAPTERS, type Status } from "./adapters.ts";
import { exportInventory, InventoryError, parseInventory, recordsFromInventory, validateInventory } from "./inventory.ts";
import { type Credential, looksLikeSecret, ManifestError, parseManifest } from "./manifest.ts";
import {
  appendAlert,
  type CheckResult,
  type DecommissionRecord,
  dueWindow,
  loadRecords,
  nextWindow,
  saveRecord,
  writeRecord,
} from "./records.ts";
import { buildReport, formatReport } from "./report.ts";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

const HELP = `ghostgrant ${version}

Usage:
  ghostgrant decommission <manifest.yaml>   Record a retired agent's credentials to verify
  ghostgrant import <inventory.json>        Record every retired identity in an Agent Security
                                            Suite inventory (schema v0.1)
  ghostgrant check --mock                   Run every check that's due against canned responses
  ghostgrant check --live                   Run every check that's due, asking each provider with
                                            tokens read from stdin (one per line)
  ghostgrant report <agent-name>            Print every live check for one agent and what it found
                                            (--mock for the mock checks, --json for JSON)
  ghostgrant export --format inventory      Print every record as an Agent Security Suite
                                            inventory (--mock for the mock checks)
  ghostgrant --version                      Print the version
  ghostgrant --help                         Print this help

Checks fall due at decommission, then 24h, 7d, 30d and 90d after it. A credential that
goes from dead to alive is printed as an ALERT and logged to $GHOSTGRANT_HOME/alerts.log.
Records are kept in $GHOSTGRANT_HOME (default ~/.ghostgrant).
`;

export type { Status };

export type Context = {
  out: (s: string) => void;
  err: (s: string) => void;
  home: string; // where records live
  now: () => Date;
  // Canned answers for --mock, keyed by credential hash. Anything not listed answers dead.
  mockResponses: Record<string, Status>;
  fetch: typeof fetch;
  // Tokens for --live, one per line. Held in memory for one run and never written anywhere.
  readSecrets: () => Promise<string[]>;
};

const defaultContext: Context = {
  out: (s) => process.stdout.write(s),
  err: (s) => process.stderr.write(s),
  home: process.env.GHOSTGRANT_HOME || join(homedir(), ".ghostgrant"),
  now: () => new Date(),
  mockResponses: {},
  fetch: (...args) => fetch(...args),
  readSecrets: async () => {
    if (process.stdin.isTTY) process.stderr.write("Paste the tokens to check, one per line, then Ctrl-D.\n");
    return (await text(process.stdin)).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  },
};

function decommission(path: string | undefined, ctx: Context): number {
  if (!path) {
    ctx.err("Usage: ghostgrant decommission <manifest.yaml>\n");
    return 1;
  }
  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch {
    ctx.err(looksLikeSecret(path) ? "Can't read the manifest.\n" : `Can't read the manifest at ${path}.\n`);
    return 1;
  }
  let manifest;
  try {
    manifest = parseManifest(bytes.toString("utf8"));
  } catch (e) {
    if (!(e instanceof ManifestError)) throw e;
    ctx.err(`Manifest rejected: ${e.message} Nothing was recorded.\n`);
    return 1;
  }
  try {
    const file = writeRecord(ctx.home, {
      agent: manifest.agent,
      decommissionedAt: ctx.now().toISOString(),
      manifestSha256: createHash("sha256").update(bytes).digest("hex"),
      credentials: manifest.credentials,
    });
    ctx.out(`Recorded ${manifest.credentials.length} credential(s) for ${manifest.agent} in ${file}\n`);
    return 0;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    ctx.err(`A decommission record for ${manifest.agent} already exists. Nothing was recorded.\n`);
    return 1;
  }
}

const label = (c: Credential) => c.prefix || c.fingerprint || c.hash;
const sha256 = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

// The token for a credential is the one supplied token that starts with its prefix, or for
// an imported credential, whose SHA-256 starts with its fingerprint. No match, or more than
// one, leaves the credential unchecked rather than guessing.
async function liveStatus(c: Credential, tokens: string[], ctx: Context): Promise<[Status, string?]> {
  const adapter = ADAPTERS[c.provider];
  if (!adapter) return ["unknown", "no live adapter for this provider yet"];
  if (!c.prefix && !c.fingerprint) return ["unknown", "no prefix or fingerprint to pair a token with"];
  const fp = c.fingerprint?.toLowerCase();
  const matches = tokens.filter((t) => (c.prefix ? t.startsWith(c.prefix) : sha256(t).startsWith(fp!)));
  if (matches.length === 0) return ["unknown", `no token on stdin matches this ${c.prefix ? "prefix" : "fingerprint"}`];
  if (matches.length > 1) return ["unknown", "more than one token on stdin matches this prefix"];
  return [await adapter(matches[0], ctx.fetch)];
}

// Checks every credential the record's latest due window hasn't settled yet. A settled
// credential has an alive or dead answer for that window; unknown gets asked again next run.
async function checkRecord(r: DecommissionRecord, source: CheckResult["source"], tokens: string[], ctx: Context) {
  const now = ctx.now();
  const window = dueWindow(r, now);
  const history = (r.checks ?? []).filter((c) => c.source === source);
  const settled = (hash: string) =>
    history.some((c) => c.window === window && c.hash === hash && c.status !== "unknown");
  const todo = window ? r.credentials.filter((c) => !settled(c.hash)) : [];
  if (!window || todo.length === 0) {
    const next = nextWindow(r, now);
    ctx.out(`\n${r.agent}: nothing due. ${next ? `Next check (${next.window}) at ${next.dueAt}.` : "Every window has been checked."}\n`);
    return;
  }
  ctx.out(`\n${r.agent} (decommissioned ${r.decommissionedAt}), ${window} check\n`);
  const checks = [...(r.checks ?? [])];
  for (const c of todo) {
    const [status, note] = source === "live" ? await liveStatus(c, tokens, ctx) : [ctx.mockResponses[c.hash] ?? "dead"];
    const at = now.toISOString();
    ctx.out(`  ${c.provider.padEnd(16)} ${c.type.padEnd(24)} ${label(c).padEnd(12)} ${status}${note ? ` (${note})` : ""}\n`);
    // A flip is alive now after the last definite answer was dead; unknowns in between don't count.
    const last = history.findLast((h) => h.hash === c.hash && h.status !== "unknown");
    if (last?.status === "dead" && status === "alive") {
      appendAlert(ctx.home, { at, agent: r.agent, window, source, provider: c.provider, type: c.type, prefix: label(c) });
      ctx.out(`  ALERT: ${c.provider} ${c.type} ${label(c)} was dead at the ${last.window} check and is alive again.\n`);
    }
    checks.push({ window, checkedAt: at, source, hash: c.hash, status });
  }
  saveRecord(ctx.home, { ...r, checks });
}

async function check(flags: string[], ctx: Context): Promise<number> {
  const mock = flags.includes("--mock");
  const live = flags.includes("--live");
  if (mock === live) {
    ctx.err("Run ghostgrant check --mock for canned responses, or ghostgrant check --live to ask each provider.\n");
    return 1;
  }
  const records = loadRecords(ctx.home);
  if (records.length === 0) {
    ctx.out("No decommission records yet. Run ghostgrant decommission <manifest.yaml> first.\n");
    return 0;
  }
  const tokens = live ? await ctx.readSecrets() : [];
  ctx.out(live ? "Live mode: asking each provider. Tokens are not stored.\n" : "Mock mode: canned responses, no provider was called.\n");
  for (const r of records) await checkRecord(r, live ? "live" : "mock", tokens, ctx);
  return 0;
}

function report(args: string[], ctx: Context): number {
  const agent = args.find((a) => !a.startsWith("--"));
  if (!agent) {
    ctx.err("Usage: ghostgrant report <agent-name> [--mock] [--json]\n");
    return 1;
  }
  const record = loadRecords(ctx.home).find((r) => r.agent === agent);
  if (!record) {
    ctx.err(looksLikeSecret(agent) ? "No decommission record for that agent.\n" : `No decommission record for ${agent}.\n`);
    return 1;
  }
  const r = buildReport(record, args.includes("--mock") ? "mock" : "live", ctx.now());
  ctx.out(args.includes("--json") ? JSON.stringify(r, null, 2) + "\n" : formatReport(r));
  return 0;
}

// Records each retired identity GhostGrant can check. One already recorded is left alone,
// so importing the same inventory twice changes nothing.
function importInventory(path: string | undefined, ctx: Context): number {
  if (!path) {
    ctx.err("Usage: ghostgrant import <inventory.json>\n");
    return 1;
  }
  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch {
    ctx.err(looksLikeSecret(path) ? "Can't read the inventory.\n" : `Can't read the inventory at ${path}.\n`);
    return 1;
  }
  let inv;
  try {
    inv = parseInventory(bytes.toString("utf8"));
  } catch (e) {
    if (!(e instanceof InventoryError)) throw e;
    ctx.err(`Inventory rejected: ${e.message} Nothing was recorded.\n`);
    return 1;
  }
  const { records, skipped } = recordsFromInventory(inv, sha256(bytes), ctx.now());
  for (const r of records) {
    try {
      const file = writeRecord(ctx.home, r);
      ctx.out(`Recorded ${r.credentials.length} credential(s) for ${r.agent} (${r.inventory!.identity.id}) in ${file}\n`);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      ctx.out(`Skipped ${r.inventory!.identity.id}: a decommission record for ${r.agent} already exists.\n`);
    }
  }
  for (const s of skipped) ctx.out(`Skipped ${s}\n`);
  if (records.length + skipped.length === 0) ctx.out("No retired identities in the inventory. Nothing was recorded.\n");
  return 0;
}

function exportCmd(args: string[], ctx: Context): number {
  const f = args.indexOf("--format");
  if (f < 0 || args[f + 1] !== "inventory") {
    ctx.err("Usage: ghostgrant export --format inventory [--mock]\n");
    return 1;
  }
  const doc = exportInventory(loadRecords(ctx.home), args.includes("--mock") ? "mock" : "live", ctx.now(), version);
  const e = validateInventory(doc);
  if (e) {
    ctx.err(`Export failed the inventory schema: ${e}. Nothing was written.\n`);
    return 1;
  }
  ctx.out(JSON.stringify(doc, null, 2) + "\n");
  return 0;
}

// Returns the process exit code. Kept free of process.exit so tests can call it.
export async function run(argv: string[], ctx: Context = defaultContext): Promise<number> {
  const [cmd, ...rest] = argv;
  if (cmd === undefined || cmd === "--help" || cmd === "-h") {
    ctx.out(HELP);
    return 0;
  }
  if (cmd === "--version" || cmd === "-v") {
    ctx.out(`${version}\n`);
    return 0;
  }
  if (cmd === "decommission") return decommission(rest[0], ctx);
  if (cmd === "check") return check(rest, ctx);
  if (cmd === "report") return report(rest, ctx);
  if (cmd === "import") return importInventory(rest[0], ctx);
  if (cmd === "export") return exportCmd(rest, ctx);
  ctx.err(`Unknown command: ${cmd}\n\n${HELP}`);
  return 1;
}
