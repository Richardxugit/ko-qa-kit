---
name: bdd-authoring
description: Write clear, declarative Gherkin .feature files. Use when authoring or reviewing scenarios, Background, Scenario Outline/Examples, or reusable steps — to keep features in business language and free of UI mechanics.
---

# BDD / Gherkin Authoring

Feature files describe **behavior in business language**, not how the UI is operated. UI mechanics belong in page objects; features describe intent and outcomes.

## Declarative, not imperative
Write what the user is trying to achieve, not the click-by-click choreography.

**Bad (imperative — leaks UI detail, brittle, unreadable):**
```gherkin
Scenario: Login
  Given I navigate to "/login"
  When I type "user@example.com" into the "#email" field
  And I type "p@ssw0rd" into the "#password" field
  And I click the ".btn-primary" button
  And I wait 3 seconds
  Then the URL should be "/dashboard"
```

**Good (declarative — business language, stable):**
```gherkin
Scenario: Existing user signs in successfully
  Given the user is on the sign-in page
  When they sign in with valid credentials
  Then they land on their dashboard
```
The selectors, waits, and field names move into the page object and step definition. If the markup changes, the feature does not.

## Given / When / Then discipline
- **Given** — preconditions / context already true. No actions under test. Set up via API/fixtures when possible.
- **When** — the single action or event under test. Prefer one `When` per scenario.
- **Then** — the observable outcome. One assertion-of-intent per `Then`.
- Use `And`/`But` for continuation; don't mix tenses or smuggle a second action into a `Then`.

## Background for shared preconditions
Lift `Given` steps common to every scenario in a feature into a `Background`.

```gherkin
Feature: Shopping cart

  Background:
    Given the user is signed in
    And the catalog has a product named "Wireless Mouse"

  Scenario: Add an item to the cart
    When they add "Wireless Mouse" to the cart
    Then the cart shows 1 item
```
Keep `Background` short; it runs before every scenario. Don't put actions or assertions in it.

## Scenario Outline + Examples for data variants
Use one parameterized scenario instead of copy-pasting near-identical ones.

```gherkin
Scenario Outline: Sign-in validation messages
  Given the user is on the sign-in page
  When they submit "<email>" and "<password>"
  Then they see the message "<message>"

  Examples:
    | email             | password   | message                     |
    | not-an-email      | p@ssw0rd   | Enter a valid email         |
    |                   | p@ssw0rd   | Email is required           |
    | user@example.com  |            | Password is required        |
```

## Reusable, parameterized steps
- Parameterize over hardcoding: `When they add "Wireless Mouse" to the cart`, not a step per product.
- Reuse phrasing across features so one step definition serves many scenarios.
- Keep step text consistent (same verb/voice) so the catalog of steps stays small and discoverable.

## Keep scenarios independent
- Each scenario sets up its own preconditions and must pass in isolation and in parallel.
- Never rely on data or state left behind by a previous scenario.
- Use unique data per run where collisions are possible.

## Avoid UI-detail leakage (checklist)
- No selectors, CSS classes, element IDs, or URLs in feature files.
- No `wait N seconds` — timing lives in web-first assertions in steps.
- No "click", "type into field #x" — say what the user accomplishes.
- A non-technical stakeholder should be able to read and validate the scenario.

## Tagging
- Feature-level domain tag on line 1 of the file (`@checkout`, `@wishlist`).
- Scenario tags for selective runs: `@sanity` (critical fast set), `@regression` (full suite), locale modifiers (`@auOnly`).
- Jira ticket tags (`@CON-1234`) are allowed for traceability alongside the selection tags — a tag is the ONLY place a ticket number appears; never in the file name or scenario title.
- CI filters by tag expression (`-t "@sanity"`, `--grep "@checkout"`); `@skip` and `@quarantine` are auto-excluded.

### Framework tags (Optimizely flag/time verification)

Three machine-parsed tags control the flag-verify fixture. They are scenario-level, combine freely with the selection tags above, and are consumed by the runner — a human reader should still understand the scenario without them.

