<h1 align="center">📋 GhostGrant Changelog</h1>

<p align="center">
  <em>What changed in GhostGrant, newest first.</em>
</p>

<p align="center">
  <a href="ROADMAP.md"><img src="https://img.shields.io/badge/plan-ROADMAP-8B5CF6?style=for-the-badge" alt="Roadmap"></a>
  <a href="README.md"><img src="https://img.shields.io/badge/↩-docs-6B7280?style=for-the-badge" alt="Docs home"></a>
</p>

---

Entries that close a roadmap item carry the roadmap phase in italics.

## Unreleased

**Added**
- GitHub adapter. `ghostgrant check --live` reads tokens from stdin, pairs each with a recorded credential by prefix, and asks GitHub's `GET /user`: 200 is alive, 401 is dead, and a timeout, 5xx or rate limit is unknown. Tokens are never printed or stored. `check` now needs `--mock` or `--live`. *Build*
- `ghostgrant decommission <manifest.yaml>` validates a manifest, refuses anything shaped like a raw secret without echoing it, and writes a record with a timestamp and the manifest's SHA-256. `ghostgrant check --mock` prints canned alive/dead for every recorded credential. Manifest format in `docs/manifest.md`. New runtime dependency: `yaml`. *Build*

## 2026-10-04

**Added**
- Project scaffold: a TypeScript CLI that answers `--help` and `--version` and nothing else yet, with `npm run build`, `npm test` and `npm run lint` all passing.
- MIT license.

**Docs**
- Root README, docs hub, roadmap with release gates, and this changelog.
- The product spec and build plan, copied from the business plan into `docs/product/`.
- `CLAUDE.md` for the weekly roadmap agent.

---

<p align="center">
  <a href="README.md">← Docs home</a> ·
  <a href="ROADMAP.md">← Roadmap</a>
</p>
