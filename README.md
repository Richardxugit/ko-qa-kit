# ko-qa-kit

A CLI that scaffolds **Cursor** configuration for QA test-authoring repos. It detects the repo's
archetype(s) and installs matching Cursor resources — slash commands, skills, subagents, rules, an
`AGENTS.md` seed, a privacy hook, and MCP/CLI config — into the project's `.cursor/`.

Covers two QA archetypes: web end-to-end testing via **Playwright BDD** (`e2e-playwright`) and
mobile testing via **Appium + Cucumber-JVM on BrowserStack** (`mobile-appium`).

Sibling of [ko-dev-kit](https://github.com/Richardxugit/ko-dev-kit) (engineering repos) — both kits
share the same scaffolding engine architecture and can coexist in one repo (separate manifests).

## Archetypes

| Archetype | Stack | Detected by |
|---|---|---|
| `mobile-appium` | **Java + Cucumber-JVM + Appium** mobile test suite on BrowserStack | `pom.xml` (root or one level down) with Appium `java-client` + a Cucumber-JVM runner |
| `e2e-playwright` | **Playwright BDD** + custom step registry + pwHelper | `@playwright/test`/`playwright` **plus** (`playwright-bdd` / `@cucumber/cucumber`) or `**/*.feature` files |

A repo can match **both** archetypes (e.g. web e2e suite + mobile suite) — `init` installs the
union of their resources. Detection scans workspace sub-packages (`apps/*`, `packages/*`, `e2e/`,
`mobile-tests/`, …) so suites living inside a monorepo are found. Every detection prints its
evidence. For multi-archetype repos, `AGENTS.md` is written as a minimal skeleton — fill in the
real structure and commands for each stack by hand.

## Install

Requires Node ≥ 20 and pnpm.

```bash
git clone https://github.com/Richardxugit/ko-qa-kit.git
cd ko-qa-kit && pnpm install && pnpm link --global
```

## Usage

Run inside a repo:

```bash
ko-qa-kit init                                    # detect archetype(s), confirm, install
ko-qa-kit init --archetype e2e-playwright         # skip detection (comma-separate for multi)
ko-qa-kit prune                                   # remove resources for archetypes you no longer match
ko-qa-kit install skill playwright-bdd            # install one resource
ko-qa-kit install rule e2e-playwright             # rules are resources too
ko-qa-kit uninstall command ko-e2e-heal           # remove one resource
ko-qa-kit export command ko-e2e-test ./out        # export a self-contained resource dir
```

### What lands where

| Resource | Destination | Ownership |
|---|---|---|
| Commands / agents / skills | `.cursor/commands|agents|skills/` | kit-managed (overwritten on re-init) |
| Rules | `.cursor/rules/*.mdc` | **merge-protected**: user edits are kept; the kit version lands as `<rule>.mdc.kit-update` |
| MCP servers | `.cursor/mcp.json` | user-protected (generated per archetype set: Playwright MCP for e2e, BrowserStack MCP for mobile) |
| `cli.json`, `hooks.json` | `.cursor/` | user-protected |
| Hook script | `.cursor/hooks/privacy-block.cjs` | kit-managed |
| `AGENTS.md` | repo root | user-protected |

## Resource matrix

| Archetype | Rules | Skills | Commands | Agents |
|---|---|---|---|---|
| `e2e-playwright` | `e2e-playwright.mdc` | `playwright-bdd`, `bdd-authoring`, `step-registry`, `dom-sight` | `ko-e2e-test`, `ko-e2e-heal` | `qa-automation-engineer`, `e2e-debugger` |
| `mobile-appium` | `mobile-appium.mdc` | `mobile-browserstack-triage` | `ko-mobile-test`, `ko-mobile-heal` | `test-generator`, `test-debugger` |
| all | `coding-standards.mdc` | — | — | — |

## Development

```bash
pnpm test          # vitest: consistency + detect + scaffold suites
pnpm run smoke     # init smoke tests against fixture repos
```

CI runs both on every push/PR.
