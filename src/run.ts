import { createRequire } from "node:module";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

const HELP = `ghostgrant ${version}

Usage:
  ghostgrant decommission <manifest.yaml>   Record a retired agent's credentials to verify
  ghostgrant check [--mock]                 Re-check every credential that is due
  ghostgrant report <agent-name>            Print the status of every check for one agent
  ghostgrant --version                      Print the version
  ghostgrant --help                         Print this help
`;

const PLANNED = new Set(["decommission", "check", "report"]);

type Io = { out: (s: string) => void; err: (s: string) => void };

const defaultIo: Io = {
  out: (s) => process.stdout.write(s),
  err: (s) => process.stderr.write(s),
};

// Returns the process exit code. Kept free of process.exit so tests can call it.
export function run(argv: string[], io: Io = defaultIo): number {
  const [cmd] = argv;
  if (cmd === undefined || cmd === "--help" || cmd === "-h") {
    io.out(HELP);
    return 0;
  }
  if (cmd === "--version" || cmd === "-v") {
    io.out(`${version}\n`);
    return 0;
  }
  if (PLANNED.has(cmd)) {
    io.err(`ghostgrant ${cmd} is not built yet. See docs/ROADMAP.md.\n`);
    return 1;
  }
  io.err(`Unknown command: ${cmd}\n\n${HELP}`);
  return 1;
}
