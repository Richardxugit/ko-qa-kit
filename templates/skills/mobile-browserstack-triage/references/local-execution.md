# Local Android Execution — APK + Emulator

Shared by `/ko-mobile-test --local` and `/ko-mobile-heal --local`. The default execution target is
BrowserStack; `--local` runs against a local Android emulator with a user-supplied APK. Follow
this procedure exactly — never attempt a local run on the hope it'll work.

## The two execution paths

| | BrowserStack (default) | Local (`--local`) |
|---|---|---|
| App binary | repo's BrowserStack upload pipeline (`bs://` id) | APK dropped at the repo's local-app path (see AGENTS.md) |
| Evidence for new locators | BrowserStack MCP session / App Live capture | emulator + Appium Inspector, or `adb shell uiautomator dump` |
| Debug logs | BrowserStack MCP (device/network/session logs, video) | `adb logcat`, local screenshots, Appium server logs |
| Run command | repo's BrowserStack profile flags | same Maven command, repo's local profile flags |

## 0. Repo support check — configure if missing

`--local` is an explicit request to run locally — never silently fall back to BrowserStack, and
never refuse just because the config block doesn't exist yet. Get the repo configured first,
then run.

- **Already documented** (README/AGENTS.md has the local-app APK path, the local profile/flag
  names, the expected AVD) → proceed to §1.
- **Not documented** → set it up with the user before running:
  1. Bootstrap the folder per §1 (`mkdir`, `.gitignore` entry, folder `README.md`).
  2. Derive what you can from the repo itself: read `application.yaml` / Spring profiles, the
     Maven `pom.xml`, and any existing run scripts to determine the local profile/flag names.
     Only ask the user for what genuinely can't be derived (e.g. preferred AVD name).
  3. Write the local-execution block into AGENTS.md (APK path, profile flags, AVD name) so every
     future `--local` run passes this check immediately.
  4. Show the user the config you derived and wrote, get their go-ahead, then continue to §1.

## 1. APK convention + folder bootstrap

- The user drops the APK into the repo's local-app folder (default convention: `local-app/` —
  confirm the actual path in AGENTS.md).
- **The folder is kit-created, not user-created.** If the documented folder doesn't exist yet
  (typical on the first `--local` run), create it yourself before asking for the APK:
  1. `mkdir -p <local-app path>`
  2. Add the path to the repo's `.gitignore` (append only if not already covered — APKs are large
     binaries and must never be committed).
  3. Write a short `README.md` inside the folder stating what belongs there (the APK under test)
     and that the folder is gitignored, so the convention survives fresh clones.
  Report what you created, then continue — do not stop to ask permission for this step.
- Verify the APK file exists and is fresh enough for the scenario under test (check mtime; if the
  scenario targets a just-merged feature and the APK is older than the merge, ask the user to
  drop a newer build).
- Never fetch an APK yourself unless the repo documents a download command.

## 2. Preflight probe

| Need | Live probe |
|---|---|
| APK | present at the repo's local-app path |
| Android toolchain | `adb` and `emulator` on `PATH`; an AVD exists (`emulator -list-avds`) |
| Appium server | the repo's local driver server resolves (e.g. `appium` on `PATH`) — see §3 on version-manager false negatives |
| Emulator | one running (`adb devices` shows `emulator-*`), or bootable headless: `emulator -avd <name> -no-window` (background it, wait for `adb wait-for-device` + boot-complete) |

- **All present** → run using the exact command/profile flags the repo's docs specify — never
  invent flags, read them from the README/AGENTS.md.

## 3. Node-tool false negative (version managers)

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

## 4. Genuinely missing — guided bootstrap

**Stop and ask first.** Name each missing piece, then offer the bootstrap checklist below. Never
run installs silently — every step requires explicit user approval, and the fallback to
BrowserStack is always an acceptable answer.

Minimal local toolchain (macOS, Homebrew):

| Missing | Install step |
|---|---|
| Everything | `brew install --cask android-commandlinetools` (SDK + `sdkmanager` + `avdmanager`) |
| adb / platform-tools | `sdkmanager "platform-tools"` |
| Emulator | `sdkmanager "emulator"` |
| System image | `sdkmanager "system-images;android-34;google_apis;arm64-v8a"` (Apple Silicon; use `x86_64` on Intel) |
| AVD | `avdmanager create avd -n ko_local -k "system-images;android-34;google_apis;arm64-v8a"` |
| Appium server | `npm install -g appium` + `appium driver install uiautomator2` |
| APK | ensure the folder exists first (§1 bootstrap), then ask the user to drop the build into it |

After installs: accept licenses once (`sdkmanager --licenses`), then re-run the §2 probe to
confirm green before running any test.

When in doubt about API level / ABI, read the repo's docs or ask the user — do not guess a system
image the app doesn't support.

## 5. Local evidence gathering (for locator discovery / debug)

- Page source: `adb shell uiautomator dump` then pull the XML, or Appium Inspector attached to the
  running session.
- Screenshots: `adb exec-out screencap -p > screen.png`.
- Logs: `adb logcat` filtered to the app package; Appium server log for driver-side failures.
