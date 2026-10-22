# Build plan: GhostGrant open-source CLI core

> Copied from the GhostGrant business plan (`Business-Plans/ghost-grant/build/build-plan.md` in the private pipeline workspace) on 2026-10-04. The ADR and estimate it cites stay in the private plan; `AGENTS.md` summarizes the ADR.

**Spec:** [spec.md](spec.md) · **Architecture:** ADR-001, TypeScript on Node.js (private) · **Estimate:** private

One slice per week, matching the org's roadmap cadence. Each slice is a real, mergeable increment an unattended agent can build and verify against mocked provider responses — no slice requires live credentials to prove it works.

## Slice 0 - Walking skeleton (week 1)

The thinnest path that runs end to end: `ghostgrant decommission <manifest.yaml>` parses a manifest, records a decommission entry locally, and `ghostgrant check --mock` runs against canned mock responses and prints a status. No real provider calls yet. Proves the manifest schema, the CLI scaffold, and the mock-mode pattern every later adapter will reuse — the pattern this whole weekly-agent build depends on.

## Slice 1 - GitHub adapter, end to end (week 2)

- **Delivers:** the GitHub adapter Must-story from `spec.md`, wired into the real `check` command (mock mode still default in CI; a `--live` flag exists for a human to test manually).
- **De-risks:** whether the "adapter calls provider's own introspection endpoint, tested via mocked HTTP" pattern actually holds up in code, not just in the spec. GitHub is chosen first because it has the simplest auth model (bearer token, no request signing).
- **Done when:** mocked-HTTP tests pass in CI for both a live and a revoked GitHub token; `README.md` documents how to run it.

## Slice 2 - Slack adapter (week 3)

Same shape as Slice 1, second-simplest auth model (`auth.test` bearer token). Confirms the adapter pattern generalizes before hitting the two harder ones.

## Slice 3 - Scheduled re-check engine + flip alert (week 4)

- **Delivers:** the 24h/7d/30d/90d re-check windows and local flip-detection/alert logic, running against the two adapters that already exist (GitHub, Slack).
- **De-risks:** the core promise of the product — "won't sign off until every credential actually stops working, and tells you if one comes back" — independent of how many providers are wired up yet. This is arguably the riskiest *product* assumption (do people care about the recheck, not just the first check?) and it's deliberately sequenced early, once there's something real to recheck.
- **Done when:** a mock scenario where a credential flips from dead to alive between windows triggers a logged alert, tested in CI.

## Slice 4 - Report generator (week 5)

JSON + human-readable report output covering everything checked so far. Ships something a real early user could actually read and use, even with only two providers live — a deliberate low-scope, high-learning point to get the tool in front of a first real user before the harder adapters are built.

## Slice 5 - AWS IAM adapter (weeks 6-7, per estimate.py's wider band)

The riskier auth model (SigV4/STS). Sequenced after the pattern is proven twice over (Slices 1-2) and after there's something worth checking against (Slices 3-4), so a schedule slip here doesn't block proving the core loop.

## Slice 6 - Okta adapter (weeks 8-9)

## Slice 7 - Google Workspace adapter (weeks 10-11, per estimate.py's wider band)

## Slice 8 - Static GitHub Pages demo dashboard (week 12)

Built from the same JSON report shape the CLI produces (per ADR-001's shared-types decision), populated with a mock decommission scenario across all five providers, so a visitor sees the real output shape without installing anything or holding credentials.

## Slice 9 - Docs, README, release (week 13)

Definition of done for v1: install instructions, the Won't list from `spec.md` stated plainly in the README so early users don't ask for the cut SaaS/attestation features, and a tagged v0.1 release.

## Definition of done (standing bar, every slice)

Acceptance criteria pass including the ugly cases (malformed manifest, provider API timeout, rate limit hit, empty decommission record); adapter tests run in CI against mocked HTTP with no live credentials required; nothing that looks like a real secret is ever logged, even in `--live` mode; merged to `main` with the demo dashboard and README updated to reflect what's actually shipped, not what's planned.

## Cut list (if the estimate runs over)

**Could** → the `--watch` daemon mode, CSV export. **Should** → Okta and Google Workspace adapters (Slices 6-7) can be deferred to a second wave; ship v0.1 with GitHub, Slack, and AWS only, which the estimate's own alternative-scope note says saves roughly 3-4 weeks. **Must** is defended: the manifest, the re-check engine, and at least two working adapters are what make this GhostGrant rather than a stub — if those have to be cut, the spec reopens rather than shipping something the memo's bet doesn't actually test.

## What we learn, and when we'd stop

After Slice 4 (report generator, week 5), there's a real, usable tool covering two providers — enough to hand to a real security/platform engineer and ask "would you run this." That's the earliest point to test the memo's key assumption (do smaller companies feel this pain enough to use a free tool for it) before sinking the remaining 8+ weeks into the harder AWS/Okta/Google Workspace adapters.

The falsifier from the decision memo applies directly here: if, by 12 weeks after the v0.1 release, the repo has fewer than 20 stars and no more than 2 unprompted issues, that's the signal to stop adding providers and either rethink the positioning or move the org's weekly-agent time to a different repo in the pipeline.

---

<p align="center">
  <a href="spec.md">← Spec</a> ·
  <a href="README.md">Product home →</a>
</p>
