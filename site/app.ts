// The demo page. It renders the bundled report with the CLI's own Report type, so the page
// can't drift from `ghostgrant report --json`. Type-only imports: nothing from src/ runs here.
import type { Report, Verdict } from "../src/report.ts";

const VERDICT_TEXT: Record<Verdict, string> = {
  clean: "Clean: every credential answered dead at every window checked, through 90d.",
  "dead-so-far": "Dead so far: every credential has answered dead, and windows are still to come.",
  unknown: "Not clean: a credential has no alive or dead answer for a window that was checked. Unknown is not dead.",
  alive: "Not clean: a credential still answers alive.",
  flipped: "Not clean: a credential went from dead back to alive.",
  "not-checked": "No checks yet.",
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function renderReport(r: Report): string {
  const creds = r.credentials
    .map((c) => {
      const rows = c.checks
        .map(
          (k) =>
            `<tr class="${k.status}${k.flip ? " flip" : ""}"><td>${esc(k.window)}</td><td><time>${esc(k.checkedAt)}</time></td>` +
            `<td>${esc(k.status)}${k.flip ? ' <strong class="flag">FLIP: was dead, alive again</strong>' : ""}</td></tr>`,
        )
        .join("");
      return (
        `<section class="cred"><h2>${esc(c.provider)} ${esc(c.type)} <code>${esc(c.prefix || c.fingerprint || "")}</code></h2>` +
        (rows
          ? `<table><thead><tr><th>Window</th><th>Checked at</th><th>Answer</th></tr></thead><tbody>${rows}</tbody></table>`
          : "<p>Not checked yet.</p>") +
        "</section>"
      );
    })
    .join("");
  return (
    `<h1>GhostGrant report: ${esc(r.agent)}</h1>` +
    `<p class="meta">Generated <time>${esc(r.generatedAt)}</time> from ${r.source === "mock" ? "mock checks (canned responses, no provider was called)" : "live checks"}.<br>` +
    `Decommissioned <time>${esc(r.decommissionedAt)}</time>, manifest sha256 <code>${esc(r.manifestSha256)}</code>.</p>` +
    `<p class="verdict ${r.verdict}">${esc(VERDICT_TEXT[r.verdict])}` +
    (r.next ? ` Next check (${esc(r.next.window)}) at <time>${esc(r.next.dueAt)}</time>.` : "") +
    `</p>${creds}`
  );
}

if (typeof document !== "undefined") {
  const main = document.querySelector("main")!;
  fetch("./demo-report.json")
    .then((res) => res.json() as Promise<Report>)
    .then((r) => (main.innerHTML = renderReport(r)))
    .catch(() => (main.textContent = "The demo report didn't load."));
}
