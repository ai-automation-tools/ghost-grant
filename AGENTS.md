# AGENTS.md

Standing orders for the agent that works this repo, usually the weekly roadmap routine.

## What GhostGrant is

A local CLI that verifies a retired AI agent's credentials are actually dead. The user
writes a YAML manifest naming each credential the agent held (provider, type, identifier;
never the secret). `ghostgrant decommission` records it, `ghostgrant check` asks each
provider's own introspection endpoint whether each credential still works and re-asks at
24h, 7d, 30d and 90d, and a credential that flips from dead back to alive raises an alert.
`ghostgrant report` prints what was checked and what happened.

Providers: GitHub, Slack and AWS IAM before public release; Okta and Google Workspace after.

The bet under the project: security and platform engineers at small companies will run a
free tool for this. After Slice 4 the tool is usable enough to put in front of one; that's a
Needs Mike step, not yours.

Full spec: `docs/product/spec.md`. Slice order: `docs/product/build-plan.md`. Work queue:
`docs/ROADMAP.md`.

## Stack

- TypeScript 6.0, ESM (`"type": "module"`), Node 22.18 or newer. **npm**, not pnpm or yarn.
  TypeScript is pinned to `~6.0` because `typescript-eslint` doesn't support 7.x yet.
- Sources import each other with `.ts` extensions (`import { run } from "./run.ts"`). Node
  strips types at runtime and `tsc` rewrites the extensions on build
  (`rewriteRelativeImportExtensions`). `erasableSyntaxOnly` is on: no enums, no namespaces,
  no parameter properties.
- HTTP: Node's built-in `fetch`. Mock it in tests by injecting the fetch function into each
  adapter, or with `nock`/`msw` if injection gets awkward (say which in the PR).
- Tests: `node:test` and `node:assert/strict`, files in `tests/*.test.ts`. No Jest, no Vitest.
- Lint: ESLint 9 flat config with `typescript-eslint` recommended, plus `tsc --noEmit`.
- `src/cli.ts` is the bin entry; logic goes in modules that take their inputs as arguments
  (including the clock and the fetch function) so tests can call them without a process,
  a network, or real time passing.
- The demo page (Slice 8) lives in `site/` and imports the report type from `src/`, so the
  page and the CLI share one definition of the report shape. `npm run build` writes the
  page to `_site/site/`; `site/demo-report.json` is `buildReport` run on
  `site/demo-record.json`, and `tests/site.test.ts` fails if the two drift.

## Verify

Run all three from the repo root. All three must pass before a PR opens.

```
npm run lint
npm test
npm run build
```

## Architecture decisions that are already made

- **ADR-001: TypeScript on Node.js.** Chosen so the CLI and the static demo share one
  report type. Don't introduce a second language. A prebuilt single binary is a possible
  later follow-up, not roadmap work.
- **Read-only, always.** Adapters call introspection endpoints (`GET /user`, `auth.test`,
  STS `GetCallerIdentity`). Nothing in this repo calls an endpoint that changes state at a
  provider.
- **Unknown is not dead.** A timeout, 5xx, or rate limit is reported as `unknown` and never
  counts toward a clean report.

## Won't (this version)

Carried from the spec. If a roadmap item seems to need one of these, stop and flag it.

- **Any hosted backend, dashboard, or billing.** Local CLI only. The GitHub Pages demo is
  static and has no backend.
- **Signed or cryptographically attested reports.** The report says what was checked and
  what happened. It never claims to be audit-grade or compliance evidence.
- **Auto-rotation or revoke integrations.** GhostGrant never holds write or destructive
  credentials.
- **Any provider beyond the five named** (GitHub, AWS IAM, Slack, Okta, Google Workspace).
  No Stripe, no Twilio, no "while we're here".

## Standards

- **Zero stored secrets.** The manifest holds identifiers only. Never write a raw
  credential to disk, a record, a report, a log line, an error message, or a test snapshot,
  including in `--live` mode. If an input looks like a raw secret, refuse it without
  echoing it.
- Every adapter is proven against mocked HTTP. No test needs a live credential or network
  access; CI has neither.
- The build plan's ugly cases are tests: malformed manifest, provider timeout, rate limit,
  empty decommission record.
- No new runtime dependency without a line in the PR body saying why. A YAML parser (`yaml`)
  is expected in Slice 0; most other things are a few lines of code.
- This repo goes public at graduation. Never commit `.env*`, tokens, real personal data, or
  local paths like `C:\Users\...` or `D:\...`. Token-shaped test fixtures must be obviously
  fake (for example `ghp_FAKE...`) and must not match a real provider's checksum format.
- Commit messages: plain imperative sentences ("Add the GitHub adapter"), no Conventional
  Commit prefixes.

## What "done" means for a roadmap item

1. The item's own text is true of the code, checked by running it.
2. `npm run lint`, `npm test` and `npm run build` pass, and new behavior has a test.
3. Anything the change made untrue is fixed: `README.md`, `docs/`, this file.
4. `docs/CHANGELOG.md` has a line for it, tagged with the roadmap phase in italics, in the
   same commit that flips the box to `- [x]` with a dated note.
5. It's on a `roadmap/auto-<date>` branch with a PR into `main`. Never push to `main`.
