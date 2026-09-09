---
name: ko-e2e-heal
description: Diagnose and repair a failing or flaky e2e test from evidence — triage test-defect vs product-regression, present a Heal Plan (bug report + fix plan + refactor proposal) for approval, then delegate the repair to e2e-debugger and re-verify to stability
args: "[test | scenario | tag | feature path | pasted error]"
skills: [playwright-bdd, step-registry, dom-sight]
agents: [e2e-debugger]
rules: [e2e-playwright]
---

# Heal an e2e test

> Take a failing **or flaky** Playwright BDD test, find the real cause from evidence, fix or refactor it, and re-run until it is consistently green — without ever masking a genuine product regression.

Read the `playwright-bdd` and `step-registry` skills first, and follow `.cursor/rules/e2e-playwright.mdc`. Check `AGENTS.md` for the run commands and registry aliases. This command **orchestrates**; diagnosis and repair are delegated to the **`e2e-debugger`** agent in **two phases** — a read-only diagnosis first, then execution only after the user approves the Heal Plan. **Nothing is edited before approval.**

## 1. Intake — three modes

- **Argument** — `/ko-e2e-heal <scenario|tag|feature path>`: resolve to a concrete scenario. If multiple match, list them and ask.
- **Pasted error** — the user pasted a CI failure or terminal output: extract scenario name, failing step, error message, and trace path from it.
- **Handoff** — no argument and `.tmp/handoff.json` exists (written by `/ko-e2e-test`): read it, confirm the target with one line ("Healing `<scenario>` handed off from /ko-e2e-test — proceeding"), and delete the handoff file once healing concludes.

If none of the three apply, use the most recent failing run (last report/trace under `playwright-report/` or `test-results/`).

## 2. Reproduce with evidence (do not fix yet)

- Run the target in isolation with a trace: `npx playwright test --grep "<scenario>" --trace on` (or the repo runner with the scenario's tag; or open the CI artifact: `npx playwright show-trace <trace.zip>`).
- **Flaky (intermittent)?** Establish the failure rate first: `--repeat-each 10 --workers 1`, then again with parallel workers. Fails only under parallelism → suspect shared state/ordering. Record the before-fix rate so step 5 can prove the fix.
- Inspect the trace: DOM snapshots, network, console, the failing action's timeline. For live-DOM questions, use the `dom-sight` skill (MCP snapshot or one-off locator probes) — never guess selectors.

## 3. Triage before healing (important)

Decide what kind of failure this is **before** changing anything:

- **Test defect** — selector drift, race, hardcoded wait, shared state, non-deterministic data, outdated expectation, environment/auth/data setup issue → healable, go to step 4.
- **Genuine product regression** — the app actually broke; the test is correctly red → **STOP.** Do not edit the test to go green. Report the regression with evidence (trace step, expected vs actual) and hand back to the user. Healing a real bug into green is the one thing this command must never do.

If unsure which it is, say so and ask — don't assume.

## 4. DIAGNOSE — delegate read-only

Dispatch the **`e2e-debugger`** agent in **diagnose-only** mode — it investigates and reports; it edits nothing. Provide:

- The scenario + feature/step/page file paths, and the handoff payload if one existed.
- The captured trace path and the repeat-each failure rate.
- The triage classification from step 3.
- The mode: `diagnose-only`.

It returns a structured diagnosis: bug report (failure class + evidence), fix plan (files, changes, blast radius, verification strategy), and — when repo evidence warrants — a refactor proposal. If it comes back classified as a **product regression**, STOP as in step 3: report the evidence, never fix.

## 5. HEAL PLAN — stop and wait (always)

Present the diagnosis to the user before any edit — every heal run, no exceptions, even for a one-line selector repair:

- **Bug report** — failure class, what's breaking (scenario / step / element), root cause, and the evidence that proves it (trace step, locator count, repeat-each rate).
- **Fix plan** — per-file planned changes; why this treats the cause, not the symptom; blast radius (which other scenarios share the touched steps/pages — from the registry); the verification strategy matched to the failure type (one traced run vs `--repeat-each` against the before-rate).
- **Refactor proposal** (only when the evidence warrants one) — cite the repo signals: debug-history repeats (this scenario+class was fixed before ⇒ the fix direction is wrong), registry near-duplicates, structural cause. Test-suite refactors (dedupe steps, extract a page object, lift preconditions into `Background`) are executable on approval. App-code changes (e.g. adding a `data-testid` to a component) are **recommendation-only — never executed by this command**.

Then ask: **fix only / fix + refactor / stop.** No file is edited before the user answers.

## 6. EXECUTE — delegate the approved plan

Re-dispatch **`e2e-debugger`** in **execute** mode with the approved Heal Plan (fix only, or fix + refactor) and the boundaries:

- Search the registry before touching steps (never grep), keep `.feature` files free of selectors/waits, route interactions through `pwHelper` (Locators, not strings), **one selector per element — never fallback chains**, never weaken an assertion, never add `waitForTimeout`, never touch vault-encrypted secrets or `.env` files (the privacy hook denies them anyway).
- **Stay inside the approved plan.** If mid-fix evidence contradicts it, the agent stops and returns the new evidence — go back to step 5 and re-present a revised Heal Plan instead of improvising beyond the approved scope.

Wait for the agent's report. If it returns **"NOT FIXED — needs product decision"**, surface that verbatim and stop.

## 7. Re-verify (stability gate matched to the failure type)

- **Deterministic failure, deterministic fix** (selector repair, wrong assertion target): one headed/traced re-run of the scenario is sufficient proof.
- **Flakiness fix** (race, shared state, non-deterministic data): re-run scoped `--repeat-each 10` with parallel workers — it must beat the recorded before-rate cleanly. A single green run is not proof for a flake.
- Regenerate artifacts if steps/pages changed: `npx bddgen`, `pnpm registry:gen`.

## 8. Report + escalation

- Root cause (one line, from the debugger's taxonomy) + the evidence that proved it.
- The fix applied, files changed, before/after pass rate, and the exact command to run just this scenario.
- **Plan-vs-actual:** did the applied fix match the approved Heal Plan — and if it deviated, what changed and why.
- **Escalation:** if the fix failed after the debugger's attempt budget, or the flake persists, tag the scenario `@quarantine` (so CI excludes it), file the evidence in the report, and say explicitly that the test is quarantined pending a human decision — a quarantined test is a tracked debt, not a fix.
- Anything left open (e.g. a flagged product regression).