- `@flags:<flag_key>=<variation>[,k2=v2]` — force Optimizely variations for this scenario. Comma-separated `key=value`; empty values and duplicate keys are rejected by the parser.
  ```gherkin
  @flags:pdp_bazaarvoice_ratings_reviews_au=enabled
  Scenario: Reviews render when the flag is on
  ```
- `@vars:<flag_key>.<variable_key>=<value>[,f.k2=v2]` — override variable content on the pinned variation (banner copy, thresholds, dates). Values are JSON-coerced (`50` → number, `true` → boolean, `{"a":1}` → object, otherwise string); commas inside quotes/braces don't split. Requires the same flag in `@flags:` on the scenario; explicit `@vars` values win over `@timeshift`-derived ones. Unknown variable keys fail with the valid list.
  ```gherkin
  @flags:black_friday_campaign=preview @vars:black_friday_campaign.hero_copy="Up to 50% off"
  Scenario: Preview banner shows the sale copy
  ```
- `@time:<ISO-8601 with offset>` — freeze the client-side clock at one instant. Use for time-sensitive UI (countdowns, banners) on CSR pages.
  ```gherkin
  @time:2026-11-25T10:00:00+11:00
  Scenario: Countdown shows during the preview window
  ```
- `@timeshift:<phase>` — shift a registered campaign phase so the current real time lands at the phase start; use for SSR pages whose content is rendered by the server clock. Requires the suite to be registered in the repo's expectations registry, a `phases` map for that suite, and the suite's `@flags:<flag>=<variation>` tag on the same scenario. Mutually exclusive with `@time` on one scenario. The registry-free form `@timeshift:self` anchors on the selected variation's own earliest date-like variable (exactly one `@flags:` entry required) — use it for activation/behavior checks; use named phases when the window must be verified against business truth.
  ```gherkin
  @flags:black_friday_campaign=preview @timeshift:preview
  Scenario: Wishlist banner appears in the preview phase

  @flags:promo_window=active @timeshift:self
  Scenario: Promo behaves as inside its window
  ```

**Anti-circular rule:** expected flag values and campaign windows are pinned in the repo's expectations registry. Never read live values from the datafile or the rendered page and assert against those — that verifies nothing. If a scenario's expectation isn't pinned yet, pin it first, then write the scenario.

## Generated-code conventions (non-negotiable)

Loaded by `/ko-e2e-test` at authoring time — apply exactly; details and reuse rules live in the step-registry skill.

- **Page objects are singletons.** `class FooPage extends BasePage`, selectors as **strings** in the `elements` object, exported as a singleton, registered in the `src/pages/index.ts` barrel. A flow's first step opens the page (`await fooPage.open(page)` — hands `page` to the `pwHelper` singleton).
- **`pwHelper` methods take Locators, not selector strings.** Wrap at the call site: `await pwHelper.click(this.locator(this.elements.submitButton))`. Never call `page.*` directly. <!-- TODO(repo): confirm the exact wrap helper name from BasePage/pwHelper -->
- **One selector per element**, `data-testid` first, then role/label, then text, then scoped CSS. Never fallback chains, never XPath.
- **Steps are regex-only** via `createBdd()`: `When(/^I add "(.+)" to my cart$/, ...)`. Cucumber expressions are forbidden. Steps orchestrate page objects; no raw selectors in steps.
- **Cross-step state** goes on typed `global.*` properties (declared in the global type file), cleaned up in `After` hooks. Never module-level variables.
- **Tags:** priority (`@regression` or `@sanity`), locale modifiers where relevant (`@auOnly`), `@quarantine` only via heal escalation. Jira ticket tags (`@CON-1234`) are **allowed** for traceability — the only place a ticket number appears, never the file name or scenario title. Line 1 of every `.feature` is the feature-level domain tag (`@checkout`, `@wishlist`, …). There is no `@smoke` tag in this family.
- **Web-first assertions** in `Then` steps only — one assertion-of-intent per step. Never `waitForTimeout`.
