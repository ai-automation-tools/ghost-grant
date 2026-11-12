<h1 align="center">🧩 Inventory format</h1>

<p align="center">
  <em>How GhostGrant reads and writes the Agent Security Suite's shared inventory, so a retired agent another suite tool found can be checked without re-keying it.</em>
</p>

<p align="center">
  <a href="README.md"><img src="https://img.shields.io/badge/↩-docs-6B7280?style=for-the-badge" alt="Docs home"></a>
</p>

---

## The format

[Agent inventory schema v0.1](https://ai-automation-tools.dev/schemas/agent-inventory/v0.1.json),
vendored unedited as [`schemas/agent-inventory.schema.json`](../schemas/agent-inventory.schema.json).
Every inventory GhostGrant reads, and every one it writes, is validated against that copy.
An invalid file exits non-zero and names the first problem by path, for example
`inventory.identities[0].status must be one of: active, disabled, retired, unknown`. The
message never quotes a value from the file.

## `ghostgrant import <inventory.json>`

Takes every identity with `status: "retired"` and records it like a decommissioned
manifest, one record per identity, checked at the same windows from the moment you import.

- Platforms GhostGrant checks are `github`, `slack`, `aws` and `okta`. A retired identity on
  any other platform is skipped with a line saying so, as is one with no credentials or with
  two credentials sharing an id.
- The record is named after the identity's `displayName` (anything but letters, digits,
  `.`, `_` and `-` becomes `-`), so `ghostgrant report <name>` works as usual. Importing the
  same file again skips identities that are already recorded.
- The record keeps the identity as it came, the findings other tools wrote about it, and
  the document's `x` data, so an export hands them back unchanged.
- Anything shaped like a raw secret anywhere in the file, `x` included, rejects the whole
  file without echoing it. Credentials carry a `fingerprint`, never a secret.

## Live checks for imported credentials

An imported credential has no visible prefix, so `ghostgrant check --live` pairs it with a
token from stdin by fingerprint instead: the token whose SHA-256, in hex, starts with the
credential's `fingerprint` (the schema's "first 12 hex chars of SHA-256 of the secret"). A
credential with no fingerprint, or one that is the platform's own key id, can't be paired
and stays `unknown`, which never counts as dead.

## `ghostgrant export --format inventory`

Prints every record as one schema-valid inventory on stdout, so
`ghostgrant export --format inventory > inventory.json` saves it. Live checks by default;
`--mock` uses the mock ones, and `x["ghost-grant"].source` says which.

- A credential's latest `dead` answer becomes its `lastVerifiedDeadAt`.
- A credential whose latest definite answer is `alive` gets a finding with `ruleId`
  `ghost-grant/credential-still-live` and severity `critical`. Its remediation is a step for
  a human: GhostGrant never revokes anything.
- An imported identity comes back as it was imported, with only `lastVerifiedDeadAt`
  updated. Other producers' findings and `x` keys come back unchanged.
- A record decommissioned from a manifest becomes an `ai-agent` identity with id
  `ghost-grant:<agent>`. Its credentials are named `<provider>:<prefix>:<n>`, a type the
  schema doesn't list becomes `other`, and the manifest's salted hashes stay out.

The [demo page](https://ghost-grant-demo.ai-automation-tools.dev/) links its sample as an
inventory, `site/demo-inventory.json`, which is this export of the demo record.

---

<p align="center">
  <a href="README.md">← Docs home</a>
</p>
