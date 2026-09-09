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
- Jira ticket tags (`@CON-1234`) are allowed for traceability alongside the selection tags.
- CI filters by tag expression (`-t "@sanity"`, `--grep "@checkout"`); `@skip` and `@quarantine` are auto-excluded.
