# ko-qa-kit

A CLI that scaffolds **Cursor** configuration for QA test-authoring repos. It detects the repo's
archetype and installs matching Cursor resources — slash commands, skills, subagents, a rule, an
`AGENTS.md`, a privacy hook, and MCP/CLI config — into the project's `.cursor/` (plus a root
`AGENTS.md`).

Covers two QA archetypes: web end-to-end testing via **Playwright BDD** (`e2e-playwright`) and
mobile testing via **Appium + Cucumber-JVM on BrowserStack** (`mobile-appium`). Behavior —
detection, manifest tracking, pruning, exports — is driven by a bundled scaffolding engine
(vendored at `vendor/kit-core/`).

Built for Kmart/Target AU repos but generic enough for any Playwright BDD or Appium/Cucumber-JVM
test suite.

## Archetypes

| Archetype | Stack | Detected by |
|---|---|---|
| `mobile-appium` | **Java + Cucumber-JVM + Appium** mobile test suite, executed on BrowserStack | `pom.xml` with Appium `java-client` + a Cucumber-JVM runner (`cucumber-java` / `cucumber-junit-platform-engine` / `cucumber-junit`) |
| `e2e-playwright` | **Playwright BDD** + custom step registry + pwHelper | `@playwright/test` + (`playwright-bdd` / `@cucumber/cucumber`) or `**/*.feature` |

Detection priority: `mobile-appium` → `e2e-playwright`. `mobile-appium` is checked via `pom.xml`
(Maven), independent of the `package.json`-based checks `e2e-playwright` uses — a repo can have
both (e.g. a `package.json` for commitlint tooling only) without conflicting; `mobile-appium`
always wins when both signals are present.

## Install

Requires Node ≥ 20.

```bash
git clone <this-repo-url> ko-qa-kit
cd ko-qa-kit && npm install && npm link
```

## Usage

Run inside a repo:

```bash
ko-qa-kit init                                # detect archetype, scaffold .cursor/ + AGENTS.md, prune mismatches
ko-qa-kit init --archetype mobile-appium      # non-interactive (CI/scripts)
ko-qa-kit prune                               # remove resources that don't match the archetype
ko-qa-kit install <type> <name> [-g]          # install one resource (skill|agent|command|hook)
ko-qa-kit install folder qa [--all] [-g]      # install every qa/ command + its dependency union
ko-qa-kit uninstall <type> <name> [-g]        # remove one installed resource (kept if another kit still needs it)
ko-qa-kit list                                # list available resources
ko-qa-kit export <command-name> [-o dir] [--plugin]   # export a command + dependencies as a portable bundle
ko-qa-kit export-plugin [-n name] [-c cmd,cmd] [-d desc]   # mint a custom Cursor plugin from chosen commands
```

`init` records what it installed in `.cursor/.ko-qa-kit-manifest.json` (kit version, archetype,
file hashes). Re-running `init` uses it to remove files an older kit version shipped that the
current one no longer does — unmodified files only; anything you've edited is kept and reported.
If another installed kit (e.g. `ko-dev-kit`) still claims a shared file, it's kept regardless.

Then open the repo in **Cursor**. After scaffolding, run `/ko-onboard`-equivalent guidance in the
archetype's `AGENTS.md` (filled manually, or via `ko-dev-kit`'s `/ko-onboard` if that kit is also
installed) to record the repo's real commands and conventions.

### Example workflow

```bash
cd ~/repos/ko-mobile-tests
ko-qa-kit init
# → Detected: mobile-appium
# → Created 9 files, skipped 0 (first run)
# → Open in Cursor
```

### Manual install (add individual resources)

```bash
# Add a skill to any repo
ko-qa-kit install skill dom-sight

# Install globally (available in ALL repos via ~/.cursor/)
ko-qa-kit install agent test-debugger -g

# Remove a resource you no longer want
ko-qa-kit uninstall skill mobile-browserstack-triage
```

The `install` command ignores archetype restrictions — it copies any template directly.
`uninstall` checks whether another installed kit still needs the file before removing it.

### Export (share commands without the kit)

```bash
# Bundle a command + all its dependencies into a portable folder
ko-qa-kit export ko-e2e-test

# Custom output directory
ko-qa-kit export ko-mobile-heal -o ~/shared-commands

# As an installable single-command Cursor plugin (adds .cursor-plugin/plugin.json)
ko-qa-kit export ko-e2e-heal --plugin
```

