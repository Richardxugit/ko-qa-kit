---
name: ko-mobile-test
description: Generate or extend mobile Appium/Cucumber-JVM test coverage — reuse-first across existing feature/step/page/service/constants/entity files, evidence-based locators, delegated to the test-generator agent, then verify against BrowserStack and hand off failures to /ko-mobile-heal
args: "[--local] <behavior objective | ticket | scenario description>"
skills: [mobile-browserstack-triage]
agents: [test-generator]
rules: [mobile-appium]
---

# Generate mobile test coverage

> Turn a behavior objective into convention-conformant Appium/Cucumber-JVM coverage — reuse-first, evidence-based locators, verified on BrowserStack. This command orchestrates and verifies; the **`test-generator`** agent does the authoring.

Follow `.cursor/rules/mobile-appium.mdc`. Check `AGENTS.md` and the relevant
`.github/instructions/*.instructions.md` files for this repo's exact package layout, run
commands, and conventions — the defaults below are illustrative, not assumed.

## 1. Scope — confirm before generating (stop and wait)

Collect what `test-generator` needs:

- The behavior objective (new scenario, or an update to existing coverage).
- Target module/screen and market context (AU, NZ, or both).
- Acceptance criteria — the observable outcome that proves the scenario works.

Ask only for whichever of these is missing — skip the stop if the input is already unambiguous
and complete. Restate the scope as a one-line summary before proceeding.

## 2. Reuse search

Before anything is generated, search existing coverage for what already applies:

- Existing `.feature` files covering the same or an adjacent screen/flow.
- Existing step definitions whose Gherkin text is close enough to reuse or lightly adapt.
- Existing page objects (`*Page.java`) and their `elements`/locator constants for the target
  screen — most new coverage extends an existing page, it doesn't start one from scratch.
- Existing service objects for any cross-page orchestration the flow needs.

An empty result for a brand-new screen is expected, not a dead end — proceed to Discovery.

## 3. Discovery — evidence for any new locator

Never invent a selector. For elements no existing page object covers, evidence comes from the
active execution path:

- **BrowserStack path** — BrowserStack MCP session state, an App Live capture, or ask the user
  for one. State exactly which screen/element you need evidence for.
- **Local path (`--local`)** — boot the local emulator with the user's APK (see the
  local-execution reference) and dump the screen: `adb shell uiautomator dump` + pull the XML,
  or attach Appium Inspector.
- Either way, a previously captured page-source XML or screenshot of the target screen works
  directly — check for one first.
- From the evidence, derive locators in priority order: Accessibility ID → `_ANDROID_ID` (only
  when a stable resource-id is present) → XPath (`_ANDROID_XPATH` / `_IOS_XPATH`) as a last
  resort. Keep Android/iOS pairs on the same base constant name.

Skip this step entirely if the flow only touches screens with existing page-object coverage.

## 4. Propose — reuse plan (stop and wait)

Present the planned scenario as a table, one row per step, each marked:

- **[REUSE]** — an existing step/method matches as-is.
- **[ADAPT]** — an existing step/method almost matches; propose the minimal generalization.
- **[NEW]** — nothing covers it; show the proposed step text, the page/service method, and any
  new locator constants with the evidence they're derived from.

Wait for approval. Reuse beats a fresh abstraction — prefer adapting an existing step's wording
over minting a near-duplicate.

## 5. Delegate to `test-generator`

Dispatch the **`test-generator`** agent with: the approved reuse plan, the behavior objective and
acceptance criteria, and the discovery evidence for any new locators. It authors the synchronized
`feature → step → service/page → constants` (+ `data`) change and reports per its own output
format.

## 6. Verify — max 2 runs, then hand off

Two execution paths, chosen per run:

- **BrowserStack (default)** — run the new/updated scenario against the repo's BrowserStack
  profile (confirm exact flags in AGENTS.md).
- **Local (`--local`)** — the user drops the APK into the repo's local-app folder; boot a local
  emulator and verify there. Follow the **local-execution reference**
  (`mobile-browserstack-triage` → `references/local-execution.md`): repo support check → APK
  present → toolchain probe → Node-version-manager false negatives → stop-and-ask on anything
  missing.

Without `--local`, run only the new/updated scenario against BrowserStack (confirm the exact
Maven/profile flags in `AGENTS.md`; illustrative default):

```bash
mvn clean test "-Dcucumber.filter.tags=@<new-scenario-tag>" -Dspring.profiles.active=<env>,<platform>,<locale>
```

- **Pass** → go to Report.
- **Fail** → one correction attempt for an obvious generation slip (typo'd locator, wrong tag,
  missed step binding). If the second run still fails, **stop generating** — this command does
  not debug — go to Handoff.

## 7. Handoff (on failure)

Summarize for the user: the scenario name, feature path, files touched, the first error, and the
BrowserStack session link (or `target/surefire-reports/`/`target/cucumber-reports/` path) —
then tell them to run `/ko-mobile-heal`, or invoke the `test-debugger` agent directly with the
same evidence if they ask you to continue immediately.

## 8. Report

Files created/changed, reuse stats ([REUSE]/[ADAPT]/[NEW] counts), the exact command to run just
this scenario, and — if handed off — what the debugger should look at first.

## Product-gap rule

If the scenario fails because the app genuinely lacks the behavior (unimplemented feature, real
regression), the test is **correctly red**. Report the gap with evidence; do not bend the test
toward green.
