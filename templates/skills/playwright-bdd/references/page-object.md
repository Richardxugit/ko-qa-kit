# Vertical slice — feature → steps → page object → global state → hooks

A complete wishlist flow in this family's singleton style: string selectors in `elements`, `pwHelper` taking Locators, regex-only steps via `createBdd()`, typed `global.*` state, barrel registration.

## Feature — `src/features/e2e/wishlist/add-from-plp.feature`

Feature-level domain tag on line 1; priority + traceability tags on the scenario.

```gherkin
@wishlist
Feature: Add to wishlist from product listing

  Background:
    Given I am signed in as a new customer

  @regression @CON-1234
  Scenario: Guest-registered user adds an item from the listing page
    Given I am on the "sale" product listing page
    When I add the first product to my wishlist
    Then the wishlist badge shows 1 item
```

## Page object — `src/pages/PlpPage.ts`

```ts
import { BasePage } from './BasePage';
import { pwHelper } from '../utils/pwHelper';

class PlpPage extends BasePage {
  url = '/c/sale';

  elements = {
    productCard: '[data-testid="product-card"]',
    wishlistToggle: '[data-testid="wishlist-toggle"]',
    wishlistBadge: '[data-testid="wishlist-badge"]',
  };

  async addFirstProductToWishlist() {
    const firstCard = this.locator(this.elements.productCard).first();
    await pwHelper.click(firstCard.locator(this.elements.wishlistToggle));
  }

  async wishlistBadgeLocator() {
    return this.locator(this.elements.wishlistBadge);
  }
}

export const plpPage = new PlpPage();
```

- Selectors are **strings** on `elements`; methods wrap them into Locators (`this.locator(...)` from `BasePage`) before handing them to `pwHelper`. <!-- /ko-onboard: confirm the exact wrap helper name -->
- One selector per element, `data-testid` first. No assertions in actions.

## Barrel — `src/pages/index.ts`

```ts
export { plpPage } from './PlpPage';
// every page object singleton is exported here — steps import from '../pages'
```

## Global state — `src/global.d.ts`

```ts
declare global {
  // eslint-disable-next-line no-var
  var wishlistCount: number | undefined;
}
export {};
```

## Steps — `src/steps/wishlist.steps.ts`

```ts
import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { plpPage } from '../pages';

const { Given, When, Then } = createBdd();

Given(/^I am on the "(.+)" product listing page$/, async ({ page }, category: string) => {
  await plpPage.open(page, `/c/${category}`); // open() → pwHelper.setPage(page)
});

When(/^I add the first product to my wishlist$/, async () => {
  await plpPage.addFirstProductToWishlist();
  global.wishlistCount = (global.wishlistCount ?? 0) + 1;
});

Then(/^the wishlist badge shows (\d+) items?$/, async ({}, count: string) => {
  await expect(await plpPage.wishlistBadgeLocator()).toHaveText(count);
});
```

- Regex `/^…$/` only — Cucumber expressions are forbidden.
- `{ page }` destructured only where the step opens a page; later steps ride the `pwHelper` singleton.
- One web-first assertion per `Then`.

## Hooks — `src/hooks/cleanup.ts`

```ts
import { createBdd } from 'playwright-bdd';
const { After } = createBdd();

After(async () => {
  global.wishlistCount = undefined; // clean up all global.* state every scenario
});
```

## Auth note

`Given I am signed in as a new customer` resolves to the family's real auth flow — live UI registration (TOTP MFA where required) + cookie injection via the cookie helper. No `storageState`, no `.auth/` files, and secrets stay behind the vault/privacy hook.

## After generating

```bash
pnpm registry:gen                                  # re-index steps/pages/features
./scripts/run-tests.sh -e staging -l AU -t "@wishlist"   # scoped run (flags per AGENTS.md)
```
