# Local Emulator Execution — Preflight

Shared by `/ko-mobile-test --local` and `/ko-mobile-heal --local`. The default execution target is
BrowserStack; `--local` means verify against a local Android emulator. Follow this procedure
exactly — never attempt a local run on the hope it'll work.

## 0. Repo support check

Before honoring `--local`, check the repo's README/AGENTS.md for whether it documents local
emulator execution. If it doesn't, tell the user this repo has no documented local-emulator setup
and use BrowserStack instead.

## 1. Preflight probe

| Need | Live probe |
|---|---|
| Local Android toolchain | `adb`, `emulator`, and the repo's local driver server (e.g. `appium`) resolve on `PATH`; an AVD exists for it to boot; the local app binary the repo's docs point to is actually present on disk |

- **All present** → run against the local emulator using the exact command/profile flags the
  repo's docs specify — never invent flags, read them from the README/AGENTS.md.

## 2. Node-tool false negative (version managers)

A Node-based tool (e.g. `appium`) reporting "missing" is often present but invisible to *this*
shell when a Node version manager (fnm/nvm/volta) is in play:

- Its init line usually lives only in `~/.zshrc` (or the user's equivalent interactive-only rc
  file), which a non-interactive tool-runner shell never sources. Check the manager's real
  install dirs directly (e.g. `~/.local/share/fnm/node-versions/*/installation/lib/node_modules/`,
  `~/.nvm/versions/node/*/lib/node_modules/`) for the package before declaring it missing.
- If found there but not on `PATH`, the fix is adding the manager's init line to `~/.zshenv`
  (read by every shell invocation, not just interactive ones) — propose this exact fix, but
  **never edit shell dotfiles without the user's explicit go-ahead first.**
- Also check whether the package is installed under the *active* version but the manager's
  **default** version (what a fresh shell resolves to) is different and doesn't have it — same
  "looks missing" symptom, different cause, different fix (install under the default version, or
  point the default at the version that already has it).

## 3. Genuinely missing

**Stop and ask**: name each piece that isn't installed or configured, point the user at the repo's
local-emulator setup docs, and ask whether to install first or fall back to BrowserStack for this
run. `--local` was an explicit request — don't silently substitute BrowserStack without asking.
