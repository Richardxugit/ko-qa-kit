# ko-qa-kit

A CLI that scaffolds **Cursor** configuration for QA test-authoring repos. It detects the repo's
archetype(s) and installs matching Cursor resources — slash commands, skills, subagents, rules, an
`AGENTS.md` seed, a privacy hook, and MCP/CLI config — into the project's `.cursor/`.

Covers two QA archetypes: web end-to-end testing via **Playwright BDD** (`e2e-playwright`) and
mobile testing via **Appium + Cucumber-JVM on BrowserStack** (`mobile-appium`).

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
ko-qa-kit export ko-e2e-test --plugin             # export one command as a marketplace-ready plugin bundle
ko-qa-kit export-plugin -n ko-e2e -c ko-e2e-test,ko-e2e-verify,ko-e2e-heal -d "E2E workflow" \
  --author "Jane Doe <jane@corp.com>" --category testing
```

`export` / `export-plugin` produce **marketplace-ready** bundles: full `.cursor-plugin/plugin.json`
(displayName/author/license/category/folder pointers), LICENSE, the kit hooks with plugin-relative
wiring (`--no-hooks` to skip), an `mcp.json` union of the servers for the archetypes owning the
selected commands (e2e → Playwright, mobile → BrowserStack), and project-scope skill references
rewritten to plugin-relative paths.

### What lands where

| Resource | Destination | Ownership |
|---|---|---|
| Commands / agents / skills | `.cursor/commands|agents|skills/` | kit-managed (overwritten on re-init) |
| Rules | `.cursor/rules/*.mdc` | **merge-protected**: user edits are kept; the kit version lands as `<rule>.mdc.kit-update` |
| MCP servers | `.cursor/mcp.json` | user-protected (generated per archetype set: Playwright MCP for e2e, BrowserStack MCP for mobile) |
| `cli.json` | `.cursor/` | user-protected |
| `hooks.json` | `.cursor/` | **merged on re-init**: kit-owned entries sync to the template (new wiring lands automatically); your own entries are kept |
| Hook scripts | `.cursor/hooks/*.cjs` | kit-managed |
| Hook policy | `.cursor/hooks/destructive-rules.json` | merge-protected (team-editable) |
| `AGENTS.md` | repo root | user-protected |

**Hooks**: `privacy-block` denies reads/shell/MCP/Tab reads touching secret-grade files (`.env.secret`, keys,
certs, credential stores). Plain `.env` files hold dev-environment values only and are readable. `safety-guard` guards destructive shell commands — **what** it blocks is policy and lives in
`.cursor/hooks/destructive-rules.json` (deny / ask tiers, an ask tier that warns on `--force-with-lease`,
and a `safeDeleteTargets` exemption list covering `node_modules`, `test-results`, `playwright-report`,
`allure-results`, `target`, `dist`, `build`, `coverage`): edit the JSON to change the policy, no JavaScript
required. The guard fails open WITH a visible warning if its policy file goes missing.
`edit-lint` runs on `postToolUse` (matcher `Write`): each agent-edited TS/JS file is linted with the
project's own eslint and errors feed back as `additional_context` (per-file cooldown, errors only,
silent when the repo has no eslint). `grep-negative` (matcher `Grep`): when a case-sensitive search
returns nothing, it reminds the agent that the literal being absent is not the concept being absent —
re-run case-insensitively with the codebase's variants before asserting absence.

## Resource matrix

| Archetype | Rules | Skills | Commands | Agents |
|---|---|---|---|---|
| `e2e-playwright` | `e2e-playwright.mdc` | `playwright-bdd`, `bdd-authoring`, `step-registry`, `dom-sight` | `ko-e2e-test`, `ko-e2e-heal`, `ko-e2e-verify` | `qa-automation-engineer`, `e2e-debugger` |
| `mobile-appium` | `mobile-appium.mdc` | `mobile-browserstack-triage` | `ko-mobile-test`, `ko-mobile-heal` | `test-generator`, `test-debugger` |
| all | `coding-standards.mdc` | — | — | — |

## Development

```bash
pnpm test          # vitest: consistency + detect + scaffold suites
pnpm dup-check     # description-overlap audit: no two resources compete for the same request
pnpm run smoke     # init smoke tests against fixture repos
```

CI runs both on every push/PR.
