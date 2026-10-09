import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { looksLikeSecret, ManifestError, parseManifest } from "./manifest.ts";
import { loadRecords, writeRecord } from "./records.ts";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

const HELP = `ghostgrant ${version}

Usage:
  ghostgrant decommission <manifest.yaml>   Record a retired agent's credentials to verify
  ghostgrant check --mock                   Check every recorded credential against canned responses
  ghostgrant report <agent-name>            Print the status of every check for one agent
  ghostgrant --version                      Print the version
  ghostgrant --help                         Print this help

Records are kept in $GHOSTGRANT_HOME (default ~/.ghostgrant).
`;

export type Status = "alive" | "dead" | "unknown";

export type Context = {
  out: (s: string) => void;
  err: (s: string) => void;
  home: string; // where records live
  now: () => Date;
  // Canned answers for --mock, keyed by credential hash. Anything not listed answers dead.
  mockResponses: Record<string, Status>;
};

const defaultContext: Context = {
  out: (s) => process.stdout.write(s),
  err: (s) => process.stderr.write(s),
  home: process.env.GHOSTGRANT_HOME || join(homedir(), ".ghostgrant"),
  now: () => new Date(),
  mockResponses: {},
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

function check(flags: string[], ctx: Context): number {
  if (!flags.includes("--mock")) {
    ctx.err("Live provider checks aren't built yet. Run ghostgrant check --mock.\n");
    return 1;
  }
  const records = loadRecords(ctx.home);
  if (records.length === 0) {
    ctx.out("No decommission records yet. Run ghostgrant decommission <manifest.yaml> first.\n");
    return 0;
  }
  ctx.out("Mock mode: canned responses, no provider was called.\n");
  for (const r of records) {
    ctx.out(`\n${r.agent} (decommissioned ${r.decommissionedAt})\n`);
    for (const c of r.credentials)
      ctx.out(`  ${c.provider.padEnd(16)} ${c.type.padEnd(24)} ${c.prefix.padEnd(12)} ${ctx.mockResponses[c.hash] ?? "dead"}\n`);
  }
  return 0;
}

// Returns the process exit code. Kept free of process.exit so tests can call it.
export function run(argv: string[], ctx: Context = defaultContext): number {
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
