# Playwright MCP — setup & tool cheat-sheet

## Setup

The kit ships an MCP config for e2e repos (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

If the repo's `.cursor/mcp.json` is missing the `playwright` entry (it is a user-owned file), merge the block above in manually. Cursor starts the server on demand; the first call downloads the package.

## Core tools

| Tool | What it does | Typical use |
|---|---|---|
| `browser_navigate` | open a URL | get to the screen under test |
| `browser_snapshot` | accessibility tree of the current page | **the primary sight tool** — roles, names, node refs |
| `browser_click` / `browser_type` / `browser_select_option` | interact via node refs from the last snapshot | reach deeper states (open a modal, submit a form) |
| `browser_take_screenshot` | pixels, not structure | only when layout itself is the question |
| `browser_evaluate` | run JavaScript on the page | cookie patches (`document.cookie`), one-off DOM probes |
| `browser_console_messages` | page console output | spot JS errors that explain a broken screen |
| `browser_network_requests` | requests since load | confirm an API call fired / failed |

## Snapshot → selector workflow

1. `browser_snapshot` and locate the target element in the tree — you'll see e.g.
   `button "Add to wishlist" [ref=e42]`.
2. Prefer the app's `data-testid` for that element (check the app source or the DOM); if none exists, derive the locator from exactly what the snapshot showed — role + accessible name.
3. Record the selector as a **string** in the page object's `elements` (see `playwright-bdd`); one selector, no fallbacks.
4. If two nodes share a name, scope by a parent landmark (`region`, `nav`, a `data-testid` container) — don't reach for nth-child CSS.

## Auth-gated and cookie-gated screens

The MCP session is a fresh browser profile — **no test cookies, no registered account**. Two **independent** access conditions may gate a screen: a signed-in user, and patched cookies (feature flags, locale, consent — these gate public flows too, especially brand-new features behind a flag). Handle whichever apply:

1. **Fresh account via the suite's own registration flow.** Drive the repo's existing sign-up flow through MCP (`browser_navigate` → snapshot → `browser_type`/`browser_click`), registering a new unique account — exactly how every test run gets its user. Never a shared account, never credentials read from secret files.
2. **Cookie patch.** Mirror the suite's cookie-patch mechanism: find which cookies/values it patches (`AGENTS.md` / the repo's cookie helper), `browser_navigate` to the app domain first, set them with `browser_evaluate` (`document.cookie = '…'`), then re-navigate. JS cannot set HttpOnly cookies — if the repo's patch depends on one, use option 3 for that screen.
3. **Codegen or trace snapshots** (`dom-sight` Tiers 2–3) when MCP is absent or won't install, the HttpOnly caveat bites, or the user prefers recording — trace snapshots were captured with the test's real session.

## Hygiene

- Snapshot, don't screenshot, unless pixels are the question — the tree is smaller and names elements.
- Close out with the state you found things in (the session is ephemeral, but long agent sessions can leak state between explorations).
- MCP exploration never replaces the verify run: the test must still pass under the repo runner.
