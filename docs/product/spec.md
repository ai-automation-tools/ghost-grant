# Spec: GhostGrant CLI (open-source core)

> Copied from the GhostGrant business plan (`Business-Plans/ghost-grant/build/spec.md` in the private pipeline workspace) on 2026-10-04. This copy is the one the roadmap works from.

**Decision it serves:** the plan's decision memo (private) · **Status:** draft
**The bet being tested:** security/platform engineers will run a free CLI to verify a decommissioned AI agent's credentials are actually dead, even without a paid tier attached.

## Users & jobs

- **Security/platform engineer at a small company running production AI agents.** Job: "When I retire an agent, I want proof every credential it held stopped working, not just a revoke click I have to trust, so that I can tell my team (or an auditor) the offboarding actually held." Traced to the OpenAI incident and breach-rate evidence in the plan's business case (private) — tagged `[assum]` for whether this job is felt acutely at the 50-500 employee scale specifically (see the memo's key assumption).

## In scope (this version)

### Must

- **Decommission manifest** — As an engineer, I want to list an agent's known credential IDs across GitHub, AWS, Slack, Okta, and Google Workspace in a YAML file, so that the tool knows what to check without ever holding the raw secret.
  - AC: Given a YAML manifest with credential type + identifier (never the secret) per provider, When I run `ghostgrant decommission <manifest>`, Then the tool records a decommission record with a timestamp and the manifest's checksum.
- **Provider adapters (GitHub, AWS IAM, Slack)** — As an engineer, I want each adapter to call the provider's own introspection/whoami-equivalent endpoint, so that "still alive" is determined by the provider, not guessed from a cached state.
  - AC: Given a live and a revoked credential of each type, When the adapter runs, Then it correctly reports alive/dead for both, verified against mocked HTTP responses in CI.
- **Scheduled re-check windows (24h/7d/30d/90d)** — As an engineer, I want the tool to re-run the check at each window, so that a credential that gets silently re-issued or cached back into use doesn't slip through a one-time check.
  - AC: Given a decommission record past its 24h window, When I run `ghostgrant check`, Then it re-checks every credential in that record and updates status; a credential that flips from dead to alive triggers an alert (Must: local/webhook alert; Slack/email is Should, see below).
- **Local report output** — As an engineer, I want a plain report (JSON + human-readable) of every credential's status across all windows, so that I can attach it to a ticket or hand it to whoever asked.
  - AC: Given a decommission record with all windows checked clean, When I run `ghostgrant report <agent-name>`, Then it outputs a dated report stating every credential failed every check across the full window — no cryptographic signature, no compliance-attestation language (that claim is explicitly cut, see Won't).
- **Dry-run / mock mode** — As a contributor or evaluator, I want to run the whole flow against fake provider responses, so that I can verify the tool works without live credentials.
  - AC: Given `--mock` flag, When any command runs, Then it uses canned provider responses instead of live API calls, and produces the same report shape.

### Should

- Okta and Google Workspace adapters (Must-quality adapters, Should-priority only because they're the 4th/5th of five and can ship after the core three prove the pattern).
- Slack/email/webhook alert delivery (v1 Must is "flip detected and logged locally"; wiring an actual notification channel is Should).

### Could

- A `--watch` daemon mode instead of manually re-running `ghostgrant check`.
- CSV export alongside JSON/human-readable report.

## Explicitly out of scope (Won't, this version)

- **Any hosted backend, dashboard, or billing.** The paid SaaS tier from the idea card is cut per the decision memo — this is a local CLI only.
- **Signed or cryptographically-attested reports.** "Signed JSON/PDF attestation" from the idea card implies a compliance claim this project has no standing to make credibly in v1. The report says what was checked and what happened; it doesn't claim to be audit-grade evidence.
- **Auto-rotation / revoke integrations.** The idea card's "one-click revoke wired to each provider's key-management API" is a different, riskier feature (the tool would need write/destructive credentials, not just read-only introspection). Out of scope until the read-only core proves useful.
- **Any provider beyond the five named.** Adding a sixth provider is explicitly deferred until the first five are solid — an unwritten "we could add Stripe/Twilio too" is exactly the kind of scope creep this list exists to block.

## Non-functional requirements

- **Runs with zero stored secrets.** The manifest holds identifiers only (a salted hash + a visible prefix, per the idea card's own design); the tool never writes a raw credential to disk or logs. This is a security requirement, not a nice-to-have, given what the tool is for.
- **Each adapter must work correctly against mocked HTTP responses with no live credentials**, so an unattended agent can build and verify a new adapter in CI without needing real GitHub/AWS/Slack/Okta accounts. This is the requirement the whole weekly-build-cadence plan in `build-plan.md` depends on.
- **Runs on a normal developer machine (Python or Node, TBD in ADR-001) with no external service dependency for the free tier.**
- **Demo:** a static GitHub Pages page showing a mock decommission-verification report/dashboard, built from the same JSON report shape the CLI produces, so a visitor can see the value without installing anything or holding real credentials.

## Open questions

- Language/runtime choice (Python vs. Node vs. Go) — resolved by ADR-001 (private): TypeScript on Node.js. `CLAUDE.md` summarizes it.
- Exact manifest schema (YAML shape) — first implementation detail, not a blocking open question; the walking skeleton in `build-plan.md` fixes it.
- Whether GitHub's 2026-03-26 Credential Revocation API changelog (noted in the plan's private research) gives GhostGrant's GitHub adapter a cleaner introspection path than a generic `/user` whoami call — worth 30 minutes of docs-reading before Slice 1 starts.

---

<p align="center">
  <a href="README.md">← Product home</a> ·
  <a href="build-plan.md">Next: Build plan →</a>
</p>
