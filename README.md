# Langflow Desktop — E2E

Automated end-to-end tests for **IBM Langflow Desktop** on **Windows** and **macOS**, written with
[WebdriverIO](https://webdriver.io). They install a Desktop build, open the app and check it the way a user would:
terms, email registration, first-time setup, main page.

## How it works

```
langflow-ai/langflow-desktop                 this repo (GitHub Actions)
  "Build Unsigned" workflow                    1. finds the build: the one you picked, or the latest on the branch
  builds the installers  ── MSI / DMG ──▶      2. downloads its installer (MSI on Windows, DMG on macOS)
  (kept 7 days as run artifacts)               3. installs it on a fresh GitHub machine
                                               4. opens Langflow Desktop and runs the tests against it
                                               5. publishes the results: Summary + logs and screenshots
```

1. **Finding the build.** The Langflow team builds the Desktop with the **Build Unsigned** workflow in the private
   `langflow-ai/langflow-desktop` repository; each run keeps its installers as artifacts for 7 days. This repo reads
   them with a read-only token (`LANGFLOW_DESKTOP_TOKEN` secret, *Actions: Read-only* on that repository).
   `scripts/desktop-builds.sh` checks that the chosen build still has its installer — and, for macOS, that it was built
   with `enable_webdriver` — and fails right away if not.
2. **Installing.** Windows installs the MSI silently; macOS copies the app out of the DMG.
3. **Testing.** WebdriverIO starts the app and controls its screen through WebDriver: on Windows by attaching
   `msedgedriver` to the app's webview, on macOS through the WebDriver server built into `enable_webdriver` builds.
   Every run starts from a clean machine, so it always goes through the first-boot flow.

## Run on CI

1. *Actions* → **Langflow Desktop builds** → *Run workflow* — lists the Desktop builds you can test, and the PR each came from.
2. *Actions* → **Langflow Desktop E2E (Windows)** or **(macOS)** → *Run workflow* — paste the build's link in `build`
   (or leave it empty for the latest one).
3. Results are in the run's *Summary*; logs and failure screenshots are in its artifact.

macOS needs a build made with `enable_webdriver` (marked "with WebDriver" in the builds list).
Builds expire after 7 days.

## Run locally

**macOS**

```bash
npm ci
gh run download <RUN_ID> -R langflow-ai/langflow-desktop -n langflow-macos-arm-dmg -D .cache/dmg
scripts/install-langflow-desktop-macos.sh .cache/dmg/*.dmg   # once per build

scripts/reset-langflow-desktop-macos.sh   # before every run: deletes this machine's Langflow Desktop data
npm run test:mac
```

**Windows** (regular terminal, not as administrator)

```powershell
npm ci
$env:LANGFLOW_DESKTOP_EXE = ./scripts/install-langflow-desktop.ps1 -MsiPath <path to the .msi>
npm test
```

Quit Langflow Desktop and any other Langflow on port 7860 first.

## Structure

```
test/specs/          test scenarios and assertions
test/pageobjects/    one class per screen: its elements and user actions
test/utils/          backend API helpers (create/delete test data)
test/data/           test data and timeouts
wdio*.conf.ts        how the app is started on each system
scripts/             install a build, reset the app, list builds
.github/workflows/   CI
```

## Contributing

- Follow the [Page Object pattern](https://webdriver.io/docs/pageobjects): page objects hold selectors and actions,
  specs hold the assertions. Prefer `data-testid` selectors.
- `main` only takes changes through a pull request.
- Never commit secrets: this repository is public. They go in GitHub Secrets.
