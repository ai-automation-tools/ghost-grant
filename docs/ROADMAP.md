<h1 align="center">🗺️ Roadmap</h1>

<p align="center">
  <em>Everything between an empty CLI and a public, demoable GhostGrant, in the order it has to happen.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/now-slice_4:_report-F59E0B?style=for-the-badge" alt="Now: Slice 4, report">
  <img src="https://img.shields.io/badge/stage-incubating-2ea44f?style=for-the-badge" alt="Stage: incubating">
  <a href="README.md"><img src="https://img.shields.io/badge/↩-docs_home-6B7280?style=for-the-badge" alt="Back to docs"></a>
</p>

---

The Ghost-Grant Weekly Roadmap routine works this file top to bottom every Tuesday,
Thursday and Saturday: it takes the first open item that isn't `🔒 Needs Mike` (or up to six `small`
ones), builds it, ticks it and opens a `roadmap/auto-<date>` PR. **Every item above `##
After public release` is a release gate.** GhostGrant goes public when all of them are
ticked and Mike says so. Ticking an item adds its line to the [changelog](CHANGELOG.md) and
updates any doc it made stale, in the same commit.

Markers: `- [ ]` open, `- [-]` claimed by a run in progress, `- [x]` done, `- [!]` blocked
(the reason follows on the line). `small` marks docs or config a run can batch, up to six
per PR (untagged means a feature, one per run); `🔒 Needs Mike` marks one only Mike can do.

The slices come from [product/build-plan.md](product/build-plan.md). The Okta and Google
Workspace adapters (Slices 6 and 7) sit below the release line because the build plan's
own cut list says a v0.1 with GitHub, Slack and AWS is complete without them. Since 2026-10-19 the
release is an MVP on GitHub alone: the Slack and AWS adapters (Slices 2 and 5) moved
below the line too, so GhostGrant ships the whole check, re-check and report loop for one
provider first, and the README says which providers it supports. Every item
is verified against mocked HTTP responses. No item needs a live credential.

## 🧱 Slice 0: Walking skeleton (done 2026-10-08)

- [x] **Slice 0: walking skeleton.** `ghostgrant decommission <manifest.yaml>` parses a manifest listing each credential's provider, type and identifier (a visible prefix plus a salted hash, never the secret), and writes a local decommission record with a timestamp and the manifest's SHA-256. `ghostgrant check --mock` loads every record, answers each credential from canned responses, and prints alive/dead per credential. The manifest schema is documented in `docs/`. Tests cover a valid manifest, a malformed one (clear error, nothing written), an empty one, and a manifest that contains something shaped like a raw token (rejected, and the value never echoed). — done 2026-10-08 by ghost-grant-roadmap: manifest schema in `docs/manifest.md`, records under `$GHOSTGRANT_HOME`, 24 tests

## 🐙 Slice 1: GitHub adapter, end to end (done 2026-10-16)

- [x] **Slice 1: GitHub adapter.** First spend half an hour on GitHub's Credential Revocation API (changelog dated 2026-03-26) and record in the PR whether it gives a cleaner "is this token dead" answer than `GET /user`; use whichever is better. The adapter reports alive for a 200 and dead for a 401, and treats a timeout, a 5xx or a rate limit as "unknown", never as dead. Tests mock all of those with no live token. `--live` exists for a human to try by hand; `--mock` stays the default in tests. README documents it. — done 2026-10-16 by ghost-grant-roadmap: `GET /user` (the Credential Revocation API revokes, so it's out), tokens piped on stdin and paired by prefix, 35 tests

## ⏱️ Slice 3: Re-check engine and flip alert (done 2026-10-20)

- [x] **Slice 3: re-check windows and flip alert.** A record carries 24h, 7d, 30d and 90d windows. `ghostgrant check` re-checks every credential whose next window has passed and updates its status. A credential that goes from dead to alive writes an alert to a local alert log and prints it. Tests drive the clock: a record past 24h gets re-checked, one that isn't due is skipped, and a mocked dead-then-alive credential produces exactly one alert. — done 2026-10-20 by ghost-grant-roadmap: results stored on the record per window, mock and live apart; `unknown` is re-asked; alerts in `$GHOSTGRANT_HOME/alerts.log`; 42 tests

## 📄 Slice 4: Report generator

