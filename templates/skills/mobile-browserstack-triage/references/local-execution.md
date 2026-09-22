# Local Execution — Android Emulator + iOS Simulator

Shared by `/ko-mobile-test --local` and `/ko-mobile-heal --local`. The default execution target
is BrowserStack; `--local` runs against a local emulator/simulator with a user-supplied app
binary. Follow this procedure exactly — never attempt a local run on the hope it'll work.

**Platform selection:**

- `--local` or `--local android` → Android emulator + APK → **Part A**
- `--local ios` → iOS Simulator + `.app` → **Part B**
- Optional modifiers: `--build` (iOS only — compile the simulator `.app` from local source
  first, §B5) and `--fetch` (pull the latest CI artifact — only when the repo documents a
  download command, §B1).

## The execution paths

| | BrowserStack (default) | Local Android (`--local`) | Local iOS (`--local ios`) |
|---|---|---|---|
| App binary | repo's BrowserStack upload pipeline (`bs://` id) | APK at the repo's local-app path | Simulator `.app` at the repo's local-app path — **a signed `.ipa` cannot run on a simulator, never attempt it** |
| Host OS | any | any | **macOS only** (Xcode ships the simulator) |
| Evidence for new locators | BrowserStack MCP session / App Live capture | emulator + Appium Inspector, or `adb shell uiautomator dump` | simulator + Appium Inspector page source, or `xcrun simctl` captures |
| Debug logs | BrowserStack MCP (device/network/session logs, video) | `adb logcat`, local screenshots, Appium server logs | `xcrun simctl spawn booted log stream`, `simctl io` screenshots, Appium server logs |
| Run command | repo's BrowserStack profile flags | same Maven command, repo's local Android profile flags | same Maven command, repo's local iOS profile flags |

## 0. Repo support check — configure if missing (both platforms)

`--local` is an explicit request to run locally — never silently fall back to BrowserStack, and
never refuse just because the config block doesn't exist yet. Get the repo configured first,
then run.

- **Already documented** (README/AGENTS.md has the local-app binary path per platform, the local
  profile/flag names, the expected emulator/simulator) → proceed to the platform's Part.
- **Not documented** → set it up with the user before running:
  1. Bootstrap the folder per §A1 / §B1 (`mkdir`, `.gitignore` entry, folder `README.md`).
  2. Derive what you can from the repo itself: read `application.yaml` / Spring profiles, the
     Maven `pom.xml`, and any existing run scripts to determine the local profile/flag names.
     Only ask the user for what genuinely can't be derived (e.g. preferred AVD name, simulator
     device, iOS scheme).
  3. Write the local-execution block into AGENTS.md (binary paths, profile flags, AVD name /
     simulator device, and for iOS `--build`: the `.xcodeproj`/`.xcworkspace` path and scheme)
     so every future `--local` run passes this check immediately.
  4. Show the user the config you derived and wrote, get their go-ahead, then continue.

---

# Part A — Android (APK + Emulator)

## A1. APK convention + folder bootstrap

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

## A2. Preflight probe

| Need | Live probe |
|---|---|
| APK | present at the repo's local-app path |
| Android toolchain | `adb` and `emulator` on `PATH`; an AVD exists (`emulator -list-avds`) |
| Appium server | the repo's local driver server resolves (e.g. `appium` on `PATH`) — see §A3 on version-manager false negatives |
| Emulator | one running (`adb devices` shows `emulator-*`), or bootable headless: `emulator -avd <name> -no-window` (background it, wait for `adb wait-for-device` + boot-complete) |

- **All present** → run using the exact command/profile flags the repo's docs specify — never
  invent flags, read them from the README/AGENTS.md.

## A3. Node-tool false negative (version managers)

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

## A4. Genuinely missing — guided bootstrap

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
| APK | ensure the folder exists first (§A1 bootstrap), then ask the user to drop the build into it |

After installs: accept licenses once (`sdkmanager --licenses`), then re-run the §A2 probe to
confirm green before running any test.

When in doubt about API level / ABI, read the repo's docs or ask the user — do not guess a system
image the app doesn't support.

## A5. Local evidence gathering (for locator discovery / debug)

- Page source: `adb shell uiautomator dump` then pull the XML, or Appium Inspector attached to the
  running session.
- Screenshots: `adb exec-out screencap -p > screen.png`.
- Logs: `adb logcat` filtered to the app package; Appium server log for driver-side failures.

---

# Part B — iOS (simulator `.app` + iOS Simulator)

**Hard constraints, internalize before doing anything:**

- iOS Simulators run **only on macOS with Xcode**. If `uname` is not `Darwin`, local iOS is
  impossible on this machine — say so and offer BrowserStack instead. Never attempt workarounds.
- A signed `.ipa` **cannot** run on a simulator (device ARM build + Apple signing). The simulator
  needs an **unsigned simulator build** (`.app`, from `-sdk iphonesimulator`). If the user hands
  you an `.ipa`, stop and explain — the fix is a simulator `.app` (§B1), not a conversion.
