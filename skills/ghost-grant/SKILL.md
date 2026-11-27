---
name: ghost-grant
description: >-
  Verify that the credentials a retired AI agent held have actually stopped working, and
  keep verifying. GhostGrant is a local, read-only CLI: you record a YAML manifest of the
  agent's credentials (identifiers only, never secrets), then `check` asks each provider's
  own whoami endpoint (GitHub `GET /user`, Slack `auth.test`) whether each one is dead, at
  decommission and again at 24h, 7d, 30d and 90d, and alerts when one flips from dead back
  to alive. Use when the user says "we retired/decommissioned/shut down an agent, are its
  tokens really dead", "check the old bot's GitHub/Slack token is revoked", "ghost
  credentials", "verify revocation", "schedule re-checks of a retired agent", "read a
  GhostGrant report or verdict", or wants to import/export an Agent Security Suite
  inventory. Defensive use only, on credentials the user owns. Source:
  github.com/ai-automation-tools/ghost-grant (MIT).
---

# GhostGrant

Drive the `ghostgrant` CLI from any repo to prove a retired agent's credentials are dead.
It only reads: every provider call is an introspection endpoint that changes nothing. It
never revokes, rotates or stores a secret, and its reports are not compliance evidence.

**Authorized use only.** Check credentials of agents the user retired and is allowed to
test. Asking a provider whether someone else's token works is not what this tool is for;
decline that.

## Install (from source only)

There is no npm package or release yet (`ghostgrant` is not on the npm registry). Build it
from the repo; Node 22.18 or newer, npm:

```bash
git clone https://github.com/ai-automation-tools/ghost-grant.git
cd ghost-grant
npm install
npm run build            # writes dist/cli.js (and the demo page to _site/site/)
node dist/cli.js --help
```

Below, `ghostgrant` means `node <clone>/dist/cli.js`. Run `--help` once and trust it over
this file if they differ.

## Commands

| Command | Does | Exit |
|:---|:---|:---|
| `ghostgrant decommission <manifest.yaml>` | Records the agent and its credentials, timestamped, with the manifest's SHA-256 | 0 ok; 1 unreadable, rejected, or agent already recorded |
| `ghostgrant import <inventory.json>` | Records each `status: "retired"` identity in an Agent Security Suite inventory (schema v0.1) | 0 (skips are printed, not errors); 1 unreadable or invalid |
| `ghostgrant check --mock` | Runs every due check against canned answers; no provider is called | 0 / 1 / 2, below |
| `ghostgrant check --live` | Runs every due check against the real providers, tokens read from stdin | 0 / 1 / 2, below |
| `ghostgrant report <agent> [--mock] [--json]` | Prints every check for one agent and a verdict. Live checks by default | 0; 1 no agent name or no record |
| `ghostgrant export --format inventory [--mock]` | Prints every record as a schema-valid suite inventory on stdout | 0; 1 bad flags or schema failure |
| `ghostgrant --version` / `--help` | Version / usage | 0 |

`check` exit codes, for schedulers:

| Code | Meaning |
|:---|:---|
| `0` | No new alert: everything due was checked, or nothing was due, or there are no records |
| `1` | Error, for example neither or both of `--mock` / `--live` |
| `2` | This run wrote at least one new `ALERT` (a credential went from dead back to alive) |

A credential that stays alive after its flip alerts once, so the next run is back to `0`.

State lives in `$GHOSTGRANT_HOME` (default `~/.ghostgrant`): `records/<agent>.json` and
`alerts.log` (one JSON object per line: `at`, `agent`, `window`, `source`, `provider`,
`type`, `prefix`). Every command must see the same `GHOSTGRANT_HOME`; point it at a scratch
directory to experiment without touching real records.

## The manifest

Identifiers only. Example (the repo ships it as `examples/manifest.yaml`):

```yaml
agent: billing-bot
credentials:
  - provider: github
    type: personal-access-token
    prefix: ghp_FAKE
    hash: sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  - provider: slack
    type: bot-token
    prefix: xoxb-FAKE
    hash: sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
```

- `agent`: letters, digits, `.`, `_`, `-`, up to 64 characters. One record per agent;
  decommissioning the same name twice is refused, not overwritten.
- `provider`: `github`, `slack`, `aws`, `okta` or `google-workspace`.
- `type`: free text (`personal-access-token`, `bot-token`, `access-key`).
- `prefix`: the visible start of the credential, 12 characters at most. `check --live`
  pairs each stdin token with the credential whose prefix it starts with, so make prefixes
  long enough to tell the agent's credentials apart (two `ghp_` tokens need more than `ghp_`).
- `hash`: `sha256:` plus 64 lowercase hex digits, a salted SHA-256 of the secret that the
  user computes. GhostGrant checks only the format.

The whole file is rejected (exit 1, nothing recorded) if it is empty, not YAML, missing or
mis-shaping a field, has a prefix over 12 characters, or contains anything shaped like a raw
secret (GitHub, Slack, AWS secret key, Okta, Google API or OAuth token, PEM private key).
Errors name the field, never the value. Full reference: `docs/manifest.md` in the repo.

## Live checks and tokens

`check --live` needs the tokens themselves, which the manifest never holds. They go in on
stdin, one per line, and each is sent once to its own provider and dropped:

```bash
printenv OLD_AGENT_GH_TOKEN OLD_AGENT_SLACK_TOKEN | ghostgrant check --live
```

