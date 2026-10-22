<h1 align="center">🧰 Source</h1>

<p align="center">
  <em>The GhostGrant CLI. It records manifests and checks them against canned responses or GitHub itself.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-6.0-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript 6.0">
  <a href="../README.md"><img src="https://img.shields.io/badge/↩-repository_root-6B7280?style=for-the-badge" alt="Repository root"></a>
</p>

---

| File | What it does |
|:---|:---|
| [**cli.ts**](cli.ts) | The `ghostgrant` bin entry. Hands `argv` to `run()` and sets the exit code. |
| [**run.ts**](run.ts) | Command dispatch and the `decommission` and `check` commands, including which credentials are due and flip detection. Takes a context (output, records directory, clock, canned mock responses, `fetch`, and the stdin token reader for `--live`) instead of reaching for `process`, so tests can call it. |
| [**adapters.ts**](adapters.ts) | One read-only check per provider: token in, `alive`, `dead` or `unknown` out. GitHub so far (`GET /user`). |
| [**manifest.ts**](manifest.ts) | Parses and validates a manifest, and refuses anything shaped like a raw secret without echoing it. |
| [**records.ts**](records.ts) | The re-check windows, and reading and writing decommission records (with their check results) and the alert log under `$GHOSTGRANT_HOME`. |

Tests live in [`../test/`](../test/cli.test.ts) and import these files directly. Node strips
the types at runtime, so there's no build step before `npm test`.

---

<p align="center">
  <a href="../README.md">← Repository home</a>
</p>