- [ ] **Slice 4: report.** `ghostgrant report <agent-name>` prints a dated plain-text report and, with `--json`, the same data as JSON whose shape is a single exported TypeScript type. It lists every credential's result at every window checked so far. It makes no attestation or compliance claim. Tests cover an all-clean record, one with a flip, and an unknown agent name.

## 🖥️ Slice 8: Static demo dashboard

- [ ] **Slice 8: static demo dashboard.** A static page under `site/` renders a report JSON file bundled with it: a fictional retired agent with GitHub credentials (the provider the first release supports) across all four windows, including one flip. The page imports the report type from Slice 4 so it can't drift from the CLI's output. `npm run build` also builds the page, and a test checks the bundled JSON against the type.

## 🚦 Public release

- [ ] `small` **CI.** `.github/workflows/ci.yml` runs `npm ci`, `npm run lint`, `npm test` and `npm run build` on push to `main` and on every PR, with an explicit `permissions: contents: read` block, and the latest run on `main` is green.
- [ ] `small` **README usage matches the code.** Every command, flag, and manifest field in the README was run against the real build and behaves as written. The README states the spec's Won't list plainly, so nobody files an issue asking for revoke buttons or signed reports.
- [ ] `small` **Security.** `SECURITY.md` says how to report a vulnerability. A full-history secret scan (`gitleaks detect --log-opts="--all"` or equivalent) comes back clean, and the command and result are recorded in the PR that ticks this box. Test fixtures that look like tokens are obviously fake and documented as such.
- [ ] **Live demo at `https://ai-automation-tools.dev/ghost-grant/`.** Served by GitHub Pages from this repo through an `actions/deploy-pages` workflow publishing the built `site/`. A visitor sees the mock decommission report with nothing to install. The org source bar sits across the very top, its note saying this is a demo with made-up credentials and its View source link pointing at `https://github.com/ai-automation-tools/ghost-grant`. Safe to publish: every agent name, account, key prefix and hash in the demo is fabricated. No real personal data, no local paths, and no network request other than the page loading its own files. The README hero's Live Demo badge and nav links resolve to the Pages URL above the fold.

## After public release

Nothing below blocks go-live.

### 🧩 Fast-follow slices

- [ ] **Slice 2: Slack adapter.** Same shape as Slice 1, calling `auth.test`: `ok: true` is alive, `invalid_auth`/`token_revoked`/`account_inactive` are dead, anything else is unknown. Mocked tests for each, and the adapter interface from Slice 1 holds without changes (or the PR says what changed and why).
- [ ] **Slice 5: AWS IAM adapter.** Calls STS `GetCallerIdentity` for an access key ID, signing requests with SigV4 written here or with the smallest AWS SDK client that does it (the PR says which and why). `InvalidClientTokenId` is dead, a valid identity is alive, throttling and network errors are unknown. Mocked tests for each, and no secret access key ever appears in a log, record or report.
- [ ] **Slice 6: Okta adapter.** Same shape as Slices 1 and 2, mocked tests, no live tenant needed.
- [ ] **Slice 7: Google Workspace adapter.** Same shape, mocked tests. The build plan flags this one as the widest estimate.
- [ ] **Alert delivery (spec: Should).** A flip alert can also go to a webhook URL from config. Slack and email come after that, if anyone asks.
- [ ] **`--watch` mode and CSV export (spec: Could).** Only if real users ask for them.

### 📣 Publish and promote

- [ ] Hand the tool to one real security or platform engineer at a small company and write down whether they'd run it. This is the build plan's checkpoint for the memo's key assumption. 🔒 Needs Mike
- [ ] Tag v0.1 and publish the CLI to npm as `ghostgrant` (check the name is still free first). 🔒 Needs Mike
- [ ] Launch post with one real example report, sent to the two or three places platform engineers running AI agents read. 🔒 Needs Mike
- [ ] Custom subdomain `ghost-grant.ai-automation-tools.dev`. 🔒 Needs Mike
- [ ] Twelve weeks after v0.1, check the falsifier: under 20 stars and 2 or fewer unprompted issues means stop adding providers and rethink. 🔒 Needs Mike

### 💰 Revenue

- [ ] Decide whether the hosted attestation tier cut from the idea card is worth revisiting, using stars, npm downloads and issues as the evidence. Its own spec and ADR if yes. 🔒 Needs Mike

---

<p align="center">
  <a href="README.md">← Docs home</a> ·
  <a href="CHANGELOG.md">Changelog →</a>
</p>
