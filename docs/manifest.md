<h1 align="center">📝 Manifest format</h1>

<p align="center">
  <em>The YAML file you hand to <code>ghostgrant decommission</code>. Identifiers only, never a secret.</em>
</p>

<p align="center">
  <a href="README.md"><img src="https://img.shields.io/badge/↩-docs-6B7280?style=for-the-badge" alt="Docs home"></a>
</p>

---

## Example

The same file ships as [`examples/manifest.yaml`](../examples/manifest.yaml).

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

## Fields

| Field | Required | What it holds |
|:---|:---|:---|
| `agent` | yes | The retired agent's name. Letters, digits, `.`, `_` and `-`, up to 64 characters. It names the record file, so one agent gets one record. |
| `credentials` | yes | A list with at least one entry. |
| `credentials[].provider` | yes | One of `github`, `slack`, `aws`, `okta`, `google-workspace`. |
| `credentials[].type` | yes | What kind of credential it was, in your words (`personal-access-token`, `bot-token`, `access-key`). |
| `credentials[].prefix` | yes | The visible start of the credential, 12 characters at most, so a person can tell which one it was. |
| `credentials[].hash` | yes | `sha256:` followed by 64 lowercase hex digits: a salted SHA-256 of the secret that you compute yourself. GhostGrant checks only the format. |

## What gets rejected

`ghostgrant decommission` writes nothing and exits 1 if the manifest:

- is empty, or holds only comments
- isn't valid YAML (the error gives the line and column, never the line's text)
- is missing a field above, or has one in the wrong shape
- has a prefix longer than 12 characters
- contains anything shaped like a raw secret anywhere in the file: GitHub, Slack, AWS secret
  key, Okta, Google API or OAuth tokens, or a PEM private key

Error messages name the field, never its value, so a secret pasted by mistake doesn't end up
in your terminal scrollback or a CI log.

## Where records go

Each manifest becomes `records/<agent>.json` under `$GHOSTGRANT_HOME` (default
`~/.ghostgrant`). The record holds the agent name, the decommission time, the SHA-256 of the
manifest file's bytes, and the credential entries as written. Decommissioning the same agent
twice is refused rather than overwriting the first record.

---

<p align="center">
  <a href="README.md">← Docs home</a>
</p>