Produces a self-contained folder the recipient copies into their `.cursor/` (or, with
`--plugin`, drops into `~/.cursor/plugins/local/`). No Node, no CLI required on their end.
Dependencies come from the command's frontmatter keys (`skills`/`agents`/`rules`/`skills-optional`);
commands without them fall back to a body scan.

### Mint a custom plugin

```bash
# Interactive — asks for a plugin name, then a flat, space-select list of every qa/ command
# (ko-qa-kit has a single command folder, so there's no folder-browsing step)
ko-qa-kit export-plugin

# Non-interactive
ko-qa-kit export-plugin -n mobile-starter -c ko-mobile-test,ko-mobile-heal -d "Mobile Appium test helpers"
```

The result in `exported/<name>/` contains everything the plugin needs — the commands, the
union of their skill/agent/rule dependencies, an auto-merged `mcp.json` when the commands
require MCP servers, a `.cursor-plugin/plugin.json` manifest, and a README with install steps.
Use it directly (`~/.cursor/plugins/local/<name>`) or push it to any Git repo and import it via
**Cursor Dashboard → Plugins → Add Marketplace**.

## What gets installed

| Resource | Lands at | Ownership |
|---|---|---|
| Slash commands | `.cursor/commands/*.md` (`/ko-*`) | kit-managed (overwritten on `init`) |
| Skills | `.cursor/skills/<name>/SKILL.md` (+ `references/`) | kit-managed |
| Subagents | `.cursor/agents/*.md` | kit-managed |
| Rules | `.cursor/rules/*.mdc` | user-protected (never overwritten) |
| Project context | root `AGENTS.md` | user-protected |
| Privacy hook | `.cursor/hooks/privacy-block.cjs` + `.cursor/hooks.json` | script kit-managed; `hooks.json` user-protected |
| MCP servers | `.cursor/mcp.json` | user-protected |
| CLI permissions | `.cursor/cli.json` | user-protected |

"User-protected" files are created once and never overwritten — edit them freely. Re-running
`init` refreshes the kit-managed commands/skills/agents.

## Resource matrix

**`e2e-playwright` and `mobile-appium` are QA-only, test-authoring repos** — each archetype gets
*only* its own row below (commands, skills, agent, rule); there is no shared, generic
dev-workflow command or agent set here (that lives in `ko-dev-kit`). `AGENTS.md`, the privacy
hook, and `mcp.json`/`cli.json` still install normally for every archetype; only the
command/agent/skill set is scoped per archetype. Since a repo can only ever match one of the two
archetypes, their resources never install together.

- hook: `privacy-block`; settings: `mcp.json` (per-archetype variants win — `mcp.e2e-playwright.json`, `mcp.mobile-appium.json`), `cli.json`
- rule: `coding-standards.mdc` (always applied, in addition to the archetype rule below)

| Archetype | rule | skills | commands | agent |
|---|---|---|---|---|
| `e2e-playwright` | `e2e-playwright.mdc` | `playwright-bdd`, `bdd-authoring`, `step-registry`, `dom-sight` | `ko-e2e-test`, `ko-e2e-heal` | `qa-automation-engineer`, `e2e-debugger` |
| `mobile-appium` | `mobile-appium.mdc` | `mobile-browserstack-triage` | `ko-mobile-test`, `ko-mobile-heal` | `test-generator`, `test-debugger` |

