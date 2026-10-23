<a id="readme-top"></a>

<h1 align="center">👻 GhostGrant</h1>

<p align="center">
  <em>You retired the AI agent. GhostGrant checks that its GitHub, AWS and Slack credentials<br>actually stopped working, then checks again at 24 hours, 7 days, 30 days and 90 days.</em>
</p>

<p align="center">
  <a href="docs/README.md"><strong>Explore the docs »</strong></a>
</p>

<p align="center">
  <a href="docs/ROADMAP.md">Roadmap</a>
  ·
  <a href="https://github.com/ai-automation-tools/ghost-grant/issues">Report Bug</a>
  ·
  <a href="https://github.com/ai-automation-tools/ghost-grant/issues">Request Feature</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-MVP_Prototype-F59E0B?style=for-the-badge" alt="Status: MVP prototype">
  <a href="docs/ROADMAP.md"><img src="https://img.shields.io/badge/plan-ROADMAP-8B5CF6?style=for-the-badge" alt="Roadmap"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-2ea44f?style=for-the-badge" alt="License: MIT"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-6.0-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Node.js-22.18+-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js 22.18+">
  <img src="https://img.shields.io/badge/providers-GitHub_·_Slack_·_AWS_·_Okta_·_Google-6B7280?style=flat-square" alt="Providers: GitHub, Slack, AWS, Okta, Google Workspace">
</p>

---

> [!WARNING]
> **Only GitHub is wired up so far.** `check --live` asks GitHub; Slack and AWS answer
> `unknown` until their adapters land.
> See the [roadmap](docs/ROADMAP.md).

## 💡 What it's for

When a team shuts down an AI agent, somebody clicks revoke on its tokens and keys and
moves on. Nobody goes back to see whether the GitHub token still answers, whether the AWS
key got cached into some other job, or whether the Slack bot quietly came back after a
reinstall. GhostGrant does the going back.

You write a YAML manifest naming the credentials the agent held: type and identifier, never
the secret itself. GhostGrant asks each provider's own introspection endpoint whether each
one is dead, records the answer, and asks again at 24h, 7d, 30d and 90d. If a credential
flips from dead to alive between checks, it raises an alert. At the end you get a dated
report saying what was checked and what happened.

It is a local CLI. There's no GhostGrant server, no account, and no telemetry.

## 📊 Features

| Feature | Status |
|:---|:---|
| **`ghostgrant decommission <manifest>`** | ✅ Records a decommission entry with a timestamp and the manifest's checksum. [Manifest format](docs/manifest.md) |
| **`ghostgrant check --mock`** | ✅ Runs every check that's due against canned responses and prints alive/dead |
| **`ghostgrant check --live`** | ✅ GitHub: asks `GET /user` with each token you pipe in. 200 is alive, 401 is dead, a timeout, 5xx or rate limit is unknown. [Live checks](#-live-checks) |
| **Slack adapter** | Slice 2. Alive/dead from `auth.test` |
| **Re-check windows and flip alerts** | ✅ Each `check` runs the window that's due (at decommission, then 24h, 7d, 30d, 90d) and skips records with nothing due. Dead-to-alive prints an `ALERT` and goes to `alerts.log`. |
| **`ghostgrant report <agent>`** | ✅ A dated plain-text report of every check for one agent and what it found, or the same data with `--json`. [Reports](#-reports) |
| **AWS IAM, Okta, Google Workspace** | Slices 5 to 7 |
| **Static demo dashboard** | Slice 8. A mock report rendered in the browser |

What it won't do, on purpose: revoke anything for you, sign or "attest" its reports, or run
as a hosted service. The [spec](docs/product/spec.md#explicitly-out-of-scope-wont-this-version)
says why.

## 🚀 Quick start

```bash
# 1. Install dependencies (Node 22.18 or newer)
npm install

# 2. Build the CLI into dist/
npm run build

# 3. Record the example manifest (format: docs/manifest.md) and check it in mock mode
node dist/cli.js decommission examples/manifest.yaml
node dist/cli.js check --mock
node dist/cli.js report billing-bot --mock

# 4. Tests and lint
npm test && npm run lint
```

## 🔑 Live checks

`check --live` needs the tokens themselves, which the manifest never holds. Pipe them in on
stdin, one per line. Each token goes to the credential whose `prefix` it starts with, is
sent to that provider once, and is dropped when the run ends. Nothing prints or stores it.

```bash
printenv OLD_AGENT_GH_TOKEN | node dist/cli.js check --live
```

A credential with no matching token, or more than one, reports `unknown` and nobody is
called. So does every provider that doesn't have an adapter yet. `unknown` never counts as
dead.

## ⏱️ Re-checks and alerts

Each credential gets checked at decommission, then 24 hours, 7 days, 30 days and 90 days
after it. Run `ghostgrant check` as often as you like, by hand or from cron: it only asks
about the window that's due and says when the next one is. If you miss a window, the next
run checks the latest one that's due instead. An `unknown` answer doesn't settle a window,
so the next run asks again.

A credential whose last definite answer was dead and now answers alive prints an `ALERT`
line and adds one JSON line to `$GHOSTGRANT_HOME/alerts.log`. Mock and live answers are kept
apart, so a canned answer never counts as a real check.

## 📄 Reports

`ghostgrant report <agent>` prints every live check for one agent: each credential, each
window, when it was asked and what came back, with any dead-to-alive flip marked. Add
`--mock` to report the mock checks instead (the two are never mixed), and `--json` for the
same data as JSON. The JSON shape is the `Report` type in [`src/report.ts`](src/report.ts).

The last line says what the checks add up to:

| Verdict | Meaning |
|:---|:---|
| `clean` | Every credential answered dead at every window checked, through 90d |
| `dead-so-far` | Every answer so far is dead; the line says when the next check is due |
| `unknown` | A credential has no alive or dead answer for a window that was checked |
| `alive` | A credential's latest answer is alive |
| `flipped` | A credential went from dead back to alive |
| `not-checked` | No checks of that kind yet |

`unknown` never counts as dead, so it keeps a report from being `clean`. The report says
what was checked and what each provider answered, nothing more: it isn't signed, and it
isn't compliance evidence.

## 🗂️ What's in here

| Folder | What's inside |
|:---|:---|
| [**📚 docs/**](docs/README.md) | The roadmap, the changelog, and the product spec and build plan. |
| [**🧰 src/**](src/README.md) | The CLI source. |
| [**📝 examples/**](examples/manifest.yaml) | A sample manifest for a fictional agent, used in the quick start. |
| [**🧪 tests/**](tests/cli.test.ts) | Tests for `node --test`, run straight from TypeScript. |
| [**🤖 AGENTS.md**](AGENTS.md) | Standing orders for the agent that works the roadmap each week. `CLAUDE.md` imports it for Claude Code. |

## 🔗 Related repositories

| Repo | How it relates |
|:---|:---|
| [**ai-automation-tools**](https://github.com/ai-automation-tools) | The org this lives in. Its other tools are listed on the profile page. |

---

<p align="center">
  Built with <a href="https://www.typescriptlang.org/">TypeScript</a> on <a href="https://nodejs.org/">Node.js</a> · <a href="docs/README.md">Docs</a> · <a href="LICENSE">MIT License</a>
</p>

<p align="right">(<a href="#readme-top">back to top</a>)</p>
