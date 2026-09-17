---
name: ko-e2e-verify
description: Verify a change against the journey pool — resolve a PR link, Jira ticket, or text description into impacted test domains (impact-map + package consumer graph), check coverage, run the matching journeys, and report PASS / FAIL (classified) / GAP
args: "<pr-url | ticket | text description> [--env <name>] [--base-url <url>]"
skills: [playwright-bdd, step-registry]
rules: [e2e-playwright]
---

# Verify a change against the journey pool

> Take a change — a **PR link**, a **Jira ticket**, or a **plain-text description** — resolve which test domains it impacts, run the matching journeys from the pool, and answer one question: *is this change safe to ship?* This command **selects and runs**; it never edits tests (red tests go to `/ko-e2e-heal`) and never writes new coverage (gaps go to `/ko-e2e-test`).

Read the `playwright-bdd` and `step-registry` skills first, and follow `.cursor/rules/e2e-playwright.mdc`. Check `AGENTS.md` for the repo's runner alias and environment names — the repo's own aliases win over the defaults shown below.

## Inputs and flags

- **Input** (required, one of):
  - PR URL — `https://github.com/<org>/<repo>/pull/<n>` (highest confidence: file-level evidence)
  - Jira ticket — e.g. `DAV-165` (medium: resolved via linked PRs, falls back to text mode)
  - Text description — e.g. `"wishlist share flow"` (lowest: inferred, always confirmed)
- `--env <name>` — target environment from the repo's env config, default per `AGENTS.md`
- `--base-url <url>` — point at a PR preview / ephemeral deployment instead of a named env

## 1. RESOLVE — input → changedAreas

Resolve the input to a list of changed areas: `{ apps: [...], packages: [...] }`.

- **PR URL** — use `gh pr view <url> --json files,headRefOid,title,body`. Classify each changed file by path prefix, first match wins:
  - `apps/<name>/**` → `apps[]`
  - `packages/<name>/**` → `packages[]` (a version-only bump in `packages/X/package.json` still counts — a publish SHOULD trigger consumer regression)
  - anything else (`docs/`, `.github/`, …) → drop
- **Ticket** — search for linked PRs first: `gh search prs "<ticket>" --repo <ui-repo>`. If PRs are found, list them and ask which to verify (then continue as PR mode). If none, fall back to text mode using the ticket summary.
- **Text** — infer impacted apps/packages from the description against the known app list and package list. This is inference, not evidence.

If the resolved set is empty (docs-only PR, unmatchable text): report `no testable changes`, exit 🟢 without running anything.

**Confirmation gate:** text mode ALWAYS shows the inferred mapping and waits for approval. Ticket mode shows the PRs it found. PR mode shows the parsed areas and proceeds without stopping.

## 2. MAP — changedAreas → domain tags

**Resolver delegation (when a changed-file list exists, i.e. PR mode):** if the repo has
`scripts/resolve-impact.mjs`, run it instead of resolving inline:

```
node scripts/resolve-impact.mjs --files <f1,f2,...> [--consumers <path>]
```

It prints one JSON object to stdout —
`{ "tags": [...], "gaps": [...], "unknownApps": [...], "dropped": [...], "collapsed": bool, "scenarios": [{ "journey", "name", "shape" }] }` —
with exit codes `0` = resolved with coverage, `2` = gaps/unknowns present, `1` = error.
The script implements the same rules as the inline steps below (which remain the spec of
record), deterministically and unit-tested. When it ran, skip the inline MAP lookups and the
`journeys/*.yml` search in step 3 — its `tags` are the tag expression, its `scenarios` are
the run list, its `gaps` are the gapList — and go straight to the run-plan display. Treat
`unknownApps` as coverage findings (same as inline rule). Ticket/text modes without a file
list still resolve inline.

- `apps[]` → look up `impact-map.json` (app name → domain tag, e.g. `"checkout-ui" → "@checkout"`). An app missing from the map is itself a coverage finding — record it and tell the user to add the entry.
- `packages[]` → resolve consumers, then map each consumer app through `impact-map.json`. Consumer sources, in order:
  1. Committed `packages-consumers.json` in this repo, if present
  2. Otherwise fetch fresh: for each app, `gh api repos/<ui-repo>/contents/apps/<app>/package.json?ref=<headSHA>` and parse `@kosmos/*` (scope per `impact-map.json`) dependencies. For text/ticket mode without a head SHA, use the default branch.
- **Wide-blast collapse:** if a package has **more than 5** consumer apps (e.g. `Theme`, `Common`), don't enumerate — collapse the whole run to the `@regression` tag.
- Union all tags, dedupe, sort. Result: `TAGS` expression like `@account or @auth or @checkout`.

## 3. SELECT — tags → scenarios, with GAP detection

- If the resolver script ran in step 2, its `scenarios` and `gaps` replace this step's
  search — skip to the run-plan display below.

- Search `journeys/*.yml` for scenarios carrying any of `TAGS` — select ALL of them (no priority ceiling). Collect the run list.
- **GAP check:** any resolved tag with ZERO matching scenarios goes into `gapList`. A gap is not a failure and never silently passes — it is reported loudly in step 6.
- Show the run plan: resolved mapping, tag expression, scenario count per tag, env/base-url, and the gapList if non-empty. **Text/ticket mode: stop here for confirmation. PR mode: proceed.**

## 4. RUN

- Invoke the repo runner alias from `AGENTS.md` with the tag expression and env (e.g. `./scripts/run-tests.sh -e <env> -t "<TAGS>"` — repo alias wins). `--base-url` overrides the env's baseUrl when given.
- Run once. Do not retry the suite hoping for green — a red result is data, not bad luck.

## 5. REPORT — three states

- 🟢 **PASS** — all selected scenarios green, gapList empty. One line per domain.
- 🔴 **FAIL** — any failure. Classify each per the heal taxonomy: **product regression** / **test defect** / **environment**. State plainly: this command does not fix — hand the failure evidence to `/ko-e2e-heal`.
- 🟡 **GAP** — selected scenarios green but gapList non-empty. For each gap: which tag, which apps/packages resolved to it, and the exact next step — offer to write `.tmp/handoff.json` for `/ko-e2e-test` with a suggested flow description, so coverage can be added in one step.

End every report with: input, resolved areas, tag expression, scenario counts, env, duration, and the one-line verdict per domain.

## Boundaries

- Never edit a test to make a run green — that is `/ko-e2e-heal`'s job, and only after triage.
- Never weaken the GAP signal — an untested change reported as green is the worst output this command can produce.
- Never guess selectors or DOM state during verification; selection uses the journey descriptors only.
- Never touch vault-encrypted secrets or `.env` files.