Both archetypes' commands live under `templates/commands/qa/` (source organization only — see
[Commands reference](#commands-reference)).

## Commands reference

### e2e-playwright commands
| Command | Purpose |
|---------|---------|
| `/ko-e2e-test` | Generate a test reuse-first: registry match → [REUSE]/[ADAPT]/[NEW] proposal → generate → verify → hand off failures |
| `/ko-e2e-heal` | Triage a failing/flaky test (defect vs product regression), delegate repair to `e2e-debugger`, re-verify to stability |

### mobile-appium commands
| Command | Purpose |
|---------|---------|
| `/ko-mobile-test` | Generate/extend mobile coverage reuse-first: search existing feature/step/page/service/constants → [REUSE]/[ADAPT]/[NEW] proposal → delegate to `test-generator` → verify on BrowserStack → hand off failures |
| `/ko-mobile-heal` | Diagnose a failing/flaky mobile test (BrowserStack MCP evidence when configured, else Surefire/Cucumber reports), present a Heal Plan, delegate repair to `test-debugger`, re-verify to stability |

## MCP notes

- **Playwright MCP** (`@playwright/mcp`, `templates/settings/mcp.e2e-playwright.json`) is
  optional — `e2e-playwright` commands work without it (falling back to running Playwright
  directly), but installing it gives `dom-sight`/the e2e agents live browser inspection during
  test authoring and healing.
- **BrowserStack MCP** (`@browserstack/mcp-server`, `templates/settings/mcp.mobile-appium.json`)
  requires `BROWSERSTACK_USERNAME` and `BROWSERSTACK_ACCESS_KEY` environment variables to be set
  wherever Cursor runs — the config references them via `${VAR}` substitution, never as literal
  credentials in the file. Without them configured, `/ko-mobile-heal` degrades to reading local
  Surefire/Cucumber reports instead of live BrowserStack session evidence.

## Commit conventions

- **e2e-playwright**: Standard Conventional Commits (`feat(login): add password-reset test`)

Common rules:
1. **Only commit when in a git worktree.** If not in a worktree, leave changes uncommitted for the user.
2. **Under 10 words.** Keep commit messages concise.
3. **Validate against Husky.** Check pre-commit hooks before committing.

## Repos with existing `.cursor/` config

If a repo already has `.cursor/rules/` or `.cursor/skills/`, the kit's `copyIfNotExists` behavior
ensures existing files are never overwritten. Kit-installed rules use distinct filenames
(`coding-standards.mdc`, `e2e-playwright.mdc`, `mobile-appium.mdc`) that coexist with your
existing rules. The archetype rules explicitly note that repo-specific rules take precedence.

## Cursor notes

- **Skills and subagents** are recent Cursor features. Use a current Cursor build; on older
  versions, commands and rules still work.
- **Rules** apply automatically: `coding-standards.mdc` is always on; the archetype rule attaches
  by its `globs`. `AGENTS.md` is loaded by Cursor as project context.
- **Hooks**: only a privacy hook ships (denies reads/shell/MCP touching likely-secret files).

## Develop

```bash
npm install
npm test          # vitest: detection, consistency
npm run test:watch
```

Templates live in `templates/`. Add a resource there and register it in `ARCHETYPE_RESOURCES` in
`src/scaffold.js` — every resource in this kit is archetype-restricted (there's no shared-across-
archetypes case, since `e2e-playwright` and `mobile-appium` never coexist in one repo).
`tests/consistency.test.js` validates archetype labels/refs, template existence, command
frontmatter schema, declared-dependency existence/compatibility, and an anti-fiction lint that
bans references to APIs/files/flags (`snapshotDOM`, `.auth/user.json`, `storageState`, `@smoke`,
etc.) that don't exist in the real consumer repo family.

## Project structure

```
ko-qa-kit/
├── bin/cli.js           # CLI entry point (init, prune, install, uninstall, export, list)
├── src/
│   ├── detect.js        # Archetype detection logic (mobile-appium, e2e-playwright)
│   ├── init.js           # init/prune command orchestration
│   └── scaffold.js       # ARCHETYPE_RESOURCES map + thin wrapper over kit-core's engine
├── templates/
│   ├── agents/           # Subagent definitions (4 agents)
│   ├── agents-md/        # AGENTS.md templates per archetype (2 files)
│   ├── commands/qa/      # Slash command definitions (4 commands)
│   ├── hooks/            # Privacy hook script + config
│   ├── rules/            # .mdc rule files (3 rules: shared coding-standards + 2 archetype)
│   ├── settings/         # CLI permissions + MCP config (base + per-archetype variants)
│   └── skills/           # Skill definitions (5 skills)
├── tests/                # Vitest: detect, consistency
├── package.json
└── README.md
```

## Looking for other roles?

- Engineering (`fe-nx`, `nestjs-graphql`, `design-system`) — see [`../ko-dev-kit`](../ko-dev-kit).
- Product/BA and design commands — see [`../ko-product-kit`](../ko-product-kit).
