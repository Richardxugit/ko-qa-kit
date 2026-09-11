# Project Context — Mobile Appium + Cucumber-JVM

A BDD mobile automation suite (Java + Cucumber-JVM + Spring + Appium) validating native Android
and iOS apps, executed on BrowserStack App Automate.

<!-- TODO(repo): to fill in repo specifics -->

## Stack
- **Language:** Java 17
- **Build:** Maven
- **BDD layer:** Cucumber-JVM (Gherkin)
- **Framework:** Spring Boot (DI, `@Scope(SCOPE_CUCUMBER_GLUE)` for scenario-scoped state)
- **Mobile automation:** Appium `java-client` + Selenium
- **Device execution:** BrowserStack App Automate (real devices, both Android and iOS)
- **Locators:** Accessibility ID → Android resource-id → XPath fallback

## Repository layout
```
src/test/java/<base-package>/
  step/           # Cucumber step definitions (*Steps.java) — glue only
  pageobject/      # Page objects (*Page.java) — extend AbstractPage, @PageObject
  serviceobject/    # Service objects (*Service.java) — @Service + @Scope(SCOPE_CUCUMBER_GLUE)
  constant/        # Locator constants (*Constants.java) — public static final String only
  data/            # Request/response/query entities — Lombok @Data/@Setter
src/test/resources/
  features/        # Gherkin .feature files
  data/            # Shared test fixtures
  config/devices/   # Device configuration
  application.yaml  # Spring profiles (env × platform × locale × execution-type)
```
<!-- TODO(repo): confirm the actual base package (e.g. com.<org>.testing) -->

## Key commands
```bash
# Run a tagged set against BrowserStack
mvn clean test "-Dcucumber.filter.tags=@regression" -Dspring.profiles.active=<env>,<platform>,<locale> \
  -Ddevice=<android|ios> -Dlocale=<AU|NZ> -Denvironment=<env> \
  -Dcucumber.execution.parallel.config.fixed.parallelism=1 -DretryCount=0
```
<!-- TODO(repo): confirm exact profile names, device/locale values, and default tags -->

**Every run — local or CI — targets BrowserStack.** `local`/`ci` only changes where the Maven
process runs; the device is always a BrowserStack cloud device (Android and iOS both), unless
this repo has since added a local-emulator/simulator execution path — confirm before assuming.

## Critical conventions
- **Layer boundaries:** step = glue only, service = cross-page/business orchestration, page = UI
  interaction + state, constants = locator values only, entity = payload/query models only.
  `feature → step → service/page → constants` (+ `data`) stays synchronized in every change.
- **Locator priority:** Accessibility ID → `_ANDROID_ID` (when stable) → XPath
  (`_ANDROID_XPATH` / `_IOS_XPATH`, last resort). Android/iOS pairs share a base constant name.
- **No fixed waits:** never `Thread.sleep` or hard-wait wrappers — condition-based waits via
  `AbstractPage` helpers only.
- **Portability:** AU/NZ and local/dev/nonprod/prod agnostic. Data from `src/test/resources/data/**`,
  never inline literals that assume one market/environment.
- **Tagging:** `@quarantine` for confirmed flakiness with rationale, `@bug` for confirmed product
  defects with a traceable reference — remove once resolved.

## Environment & config
- Device/environment/locale selection is Spring-profile-driven (`application.yaml`).
- BrowserStack credentials via env vars / CI secrets — never commit real credentials.
- MCP: `.cursor/mcp.json` ships the `browserstack` server for live session/device diagnostics
  during healing (see `mobile-browserstack-triage`).

## Skills & rules
- Rules: `.cursor/rules/mobile-appium.mdc` (+ any existing repo-specific rules)
- Skills: `mobile-browserstack-triage`
- Commands: `/ko-mobile-test`, `/ko-mobile-heal`
- Agents: `test-generator`, `test-debugger`

## Delivery

- **Product family repos & local paths:** <!-- TODO(repo): sibling app repo(s) that produce the APK/IPA under test, and their local checkout paths -->
- **App build pipeline:** <!-- TODO(repo): where the APK/IPA is built and uploaded to BrowserStack (e.g. Bitrise), and how to get the latest bs:// app id -->
- **CI pipelines:** <!-- TODO(repo): GitHub Actions workflow names + when each runs -->
- **BrowserStack project/build naming:** <!-- TODO(repo): project name, build naming convention, dashboard link -->
- **Post-run triage:** <!-- TODO(repo): where reports/screenshots land, and who to escalate a confirmed app regression to -->
