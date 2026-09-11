---
name: ko-mobile-heal
description: Diagnose and repair a failing or flaky mobile Appium test from evidence — classify test-defect vs app-regression via BrowserStack MCP (or Surefire/Cucumber reports when unavailable), present a Heal Plan for approval, then delegate the repair to test-debugger and re-verify to stability
args: "[--local] [scenario | feature path | tag | pasted error]"
skills: [mobile-browserstack-triage]
agents: [test-debugger]
rules: [mobile-appium]
---

# Heal a mobile test

> Take a failing **or flaky** Appium/Cucumber-JVM scenario, find the real cause from evidence, fix it, and re-verify — without ever masking a genuine app regression.

Follow `.cursor/rules/mobile-appium.mdc` and the `mobile-browserstack-triage` skill. This
command **orchestrates**; diagnosis and repair are delegated to the **`test-debugger`** agent in
**two phases** — a read-only diagnosis first, then execution only after the user approves the
Heal Plan. **Nothing is edited before approval.**

## 1. Intake

- **Argument** — `/ko-mobile-heal <scenario|feature path|tag>`: resolve to a concrete scenario.
  If multiple match, list them and ask.
- **Pasted error** — extract scenario name, failing step, error/stack trace, and environment
  (AU/NZ, device/platform/profile) from what the user pasted.
- **Handoff** — no argument, and `/ko-mobile-test` reported a handoff: use that scenario, feature
  path, and evidence directly.

If none apply, ask which scenario to heal — never guess from the most recent unrelated run.

## 2. Tool preflight

| Need | Live probe |
|---|---|
| BrowserStack MCP | Check `.cursor/mcp.json` for the `browserstack` server; probe reachability. |

- **MCP reachable** → live session/device logs and evidence are available for this run.
- **MCP unreachable or not configured** → degrade silently to Surefire/Cucumber XML reports
  (`target/surefire-reports/`, `target/cucumber-reports/`) and captured screenshots. Don't block
  on MCP absence — this is a light, user-triggered command.

## 3. Reproduce with evidence (do not fix yet)

- Gather evidence per the `mobile-browserstack-triage` skill's priority order: BrowserStack MCP
  session state when reachable, otherwise the Surefire/Cucumber report + any captured screenshot.
- **Flaky (intermittent)?** Note the failure rate if known (e.g. from recent CI runs) — record it
  as the before-fix baseline so re-verification in step 7 can prove the fix.

## 4. Classify before healing

Use the `mobile-browserstack-triage` skill's taxonomy: environment/BrowserStack-infra, locator
drift, workflow/spec mismatch, assertion/data mismatch, or app regression.

- **Test defect** (any of the first four) → healable, go to step 5.
- **App regression** — the app genuinely doesn't do what the scenario expects → **STOP.** Do not
  edit the test to go green. Report the regression with evidence and hand back to the user.

If unsure which it is, say so and ask — don't assume.

## 5. DIAGNOSE — delegate read-only

Dispatch **`test-debugger`** in **`diagnose-only`** mode with the scenario, feature/step/page
file paths, the gathered evidence, the triage classification, and environment context. It
investigates and reports — it edits nothing. It returns Findings (severity-ordered) and Proposed
Changes. If it classifies the failure as an app regression, STOP as in step 4.

## 6. HEAL PLAN — stop and wait (always)

Present the diagnosis before any edit, every run, no exceptions:

- **Findings** — failure type, location, impact, and the evidence that proves it.
- **Proposed changes** — per-file planned edits, why they address the cause not the symptom, and
  which other scenarios share the touched steps/pages/services (blast radius).
- **Validation plan** — the scenario(s) to re-run and the success criteria.

Then ask: **fix / stop.** No file is edited before the user answers.

## 7. EXECUTE — delegate the approved plan

Re-dispatch **`test-debugger`** in **`execute`** mode with the approved plan. It stays inside the
approved scope — if mid-fix evidence contradicts the plan, it stops and reports the new evidence
instead of improvising, and this command re-presents a revised Heal Plan rather than proceeding.

Wait for its report. If it returns **"NOT FIXED — needs product decision"** or
**"NOT FIXED — attempts exhausted"**, surface that verbatim and stop.

## 8. Re-verify

Match how the scenario originally ran:

- **BrowserStack (default)** — re-run against the repo's BrowserStack profile.
- **Local (`--local`)** — user-supplied APK in the local-app folder (kit-created with a
  `.gitignore` entry if missing) + local emulator, per the
  **local-execution reference** (`mobile-browserstack-triage` → `references/local-execution.md`).
  Local debug evidence: `adb logcat`, local screenshots, Appium server logs (see the reference's
  evidence-gathering section).

Whichever target is used:
- **Deterministic fix** (locator repair, wrong assertion target) — one re-run is sufficient proof.
- **Flakiness fix** — re-run enough times to beat the recorded before-fix rate; a single green run
  is not proof for a flake.

## 9. Report + escalation

- Root cause (one line, from the classification taxonomy) + the evidence that proved it.
- The fix applied, files changed, and the exact command to run just this scenario.
- **Plan-vs-actual:** did the applied fix match the approved Heal Plan; if it deviated, what
  changed and why.
- **Escalation:** if the fix failed after the debugger's attempt budget, or flakiness persists,
  tag the scenario `@quarantine`, file the evidence in the report, and say explicitly that it's
  quarantined pending a human decision — quarantine is tracked debt, not a fix.
- Anything left open (e.g. a flagged app regression).
