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
> **No provider gets called yet.** `decommission` records a manifest and `check --mock`
> answers every credential from canned responses. The GitHub, Slack and AWS adapters come
> next. See the [roadmap](docs/ROADMAP.md).

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
| **`ghostgrant check --mock`** | ✅ Answers every recorded credential from canned responses and prints alive/dead |
| **GitHub and Slack adapters** | Slices 1 and 2. Alive/dead from the provider's own endpoint |
| **Re-check windows and flip alerts** | Slice 3. 24h, 7d, 30d, 90d; dead-to-alive is logged as an alert |
| **`ghostgrant report <agent>`** | Slice 4. JSON and plain-text report across every window |
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

# 4. Tests and lint
npm test && npm run lint
```

## 🗂️ What's in here

| Folder | What's inside |
|:---|:---|
| [**📚 docs/**](docs/README.md) | The roadmap, the changelog, and the product spec and build plan. |
| [**🧰 src/**](src/README.md) | The CLI source. |
| [**📝 examples/**](examples/manifest.yaml) | A sample manifest for a fictional agent, used in the quick start. |
| [**🧪 test/**](test/cli.test.ts) | Tests for `node --test`, run straight from TypeScript. |
| [**🤖 CLAUDE.md**](CLAUDE.md) | Standing orders for the agent that works the roadmap each week. |

## 🔗 Related repositories

| Repo | How it relates |
|:---|:---|
| [**ai-automation-tools**](https://github.com/ai-automation-tools) | The org this lives in. Its other tools are listed on the profile page. |

---

<p align="center">
  Built with <a href="https://www.typescriptlang.org/">TypeScript</a> on <a href="https://nodejs.org/">Node.js</a> · <a href="docs/README.md">Docs</a> · <a href="LICENSE">MIT License</a>
</p>

<p align="right">(<a href="#readme-top">back to top</a>)</p>