- Code signing is **not** required for simulator runs — WebDriverAgent runs unsigned there. If
  any guide tells you to configure signing, that's the real-device path, which this kit does not
  support (real-device + signed IPA stays on BrowserStack).

## B1. `.app` acquisition — three sources, in priority order

1. **Existing binary (default)** — the user drops the simulator `.app` (usually zipped) into the
   repo's local-app iOS folder (default convention: `local-app/ios/` — confirm in AGENTS.md).
   **The folder is kit-created, not user-created** — same bootstrap rules as §A1 (`mkdir -p`,
   `.gitignore` entry — app bundles are large and must never be committed, folder `README.md`).
   Verify the `.app` exists and is fresh enough for the scenario (mtime vs. the relevant merge),
   exactly as §A1 does for APKs.
2. **`--build`** — compile from local source. Requires AGENTS.md to document the iOS
   project/workspace path and scheme (§0 step 3). Run §B5, which deposits the fresh `.app` into
   the local-app folder, then continue. This is the engineer inner loop: source change → build →
   test, all local.
3. **`--fetch`** — pull the latest CI artifact. **Only when the repo documents a download
   command** (e.g. a Bitrise API script with a read-only token). Never invent a fetch mechanism;
   if none is documented, treat `--fetch` as unconfigured and tell the user what's needed.

## B2. Preflight probe

| Need | Live probe |
|---|---|
| Host OS | `uname` → must be `Darwin` |
| Xcode | `xcode-select -p` resolves; license accepted (`xcrun simctl list devices` runs clean) |
| Simulator | a device exists and is bootable: `xcrun simctl list devices available` — pick the one AGENTS.md names; boot it: `xcrun simctl boot <udid>` then `xcrun simctl bootstatus <udid>` |
| Appium server + driver | `appium` on `PATH` (see §A3 on version-manager false negatives) **and** `appium driver list --installed` shows `xcuitest` |
| `.app` | present at the repo's local-app iOS path — unless `--build` was passed (§B5 produces it) |

- **All present** → run using the exact command/profile flags the repo's docs specify for the iOS
  local profile — never invent flags, read them from the README/AGENTS.md.

## B3. Node-tool false negative

Same failure mode as Android — see §A3. Applies verbatim to `appium` and its drivers.

## B4. Genuinely missing — guided bootstrap

**Stop and ask first** — same rules as §A4: name each missing piece, never install silently, and
BrowserStack is always an acceptable fallback.

| Missing | Install step |
|---|---|
| Xcode | App Store, or `brew install xcodes` + `xcodes install --latest`; then first launch, `sudo xcodebuild -license accept` |
| iOS simulator runtime | Xcode → Settings → Platforms, or `xcodebuild -downloadPlatform iOS` |
| Simulator device | `xcrun simctl create ko_local "iPhone 16" ` (pick a device type the repo's profile targets) |
| Appium server | `npm install -g appium` + `appium driver install xcuitest` |
| `.app` | ensure the folder exists first (§B1 bootstrap), then ask the user for a simulator build, or use `--build` if source access exists |

After installs, re-run the §B2 probe to confirm green before running any test.

## B5. `--build` — compile the simulator `.app` from source

Requires the iOS repo checked out locally and AGENTS.md documenting the project/workspace path +
scheme (§0). Read those values from AGENTS.md — never guess a scheme name.

```bash
xcodebuild build \
  -workspace <path from AGENTS.md> \   # or -project for .xcodeproj
  -scheme <scheme from AGENTS.md> \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath <local-app ios path>/.build
```

- **Fixed `derivedDataPath` under the local-app folder is deliberate** — it makes rebuilds
  incremental (seconds after the first clean build) and keeps DerivedData out of the user's
  global `~/Library`. Ensure `.build/` is covered by the same `.gitignore` entry as the folder.
- No signing flags — simulator builds are unsigned by design; do not add provisioning settings.
- On success, copy the product into place:
  `cp -R "<derivedDataPath>/Build/Products/Debug-iphonesimulator/"*.app <local-app ios path>/`
- On failure, surface the xcodebuild error verbatim (pipe through `xcbeautify` if available) —
  build failures are repo/dependency issues, not test issues; stop and report, don't retry-loop.
- Building on every invocation is opt-in (`--build`), not default — rerunning tests against an
  unchanged `.app` should not pay compile time.

## B6. Local evidence gathering (for locator discovery / debug)

- Page source: Appium Inspector attached to the running session is the primary tool; the XML is
  also available from the Appium server on demand. iOS accessibility ids are usually stable —
  prefer them (same priority order as Android: Accessibility ID first, XPath last resort).
- Screenshots: `xcrun simctl io booted screenshot screen.png`.
- Logs: `xcrun simctl spawn booted log stream --level debug` filtered to the app process; Appium
  server log for driver-side failures.
