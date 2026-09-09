---
name: dom-sight
description: How to see the real DOM before writing or repairing a selector — Playwright MCP snapshots, codegen recording, or one-off live-DOM probes. Use whenever an e2e test needs a new selector, a selector fails, or a screen's structure is unknown. Never guess selectors.
---

# DOM Sight — see the page before you select

Selectors written from imagination are the #1 source of red first runs and flaky repairs. Before writing or fixing **any** selector, get evidence from the real DOM using the highest tier available.

## Tier 1 — Playwright MCP (preferred when configured)

Check `.cursor/mcp.json` for a `playwright` server entry. If present, you can drive a real browser and read its accessibility tree without leaving the editor:

1. `browser_navigate` to the target URL (base URL per `AGENTS.md` / env config).
2. `browser_snapshot` — returns the accessibility tree: every interactive element with role, name, and a node reference.
3. Map the snapshot node to a **repo-convention selector**: find the element in the app source or rendered DOM and prefer its `data-testid`; else derive a role/label locator from exactly what the snapshot showed (`getByRole('button', { name: 'Add to wishlist' })` → the equivalent string form for the `elements` object).
4. Interact if needed (`browser_click`, `browser_type`) to reach deeper states, then snapshot again.

**Caveat — fresh profile.** The MCP browser session carries **no** suite cookies and no registered account. Register a fresh account by driving the suite's own sign-up flow through MCP (how every test run gets its user), and mirror the suite's cookie patch via `browser_evaluate` — details in `references/playwright-mcp.md`. Never work around it by reading secret files — they're vault-encrypted and hook-blocked.

See `references/playwright-mcp.md` for the tool cheat-sheet, setup, and the auth/cookie-gated screen playbook.

## From vague intent to element

When the input is a flow description ("check the new gift-card banner appears after checkout") rather than a selector, map intent → element against snapshot evidence:

1. Decompose the flow into ordered intents: (screen, action, target phrase, data, expected outcome).
2. Match each target phrase against the accessibility tree, in order: exact role+name match → partial/synonym name match → text content → position inside a labelled landmark (`region`, `nav`, a `data-testid` container).
3. Prefer interactive roles that fit the action — a "submit" intent matches a `button`, not a `link`, unless the snapshot says otherwise.
4. Multi-screen flows: interact through MCP to reach each screen and snapshot it there — never map an element on a screen you haven't snapshotted.
5. State a confidence per mapping. **Zero or multiple plausible candidates → present the alternatives with their snapshot evidence and ask.** Never silently pick one.

## Tier 2 — codegen recording

Works everywhere, no MCP needed:

```bash
npx playwright codegen --output=.tmp/recorded-flow.ts <url>
```

Walk the flow by hand (including login — you type the credentials, the agent never sees them). Then lift **stable** locators from the recording: prefer `data-testid`, then role/label; discard the brittle CSS codegen sometimes emits. `.tmp/recorded-flow.ts` is raw material — extract, then delete; never commit it.

## Tier 3 — one-off live probes & trace snapshots

When you just need to answer "does this selector match, and what's actually there":

- **Probe:** a throwaway spec (or debug session) that navigates and runs
  `await page.locator(sel).count()` / `await page.locator(container).innerHTML()` — prints the truth about one selector, then gets deleted.
- **Trace:** every failed run with `--trace on` contains full DOM snapshots per action — `npx playwright show-trace <trace.zip>` and inspect the DOM at the failing step. This is Tier 3's answer for auth-gated states, since the trace was recorded *with* the test's real session.

## Rules (all tiers)

- **One selector per element.** Pick the best candidate and commit to it — never fallback chains (`a, b, c`), never XPath.
- **Priority:** `data-testid` → role/label → text → scoped CSS.
- **Never guess.** No evidence → no selector. If you cannot reach the screen by any tier, say so and ask, rather than inventing.
- Selectors live as strings in the page object's `elements` — see `playwright-bdd`.
