---
name: ko-e2e-test
description: Generate a new e2e test — reuse-first via the step registry, real DOM discovery with an intent→Element Map gate for brand-new screens (Playwright MCP or codegen), convention-conformant feature/steps/pages — then verify and hand off failures to /ko-e2e-heal
args: "<flow description | Jira ticket | recorded flow>"
skills: [bdd-authoring, playwright-bdd, step-registry, dom-sight]
agents: [e2e-debugger]
rules: [e2e-playwright]
---

# Generate an E2E test

> Turn a flow description (or a recorded session) into a convention-conformant Playwright BDD test: `.feature` file, step definitions, page objects. Reuse before writing, verify before reporting, hand off to `/ko-e2e-heal` on failure — this command generates, it does not debug.

Read the `bdd-authoring`, `playwright-bdd`, `step-registry`, and `dom-sight` skills first, and follow `.cursor/rules/e2e-playwright.mdc`. Consult `AGENTS.md` for the repo layout, run commands, and registry aliases — the commands below show the common defaults; the repo's own aliases win.

## Conventions quick-reference

These are non-negotiable for generated code (details in the skills):

- **Page objects are singletons.** `class FooPage extends BasePage`, selectors as **strings** in the `elements` object, exported as a singleton and registered in the `src/pages/index.ts` barrel. The first step of a flow opens the page (`await fooPage.open(page)` — this hands the `page` to the `pwHelper` singleton).
- **`pwHelper` methods take Locators, not selector strings.** Wrap at the call site: `await pwHelper.click(this.locator(this.elements.submitButton))`. Never call `page.*` directly. <!-- TODO(repo): confirm the exact wrap helper name from BasePage/pwHelper -->
- **One selector per element**, `data-testid` first, then role/label, then text, then scoped CSS. Never fallback chains, never XPath.
- **Steps are regex-only** via `createBdd()`: `When(/^I add "(.+)" to my cart$/, ...)`. Cucumber expressions are forbidden. Steps orchestrate page objects; no raw selectors in steps.
- **Cross-step state** goes on typed `global.*` properties (declared in the global type file), cleaned up in `After` hooks. Never module-level variables.
- **Tags:** priority (`@regression` or `@sanity`), locale modifiers where relevant (`@auOnly`), `@quarantine` only via heal escalation. Jira ticket tags (`@CON-1234`) are **allowed** for traceability. Line 1 of every `.feature` is the feature-level domain tag (`@checkout`, `@wishlist`, …). There is no `@smoke` tag in this family.
- **Web-first assertions** in `Then` steps only — one assertion-of-intent per step. Never `waitForTimeout`.

## Flow

### 1. QUICK-START — confirm scope (stop and wait)

Restate the flow as a user goal in business language. Identify:
- the screen(s) involved and the RUN_MODE family it belongs to (`e2e` real env / `ui` WireMock-mocked / `functional` / `dynamoDB`),
- the happy path and whether an alternate/failure path is in scope,
- data needs (existing fixture data vs new unique data).

Present this as a short summary and **stop for confirmation** before generating anything. Skip the stop only if the user already gave an unambiguous, fully-specified flow.

### 2. DISCOVER — walk the flow on the real app

Selectors are never guessed. For screens no page object covers yet — a brand-new feature is the extreme case: nothing in the registry, only the user's description — discovery is where that description becomes DOM evidence. Full decision guide in the `dom-sight` skill.

If the user already provided a recording, or the flow only touches existing page objects, skip straight to MATCH.

**2a. Decompose the description into intents.** Turn the flow into an ordered intent list, one row per user action or check:

| # | Screen | Action | Target (business language) | Data | Expected outcome |
|---|--------|--------|---------------------------|------|------------------|

Fill gaps from the registry and existing features first — a similar screen often names the pattern. What stays ambiguous (which screen starts the flow? what outcome proves success?) goes back to the user as **one bounded round of questions**. Never infer an unstated assertion.

**2b. Access preflight (blocking).** Two **independent** conditions decide whether the feature is even visible: a **signed-in user**, and a **cookie patch** (feature flags, locale, consent — brand-new features are often behind a flag cookie even on public flows). If the description doesn't answer both, ask — and do not start the walk until answered.

- **Login needed** → create a fresh account by driving the repo's existing registration/sign-up flow through MCP — the same way every test run gets its user (search the registry for the registration steps/pages as the map). Never a shared account, never credentials from secret files.
- **Cookie patch needed** (with or without login) → mirror the suite's cookie-patch mechanism: find which cookies/values the suite patches <!-- TODO(repo): name the cookie helper + where the patched values live -->, `browser_navigate` to the app domain, set them via `browser_evaluate` (`document.cookie`), then re-navigate. JS-set cookies can't cover HttpOnly cookies — if the repo's patch depends on those, use codegen or trace snapshots for that screen.
- **Both** → register first, then patch cookies on the authenticated session.