```powershell
$env:OLD_AGENT_GH_TOKEN, $env:OLD_AGENT_SLACK_TOKEN | node dist/cli.js check --live
```

Rules for the agent driving it:

- **Never ask the user to paste a token into the chat**, and never echo, log or write one
  to a file. Have the user pipe tokens from an environment variable or secret store they
  control, as above, and run that command themselves if the tokens are not already in the
  environment.
- A credential with no matching token, or more than one, is `unknown` and no provider is
  called. Imported credentials pair by fingerprint instead (the token whose SHA-256 hex
  starts with the inventory `fingerprint`).
- Only **GitHub** and **Slack** have live adapters today. AWS, Okta and Google Workspace
  credentials always answer `unknown` until their adapters land. Say so rather than
  reporting them as checked.

What each answer means:

| Provider | `alive` | `dead` | `unknown` |
|:---|:---|:---|:---|
| GitHub `GET /user` | HTTP 200 | HTTP 401 | anything else: 403/rate limit, 5xx, timeout (10 s), network error |
| Slack `auth.test` | `ok: true` | `invalid_auth`, `token_revoked`, `token_expired`, `account_inactive` | any other error, 429, 5xx, timeout, non-JSON body |

**`unknown` is never dead.** It does not settle a window, so the next `check` asks again,
and it keeps a report from being `clean`.

## Windows and scheduling

Checks fall due at decommission (`initial`), then `24h`, `7d`, `30d` and `90d` after it
(after import time for imported records). `check` only asks about the latest window that is
due and prints when the next one is; a missed window is folded into the latest due one.
Running it more often is harmless: "nothing due" exits 0.

Run it from cron, Task Scheduler or a similar scheduler on a machine that keeps
`$GHOSTGRANT_HOME`, and notify on any non-zero exit: `2` is a flip, `1` means the check
didn't run. In a CI job the runner is thrown away, so persist `$GHOSTGRANT_HOME` between
runs (a cache or an artifact) or every run looks like a fresh start with
no records; feed tokens from the CI secret store on stdin, and use Node 22.18+.

## Reading the output

`check` prints one line per credential (`provider  type  prefix  status (note)`) and an
`ALERT:` line for each flip. `report` prints each credential's checks by window and ends on
a verdict:

| Verdict | Meaning |
|:---|:---|
| `clean` | Every credential answered dead at every window checked, through 90d |
| `dead-so-far` | Every answer so far is dead; the line says when the next check is due |
| `unknown` | A credential has no alive or dead answer for a window that was checked |
| `alive` | A credential's latest answer is alive |
| `flipped` | A credential went from dead back to alive |
| `not-checked` | No checks of that source yet |

`--json` prints the same data. Shape (the `Report` type in `src/report.ts`): `agent`,
`generatedAt`, `source` (`mock` or `live`), `decommissionedAt`, `manifestSha256`,
`credentials[]` (`provider`, `type`, `prefix`, optional `fingerprint`, `checks[]` of
`window`, `checkedAt`, `status`, `flip`), optional `next` (`window`, `dueAt`), `verdict`.
Hashes are left out.

When reporting to the user: `alive` or `flipped` means the credential still works; tell
them to revoke it at the provider themselves, since GhostGrant cannot. `unknown` means
"not proven dead", not "fine". Only `clean` covers the full 90 days.

## Mock vs live

Mock and live answers are stored and reported separately and never mixed. From the CLI,
`--mock` answers `dead` for every credential, so it exercises the manifest, records,
windows and report without touching a provider; it proves nothing about real credentials.
`report` defaults to live checks; add `--mock` to see mock ones.

## Suite inventories

```bash
ghostgrant import inventory.json                 # records each retired identity
ghostgrant check --live < tokens.txt             # or pipe them, as above
ghostgrant export --format inventory > checked.json
```

- Import checks retired identities on `github`, `slack`, `aws` and `okta`; others are
  skipped with a printed reason, as are identities with no credentials or duplicate
  credential ids. The record is named after `displayName`. Re-importing skips what is
  already recorded. A raw-secret shape anywhere in the file rejects the whole file.
- Export: the latest dead answer becomes `lastVerifiedDeadAt`; a credential whose latest
  definite answer is alive gets a `critical` finding `ghost-grant/credential-still-live`.
  Other tools' findings and `x` keys pass through unchanged. Details: `docs/inventory.md`.
- A `tokens.txt` holds live secrets: keep it out of the repo and delete it afterwards, or
  prefer piping from the environment.

## Common workflows

1. **Retired an agent today.** Write the manifest with the user (they supply prefixes and
   compute hashes), `decommission` it, `check --live` with tokens piped in, `report <agent>`.
   Then set up the scheduled re-check.
2. **Is it clean yet?** `report <agent>`; read the verdict and `next.dueAt`.
3. **Dry run / demo.** Use a scratch `GHOSTGRANT_HOME`, `decommission examples/manifest.yaml`,
   `check --mock`, `report billing-bot --mock`.
4. **Hand results to another suite tool.** `export --format inventory > file.json`.

## Traps

- No record for an agent until `decommission` or `import` succeeds; `check` with no records
  prints a hint and exits 0, so a wrong `GHOSTGRANT_HOME` looks like success.
- `check` needs exactly one of `--mock` or `--live`.
- A prefix shared by two credentials makes both `unknown` in live mode.
- Paths and agent names that look like secrets are left out of error messages on purpose.
- GhostGrant will not support providers beyond the five, revoke anything, sign reports or
  run as a hosted service. Don't promise any of those.
