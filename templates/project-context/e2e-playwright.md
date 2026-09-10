# Project Context — Playwright BDD E2E

A dedicated end-to-end testing repository using Playwright + playwright-bdd (Cucumber/Gherkin BDD layer) with a custom step registry system.

<!-- run /ko-onboard to fill in repo specifics -->

## ⚠️ CRITICAL: Step Registry

**NEVER use grep, ripgrep, or file search to find step definitions.**

Use the step registry:
```bash
pnpm registry:search --step "add to cart"
pnpm registry:search --page "checkout"
pnpm registry:search --element "submit"
pnpm registry:search --feature "wishlist"
```

Regenerate after changes: `pnpm registry:gen`

ALWAYS search the registry before writing a new step. See the `step-registry` skill.

## Stack
- **Test runner:** Playwright 1.x
- **BDD layer:** playwright-bdd + @cucumber/cucumber (Gherkin)
- **Language:** TypeScript
- **Reporting:** Allure + Cucumber HTML/JSON
- **Service mocking:** WireMock (Docker)
- **Cross-browser:** BrowserStack
- **Assertions:** Chai + Playwright expect
- **Accessibility:** axe-core
- **Secrets:** Ansible Vault encrypted .env files
- **CI:** GitHub Actions (composite actions)
- **Package manager:** pnpm

## Repository layout
```
src/
  features/        # Gherkin .feature files
    e2e/           # End-to-end tests (hit real environments)
      account/
      checkout/
      browse-discovery/
      wishlist/
    ui/            # UI tests (WireMock mocked backend)
    dynamoDB/      # Data layer tests
  steps/           # Step definitions (regex patterns via createBdd())
  pages/           # Page Object Model (extend BasePage, singleton exports)
  utils/           # pwHelper, assert, localeCheck, cookieHelper, randomData, retryHelper
  services/        # External integrations: AWS, CommerceTools, Gmail, Optimizely
  fixtures/        # Test data (products.json, store_locations.json, stock)
  mock/            # WireMock mappings and response files
  .step-registry.json  # Auto-generated step index (NEVER edit manually)
scripts/
  run-tests.sh     # Main test runner
  generate-step-registry.ts  # AST parser → registry
  search-registry.ts         # Registry search CLI
.features-gen/     # Auto-generated Playwright tests (gitignored, NEVER edit)
playwright.config.ts
```

## Key commands
```bash
# Install
pnpm install
npx playwright install

# Run tests (RUN_MODE selects the family: e2e | ui | functional | dynamoDB)
./scripts/run-tests.sh -e <env> -l <locale> -t <tags> -b <browser>
RUN_MODE=ui ./scripts/run-tests.sh -e <env> -l <locale> -t <tags>
# Flags: -e environment, -l locale (AU/NZ), -t tag expression, -b browser, -r runner (local/browserstack)

# Run specific tags
./scripts/run-tests.sh -e staging -l AU -t "@sanity"
./scripts/run-tests.sh -e staging -l AU -t "@checkout and not @skip"

# Generate BDD test files
npx bddgen

# Debugging
npx playwright test --debug
npx playwright test --ui
npx playwright show-trace trace.zip
```
<!-- run /ko-onboard to confirm environment names, RUN_MODE values, and available tags -->

## Critical conventions
- **Step patterns:** Regex ONLY (`/^pattern$/`). NEVER Cucumber expressions.
- **Browser interactions:** ALL through the `pwHelper` singleton — its methods take **Locators** (wrap `elements` strings at the call site). NEVER direct `page.*` calls.
- **Page objects:** Extend `BasePage`, string selectors in `elements` object, singleton exports in `src/pages/index.ts`. A flow's first step calls `page.open(page)` → `pwHelper.setPage`.
- **Cross-step state:** typed `global.*` properties (e.g., `global.orderId`). Never module variables. Clean up in `After`.
- **DOM sight:** see the `dom-sight` skill — MCP snapshot / codegen / live probes. One selector per element; never guess, never fallback chains.
- **Auth:** live UI registration (TOTP MFA) + cookie injection via the cookie helper. NO `storageState` files. Never read `.env` (vault-encrypted, hook-blocked).
- **WireMock:** UI tests use mocked services; E2E tests hit real environments.
- **Assertions:** Web-first auto-waiting only. NEVER `waitForTimeout`.
- **Scenarios:** Max 8 steps. Independent, parallel-safe, own their data.
- **Tagging:** feature-level domain tag on line 1; `@regression`/`@sanity` priority; locale modifiers (`@auOnly`); Jira ticket tags allowed; `@skip`/`@quarantine` excluded by the runner. No `@smoke` in this family.
- **Fixes:** Surgical 1-3 line changes. Don't rewrite working tests.

## Environment & config
- BASE_URL set by env + locale in `scripts/run-tests.sh`
- Credentials via Ansible Vault encrypted `.env` files — decryption happens in tooling; agents never read these files (privacy hook denies)
- CI: GitHub Actions, traces on retry, screenshots on failure
- BrowserStack for cross-browser (use `-r browserstack`)
- MCP: `.cursor/mcp.json` ships the `playwright` server for live DOM exploration (see `dom-sight`)

## Skills & rules
- Rules: `.cursor/rules/e2e-playwright.mdc` (+ any existing repo-specific rules)
- Skills: `playwright-bdd`, `bdd-authoring`, `step-registry`, `dom-sight`
- Commands: `/ko-e2e-test`, `/ko-e2e-heal`

## Delivery

- **Product family repos & local paths:** <!-- run /ko-onboard: sibling repos + checkout paths -->
- **Deploy pipelines:** <!-- run /ko-onboard: Buildkite pipeline names + nonProd/prod step names -->
- **Feature flags:** <!-- run /ko-onboard: flag tool + key naming convention -->
- **Post-deploy sanity:** <!-- run /ko-onboard: sanity/smoke command + dashboards/monitors to watch -->
- **Step registry & helpers:** <!-- run /ko-onboard: registry:* aliases + page-helper (pwHelper/BasePage-equivalent) names -->
