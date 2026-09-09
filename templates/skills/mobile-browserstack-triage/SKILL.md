---
name: mobile-browserstack-triage
description: How to classify and gather evidence for a failing/flaky Appium mobile test — BrowserStack MCP session evidence when available, Surefire/Cucumber reports otherwise, then route to the right fix. Use whenever a mobile Appium/Cucumber-JVM scenario fails or flakes.
---

# Mobile BrowserStack Triage

Classify before you fix. A failing mobile scenario is one of five things — treat each differently, and never touch code before you know which one you're looking at.

## Classification taxonomy

| Type | Signal |
|---|---|
| **Environment / BrowserStack infra** | Session failed to start, device unavailable, upload/build-id error, auth failure — nothing about the app or test logic. |
| **Locator drift** | `NoSuchElementException`, `TimeoutException` waiting for an element, "element not interactable" — the app's UI changed under a stale selector. |
| **Workflow / spec mismatch** | The scenario's steps don't match what the app actually does anymore — not a selector problem, a behavior-assumption problem. |
| **Assertion / data mismatch** | Interaction succeeds, but an assertion reads the wrong value or expects stale test data. |
| **App regression** | Every test-side cause above is ruled out and the app genuinely doesn't do what the scenario expects. |

Work top to bottom — don't jump to "locator drift" just because an element wasn't found; confirm the session actually started and reached the right screen first.

## Evidence sources, in priority order

1. **BrowserStack MCP** (when `.cursor/mcp.json` has the `browserstack` server configured and reachable) — live session state, device logs, network logs, and the session's screenshot/video. This is the richest source: it shows what the device actually did, not just what the test asserted.
2. **Surefire/Cucumber reports** — `target/surefire-reports/`, `target/cucumber-reports/` (or wherever this repo configures them) for the stack trace, the exact failing step text, and timing.
3. **Screenshots/page source captured on failure**, if the test framework's failure hooks save them.

If the BrowserStack MCP is unreachable or not configured, degrade to (2) and (3) — don't block triage on MCP availability.

## Routing

- **Environment/infra** → check BrowserStack account/session limits and credentials before touching any code. This is very rarely a test-code fix.
- **Locator drift** → see "Locator fixes" below.
- **Workflow/spec mismatch** → compare the scenario against the actual app behavior before changing selectors or assertions; the fix may be in the feature/step wording, not the page object.
- **Assertion/data mismatch** → inspect expected values, runtime state, and test data assumptions before changing interaction code.
- **App regression** → document the evidence and stop. Do not bend the test toward green.

## Locator fixes

- Never invent a selector that isn't grounded in observed evidence — BrowserStack page source/XML, an accessibility snapshot, or a screenshot.
- Fix priority order: Accessibility ID → `_ANDROID_ID` (only when a stable resource-id is observed) → XPath (`_ANDROID_XPATH` / `_IOS_XPATH`) as a last resort.
- This stack has no selector-override file to regenerate — `*Constants.java` locator fields *are* the fix. Update them directly, keeping Android/iOS pairs on the same base token name.
- One targeted constant update per observed drift. Don't touch locators you have no evidence are broken, and don't remove a working fallback strategy on a hunch.

## Verification

- Re-run the smallest affected scope first — the single failing scenario, not the full suite.
- Only broaden to adjacent/regression scenarios once the narrow rerun is stable.
- Recommend `@quarantine` or `@bug` tags only when instability or a confirmed product defect justifies it, with a traceable rationale — never as a way to silence a red test.
