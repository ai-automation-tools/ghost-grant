# Open questions

Decisions a roadmap run needs from Mike. Fill in `- Answer:` and the next run applies it.

## Open

### Should Slack's `token_expired` count as dead?
- Asked: 2026-11-03 by ghost-grant-roadmap
- Context: Slice 2 lists exactly three dead errors (`invalid_auth`, `token_revoked`, `account_inactive`) and says anything else is unknown, so a rotated token Slack calls `token_expired` reports `unknown`. That's safe, because unknown is never clean, but a credential that has properly expired will never let its report come back clean. Options: (a) leave it unknown, or (b) add `token_expired` to `SLACK_DEAD` in `src/adapters.ts`, a one-word change with one test. Recommendation: (b). Slack only returns `token_expired` when it refuses the token.
- Answer:

## Answered
