# Upstreams

Every external service, tool, and platform GhostGrant depends on, what the code assumes about
each, and where to check whether that assumption still holds. The biweekly **Ghost-Grant
Upstream Check** routine (`upstream/auto-*` PRs) works from this file. Keep it current by hand
too: a new provider adapter is a new row.

GhostGrant is a local, read-only CLI plus a static demo page. It has no backend. Its only
outbound calls are the providers' own introspection endpoints, listed below. The GitHub
and Slack adapters exist in `src/adapters.ts` today; the AWS IAM adapter gets its row when
it lands.

**Last checked** is filled in by the routine, and only with a date it actually read the
source. `—` means never checked.

## Provider endpoints

| Upstream | What the code assumes | Code | Check at | Last checked |
|:---|:---|:---|:---|:---|
| **GitHub REST API: `GET /user`** | `GET https://api.github.com/user` with `Authorization: Bearer <token>` and `X-GitHub-Api-Version: 2022-11-28`. Also sends `Accept: application/vnd.github+json` and a `User-Agent`. Status 200 means alive, 401 means dead; any other status, a timeout or a network error is `unknown`, never dead | `src/adapters.ts` | docs.github.com/en/rest/users/users#get-the-authenticated-user; docs.github.com/en/rest/overview/api-versions | 2026-11-17 |
| **Slack Web API: `auth.test`** | `POST https://slack.com/api/auth.test` with `Authorization: Bearer <token>`. HTTP 200 with `ok: true` is alive; the body errors `invalid_auth`, `token_revoked`, `token_expired` and `account_inactive` are dead; any other error, a non-200 status, a timeout or a non-JSON body is `unknown`, never dead | `src/adapters.ts` (`slack`, `SLACK_DEAD`) | docs.slack.dev/reference/methods/auth.test | 2026-11-17 |

## Platform and tools

| Upstream | What the code assumes | Code | Check at | Last checked |
|:---|:---|:---|:---|:---|
| **Node.js** | `engines.node: ">=22.18"`: relies on Node stripping TypeScript types by default, the built-in `fetch`, and `node --test`. CI and the Pages workflow pin Node 22 | `package.json`, `.github/workflows/ci.yml`, `.github/workflows/pages.yml` | nodejs.org/en/about/previous-releases; raw.githubusercontent.com/nodejs/Release/main/schedule.json | 2026-11-17 |
| **GitHub Pages** | `pages.yml` builds with `npm run build:site` and publishes with `actions/upload-pages-artifact@v3` and `actions/deploy-pages@v4`. The artifact is the `_site/` folder holding `site/index.html` and `site/demo-report.json` | `.github/workflows/pages.yml`, `package.json` (`build:site`) | docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages; github.com/actions/deploy-pages/releases | — |
| **Pinned GitHub Actions** | `actions/checkout@v4`, `actions/setup-node@v4`, `actions/upload-pages-artifact@v3`, `actions/deploy-pages@v4` | `.github/workflows/ci.yml`, `.github/workflows/pages.yml` | github.com/actions/setup-node/releases; github.com/actions/upload-pages-artifact/releases | 2026-11-17 |

## Libraries and language

| Upstream | What the code assumes | Code | Check at | Last checked |
|:---|:---|:---|:---|:---|
| **yaml** (`^2.9.1`) | Parses the user's YAML manifest of credentials | `src/manifest.ts`, `package.json` | github.com/eemeli/yaml/releases | 2026-11-17 |
| **TypeScript** (`~6.0`, dev) | Pinned to `~6.0` because `typescript-eslint` does not support 7.x yet. `erasableSyntaxOnly` and `rewriteRelativeImportExtensions` are on. The demo page compiles with its own `site/tsconfig.json` | `package.json`, `tsconfig.json`, `tsconfig.build.json`, `site/tsconfig.json` | devblogs.microsoft.com/typescript; github.com/typescript-eslint/typescript-eslint/releases (supported TypeScript range) | 2026-11-17 |
| **ESLint 9 and typescript-eslint** (dev) | Flat config, `@eslint/js` recommended and `typescript-eslint` recommended | `eslint.config.js`, `package.json` | eslint.org/blog; typescript-eslint.io/blog | — |

Flag breaking majors, EOL runtimes, and security advisories only. Routine bumps are
Dependabot's job.