**2c. Live walk (Playwright MCP — preferred when configured).** If `.cursor/mcp.json` defines the `playwright` server: `browser_navigate` to the starting screen and read the `browser_snapshot` accessibility tree. For each action intent, find candidate elements by role/name/text proximity to the intent's target phrase (matching heuristics in `dom-sight`). Interact (`browser_click`, `browser_type`) to advance the flow so **every screen in the flow gets snapshotted** — the walk doubles as proof the flow actually works before any code is written.

**Codegen recording (fallback — or by preference).** `npx playwright codegen --output=.tmp/recorded-flow.ts <url>` when the MCP server isn't configured, can't be installed or won't start, the HttpOnly caveat blocks the cookie patch — or simply when the user prefers to record; their choice wins. Walk the flow by hand, lift **stable** locators (`data-testid` first), then delete `.tmp/recorded-flow.ts`; it is raw material, never committed.

**2d. Element Map — stop and wait.** Present the mapping, one row per intent:

| # | Intent | Matched element (role "name" [ref]) | Proposed selector | Evidence | Confidence |
|---|--------|--------------------------------------|-------------------|----------|------------|

- Selector priority: `data-testid` → role/label → text → scoped CSS. One selector per element — never fallback chains.
- **Ambiguity protocol:** zero or multiple plausible candidates for an intent → show the alternatives with their snapshot evidence and ask. Never silently pick.
- Flag every mapped element that lacks a `data-testid` — the REPORT recommends the app team add one (recommendation only; this command never edits app code).

**Stop and wait for confirmation of the Element Map** before writing any code — it is the selector source of truth for everything generated below.

### 3. MATCH — search the registry, never grep

**NEVER grep/ripgrep/file-search for step definitions.** Use the registry (aliases in `AGENTS.md`):

```bash
pnpm registry:search --step "add to cart"
pnpm registry:search --page "wishlist"
pnpm registry:search --element "submit button"
pnpm registry:search --feature "@checkout"
```

For every Gherkin line you intend to write, find the closest existing step. For every screen, find the existing page object and its elements.

**An empty registry result is the expected outcome for a brand-new feature — not a dead end.** The confirmed Element Map from DISCOVER becomes the selector source of truth: the PROPOSE table will be all-[NEW], each row citing its Element Map row as provenance. Still search first — even new features reuse login, navigation, and assertion steps.

### 4. PROPOSE — reuse plan (stop and wait)

Present a table of the planned scenario, one row per step, each marked:

- **[REUSE]** — an existing step matches as-is (show its regex + file).
- **[ADAPT]** — an existing step almost matches; propose the reworded Gherkin that matches its regex, or a parameter generalization of the existing step.
- **[NEW]** — nothing covers it; show the proposed regex, the page object (existing or new), and the new `elements` entries with their selectors and where each selector came from (cite the Element Map row / MCP snapshot node / codegen line).

**Stop and wait for approval.** Reuse beats elegance: prefer rewording the scenario to hit an existing step over minting a near-duplicate.

### 5. GENERATE

- `.feature` under the correct RUN_MODE folder (`src/features/e2e/<domain>/`, `src/features/ui/…`, …), feature-level domain tag on line 1, scenario tags per the quick-reference.
- New steps in `src/steps/`, regex-only, delegating to page objects.
- New/extended page objects in `src/pages/` (singleton pattern, `elements` strings), **registered in the `src/pages/index.ts` barrel**.
- New cross-step state declared on the typed `global` interface and cleaned up in `After`.
- Regenerate the registry (`pnpm registry:gen`).

### 6. VERIFY — max 2 runs, then hand off

Run only the new scenario with the repo runner and a trace, e.g.:

```bash
./scripts/run-tests.sh -e <env> -l AU -t "@<your-tag>"   # confirm flags in AGENTS.md
npx playwright test --grep "<scenario>" --trace on        # fallback if no runner script
```

- **Pass** → report.
- **Fail** → you get **one** correction attempt for obvious generation slips (typo'd selector, wrong folder, missed barrel registration). If the second run fails, **stop generating**: this command does not debug.

### 7. HANDOFF (on failure)

Write `.tmp/handoff.json`:

```json
{
  "scenario": "<name>",
  "feature": "src/features/e2e/<domain>/<file>.feature",
  "files": ["<steps>", "<pages>"],
  "error": "<first error line>",
  "trace": "<path to trace.zip>",
  "attempts": 2,
  "from": "ko-e2e-test"
}
```

Then tell the user to run `/ko-e2e-heal` (it reads the handoff automatically), or invoke the `e2e-debugger` agent directly with the same payload if the user asks you to continue.

### 8. REPORT

Files created/changed, reuse stats ([REUSE]/[ADAPT]/[NEW] counts), the exact command to run just this flow, the missing-`data-testid` recommendations for the app team (from the Element Map), and — if handed off — the handoff path and what the debugger should look at first.

## Product-gap rule

If the scenario fails because the app genuinely lacks the behavior (feature not implemented, real regression), the test is **correctly red**. Do not bend the test toward green — report the gap with the evidence and stop.
