import type { Status } from "./adapters.ts";
import type { Provider } from "./manifest.ts";
import { type CheckResult, type DecommissionRecord, nextWindow, type Window } from "./records.ts";

// What a report concludes, from one source's answers:
// clean        every credential answered dead at every window checked, through 90d
// dead-so-far  every answer so far is dead, and windows are still to come
// unknown      some checked window has no alive or dead answer for a credential
// alive        some credential's latest definite answer is alive
// flipped      some credential went from dead back to alive
// not-checked  no checks from this source yet
export type Verdict = "clean" | "dead-so-far" | "unknown" | "alive" | "flipped" | "not-checked";

export type ReportCheck = {
  window: Window;
  checkedAt: string; // ISO 8601
  status: Status;
  flip: boolean; // alive after the last definite answer was dead
};

export type ReportCredential = {
  provider: Provider;
  type: string;
  prefix: string;
  checks: ReportCheck[]; // every attempt, oldest first, unknowns included
};

// The one report shape. `ghostgrant report --json` prints it and the site/ demo renders it.
// Hashes are left out, like the check output and the alert log.
export type Report = {
  agent: string;
  generatedAt: string; // ISO 8601
  source: CheckResult["source"];
  decommissionedAt: string;
  manifestSha256: string;
  credentials: ReportCredential[];
  next?: { window: Window; dueAt: string }; // absent once 90d has passed
  verdict: Verdict;
};

export function buildReport(r: DecommissionRecord, source: CheckResult["source"], now: Date): Report {
  const history = (r.checks ?? []).filter((c) => c.source === source);
  const next = nextWindow(r, now);
  // Every window this source checked needs a definite answer from each credential.
  const windows = [...new Set(history.map((c) => c.window))];
  let flipped = false;
  let alive = false;
  let unknown = false;
  const credentials = r.credentials.map((cred) => {
    let last: Status | undefined;
    const checks = history
      .filter((c) => c.hash === cred.hash)
      .map((c) => {
        const flip = last === "dead" && c.status === "alive";
        if (c.status !== "unknown") last = c.status;
        flipped ||= flip;
        return { window: c.window, checkedAt: c.checkedAt, status: c.status, flip };
      });
    alive ||= last === "alive";
    unknown ||= windows.some((w) => !checks.some((c) => c.window === w && c.status !== "unknown"));
    return { provider: cred.provider, type: cred.type, prefix: cred.prefix, checks };
  });
  const verdict: Verdict =
    history.length === 0 ? "not-checked"
    : flipped ? "flipped"
    : alive ? "alive"
    : unknown ? "unknown"
    : windows.includes("90d") ? "clean"
    : "dead-so-far";
  return {
    agent: r.agent,
    generatedAt: now.toISOString(),
    source,
    decommissionedAt: r.decommissionedAt,
    manifestSha256: r.manifestSha256,
    credentials,
    ...(next && { next }),
    verdict,
  };
}

const VERDICT_TEXT: Record<Verdict, (r: Report) => string> = {
  clean: () => "Every credential answered dead at every window checked, through 90d.",
  "dead-so-far": (r) =>
    "Every credential has answered dead so far. " +
    (r.next ? `Next check (${r.next.window}) at ${r.next.dueAt}.` : "The 90d check is due: run ghostgrant check."),
  unknown: () => "Not clean: a credential has no alive or dead answer for a window that was checked. Unknown is not dead.",
  alive: () => "Not clean: a credential still answers alive.",
  flipped: () => "Not clean: a credential went from dead back to alive.",
  "not-checked": (r) =>
    `No ${r.source} checks yet. Run ghostgrant check --${r.source}` +
    (r.source === "live" ? `, or ghostgrant report ${r.agent} --mock for the mock checks.` : "."),
};

export function formatReport(r: Report): string {
  const lines = [
    `GhostGrant report: ${r.agent}`,
    `Generated ${r.generatedAt} from ${r.source === "mock" ? "mock checks (canned responses, no provider was called)" : "live checks"}`,
    `Decommissioned ${r.decommissionedAt}, manifest sha256 ${r.manifestSha256}`,
  ];
  for (const c of r.credentials) {
    lines.push("", `${c.provider} ${c.type} ${c.prefix}`);
    if (c.checks.length === 0) lines.push("  not checked yet");
    for (const k of c.checks) {
      lines.push(`  ${k.window.padEnd(8)} ${k.checkedAt}  ${k.status}${k.flip ? "  FLIP: was dead, alive again" : ""}`);
    }
  }
  lines.push("", VERDICT_TEXT[r.verdict](r));
  return lines.join("\n") + "\n";
}
