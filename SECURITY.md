# Security Policy

GhostGrant is a local CLI that asks providers whether a retired agent's credentials still
work. In `check --live` it holds real tokens in memory for one run, so we take reports about
it seriously.

## Reporting a vulnerability

**Please don't open a public issue for a security vulnerability.**

Report it privately through GitHub:

1. Go to the repository's **Security** tab, then **Report a vulnerability** (GitHub Private
   Vulnerability Reporting).
2. Describe the issue, its impact, and the steps to reproduce it. A proof of concept helps.

We aim to acknowledge a report within a few days and keep you posted while we fix it.
Please give us reasonable time to ship a fix before you disclose it, and don't use anyone
else's credentials while testing.

## Scope

GhostGrant runs entirely on your machine. There's no hosted service, no account and no
telemetry. The surfaces that matter most:

- **Secrets reaching disk or output.** The manifest holds identifiers only. A raw credential
  must never be written to a record, a report, `alerts.log`, a log line or an error message,
  including in `--live` mode and including when a manifest is rejected.
- **Live checks.** Tokens piped on stdin are sent only to their own provider's read-only
  introspection endpoint (GitHub `GET /user`) and dropped when the run ends.
- **Read-only, always.** Nothing in GhostGrant calls an endpoint that changes state at a
  provider. A code path that does is a bug worth reporting.
- **False "dead".** A timeout, 5xx or rate limit must report `unknown`, never `dead`. Anything
  that makes a live credential read as dead, or lets `unknown` count toward a `clean`
  report, is in scope.

Especially interested in: a secret echoed or persisted anywhere, a token sent to the wrong
host, and a way to make a report say `clean` when a credential still works.

### Not vulnerabilities (by design)

- Reports aren't signed and aren't compliance evidence. They say what was checked and what
  each provider answered.
- `$GHOSTGRANT_HOME` (default `~/.ghostgrant`) is protected by your file permissions, not by
  GhostGrant. It holds identifiers and check results, never secrets.

## Supported versions

GhostGrant is pre-1.0. Fixes land on the latest `main`.

## Test fixtures

Every token-shaped string in this repo is fake on purpose: `ghp_FAKE...`, `github_pat_FAKE...`,
`xoxb-FAKE...` and the like in `tests/`, `examples/` and `site/`. They have the right prefix
and the wrong checksum, so no provider would accept them. The hashes in the example manifest
and the demo record (`sha256:aaaa...`, `sha256:1111...`) aren't hashes of anything. The
agent names and accounts in them are made up.

Never commit a real token, a `.env` file or a local path. A full-history secret scan
(`gitleaks detect --log-opts="--all"`) came back clean on 2026-10-27.
