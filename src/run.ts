import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { text } from "node:stream/consumers";
import { ADAPTERS, type Status } from "./adapters.ts";
import { type Credential, looksLikeSecret, ManifestError, parseManifest } from "./manifest.ts";
import { loadRecords, writeRecord } from "./records.ts";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

const HELP = `ghostgrant ${version}

Usage:
  ghostgrant decommission <manifest.yaml>   Record a retired agent's credentials to verify
  ghostgrant check --mock                   Check every recorded credential against canned responses
  ghostgrant check --live                   Ask each provider, using tokens read from stdin (one per line)
  ghostgrant report <agent-name>            Print the status of every check for one agent
  ghostgrant --version                      Print the version
  ghostgrant --help                         Print this help

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

// The token for a credential is the one supplied token that starts with its prefix. No
// match, or more than one, leaves the credential unchecked rather than guessing.
async function liveStatus(c: Credential, tokens: string[], ctx: Context): Promise<string> {
  const adapter = ADAPTERS[c.provider];
  if (!adapter) return "unknown (no live adapter for this provider yet)";
  const matches = tokens.filter((t) => t.startsWith(c.prefix));
  if (matches.length === 0) return "unknown (no token on stdin matches this prefix)";
  if (matches.length > 1) return "unknown (more than one token on stdin matches this prefix)";
  return adapter(matches[0], ctx.fetch);
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
  for (const r of records) {
    ctx.out(`\n${r.agent} (decommissioned ${r.decommissionedAt})\n`);
    for (const c of r.credentials) {
      const status = live ? await liveStatus(c, tokens, ctx) : (ctx.mockResponses[c.hash] ?? "dead");
      ctx.out(`  ${c.provider.padEnd(16)} ${c.type.padEnd(24)} ${c.prefix.padEnd(12)} ${status}\n`);
    }
  }
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
  if (cmd === "report") {
    ctx.err("ghostgrant report is not built yet. See docs/ROADMAP.md.\n");
    return 1;
  }
  ctx.err(`Unknown command: ${cmd}\n\n${HELP}`);
  return 1;
}
