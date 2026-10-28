<h1 align="center">📋 GhostGrant Changelog</h1>

<p align="center">
  <em>What changed in GhostGrant, newest first.</em>
</p>

<p align="center">
  <a href="ROADMAP.md"><img src="https://img.shields.io/badge/plan-ROADMAP-8B5CF6?style=for-the-badge" alt="Roadmap"></a>
  <a href="README.md"><img src="https://img.shields.io/badge/↩-docs-6B7280?style=for-the-badge" alt="Docs home"></a>
</p>

---

Entries that close a roadmap item carry the roadmap phase in italics.

## Unreleased

**Added**
- `SECURITY.md`: report vulnerabilities privately through GitHub, what's in scope (a secret reaching disk or output, a token sent to the wrong host, a false `dead` or `clean`), and a note that every token-shaped fixture in the repo is fake. A full-history `gitleaks` scan came back clean. *Public release*
- CI workflow: `npm ci`, `npm run lint`, `npm test` and `npm run build` on every push to `main` and every PR, with `permissions: contents: read`.
- Static demo page in `site/`. It renders a bundled report for a fictional retired agent, `triage-bot`, with three made-up GitHub credentials checked at every window and one dead-to-alive flip, using the CLI's own `Report` type so the page can't drift from `ghostgrant report --json`. `npm run build` also builds the page into `_site/site/`, and a test rebuilds the bundled JSON from its demo record with `buildReport` and compares the two. Not hosted yet. *Build*
- `ghostgrant report <agent>`. Prints a dated plain-text report of every check for one agent (each credential, each window, when it was asked and what came back, flips marked) and a one-line verdict: `clean`, `dead-so-far`, `unknown`, `alive`, `flipped` or `not-checked`. Live checks by default, `--mock` for the mock ones, `--json` for the same data as the exported `Report` type. An unknown agent name fails without echoing anything shaped like a token. *Build*
- Re-check windows and flip alerts. `ghostgrant check` runs each record's due window (at decommission, then 24h, 7d, 30d and 90d), skips records with nothing due and says when the next check is, and asks again about any `unknown` answer. A credential that goes from dead to alive prints an `ALERT` and is appended to `$GHOSTGRANT_HOME/alerts.log`. Results are stored on the record, mock and live kept apart. *Build*
- GitHub adapter. `ghostgrant check --live` reads tokens from stdin, pairs each with a recorded credential by prefix, and asks GitHub's `GET /user`: 200 is alive, 401 is dead, and a timeout, 5xx or rate limit is unknown. Tokens are never printed or stored. `check` now needs `--mock` or `--live`. *Build*
- `ghostgrant decommission <manifest.yaml>` validates a manifest, refuses anything shaped like a raw secret without echoing it, and writes a record with a timestamp and the manifest's SHA-256. `ghostgrant check --mock` prints canned alive/dead for every recorded credential. Manifest format in `docs/manifest.md`. New runtime dependency: `yaml`. *Build*

**Fixed**
- The GitHub adapter's timeout uses a plain `setTimeout` instead of `AbortSignal.timeout`, whose timer is unref'd: on Node 22 a request holding nothing else open let the process exit before the timeout fired. The first CI run caught it as two cancelled tests.

**Changed**
- Moved to the org folder layout: the agent instructions are in `AGENTS.md` now (Codex, Gemini CLI and opencode read it), and `CLAUDE.md` is a bare `@AGENTS.md` import for Claude Code. The test folder is `tests/` instead of `test/`, with every path that named it updated.

**Docs**
- README checked command by command against the build: quick start, live checks, reports, every flag and the manifest rules all behave as written. The Won't list is its own section now (no revoke, no signed reports, no hosted service, no sixth provider), the quick start mentions `--help`, `--version` and `$GHOSTGRANT_HOME`, and the folder table lists `SECURITY.md` and the CI workflow. *Public release*
- 2026-10-19: release scope cut to the MVP (pipeline change, Mike). The Slack and AWS IAM adapters (Slices 2 and 5) moved below `## After public release`, so the first release covers GitHub end to end; the demo-safety and README-hero items folded into the live-demo item; the routine now runs Tue/Thu/Sat and batches up to six `small` items. No item dropped.
- 2026-10-19: the roadmap moved onto the lab's roadmap standard: `now` and `stage` badges, an intro naming the Ghost-Grant Weekly Roadmap routine, the Build section split into one heading per build-plan slice (Slices 0 and 1 marked done), done notes moved to the end of each item (`— done YYYY-MM-DD: …`), and Monetize renamed Revenue. No items added or dropped, and every state is unchanged.

## 2026-10-04

**Added**
- Project scaffold: a TypeScript CLI that answers `--help` and `--version` and nothing else yet, with `npm run build`, `npm test` and `npm run lint` all passing.
- MIT license.

**Docs**
- Root README, docs hub, roadmap with release gates, and this changelog.
- The product spec and build plan, copied from the business plan into `docs/product/`.
- `CLAUDE.md` for the weekly roadmap agent.

---

<p align="center">
  <a href="README.md">← Docs home</a> ·
  <a href="ROADMAP.md">← Roadmap</a>
</p>
