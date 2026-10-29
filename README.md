# Langflow Desktop — E2E (Windows and macOS)

End-to-end tests for **IBM Langflow Desktop** with [WebdriverIO](https://webdriver.io). The same specs run on both systems:

- **Windows**: against the **QA MSI as it ships** — no plugin, no special build, no change to the app. Runs on CI (GitHub Actions).
- **macOS**: against a QA DMG with the embedded WebDriver server (`enable_webdriver`). Runs on CI and locally — see [macOS](#macos).

> There is no Linux build of the Desktop.

## How it works

Langflow Desktop is a **Tauri** app: its UI runs in a **WebView2** (Edge's engine) inside the app.
WebdriverIO drives that UI through `msedgedriver`:

1. We start the app with WebView2's debug port on (`--remote-debugging-port=9222`).
2. `msedgedriver` **attaches** to the already open webview (`ms:edgeOptions.debuggerAddress`), using WebDriver Classic.
3. Before the specs, WebdriverIO switches to the window showing the Langflow UI.

All of this lives in `wdio.conf.ts`'s `onPrepare`/`before`; the specs only use `$('[data-testid="..."]')`.

**Why not `tauri-driver`/`@wdio/tauri-service`?** They ask for the debug port through the
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` variable, and WebView2 **ignores `WEBVIEW2_*` variables when the app runs as
administrator** ([Microsoft docs](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/security#for-an-elevated-host-app-use-appropriate-override-flags)).
GitHub's Windows runners run everything as administrator. The `HKLM\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments`
policy is honoured anyway — the workflow sets it before the tests.

```
langflow-ai/langflow-desktop          this repo (GitHub Actions, windows-latest)
  workflow "Build Unsigned"   ──MSI──▶  downloads the langflow-windows-msi artifact
  (pr-build.yml)                        installs it with msiexec /qn
                                        sets the HKLM debug-port policy
                                        WebdriverIO starts "Langflow .exe", attaches msedgedriver and runs the specs
                                        publishes test-results/ as an artifact
```

## Running on CI (no machine left on)

1. Create a **fine-grained PAT** with *Resource owner* `langflow-ai`, only the `langflow-desktop` repository,
   permission **Actions: Read-only**. An admin of the `langflow-ai` org has to approve it.
2. Save it as the **`LANGFLOW_DESKTOP_TOKEN`** secret in this repository (Settings → Secrets → Actions).
3. Run the **Langflow Desktop E2E (Windows)** workflow from *Actions → Run workflow*:
   - `build`: **which build to test** — paste the link of the "Build Unsigned" run (or just its id). To see the
     available builds, first run the **Langflow Desktop builds** workflow (Linux, a few seconds): its *Summary* shows a
     table of the builds that still have installers, per system, and which PR each one was built from;
   - `desktop_branch`: only used when `build` is empty — tests the latest build of that branch (default `release-1.13.0`).
   If the chosen build has expired (or, on macOS, has no WebDriver), the run fails right at the first step saying so.
   Manual only for now; a schedule (Mon–Fri 06:00 BRT) is commented out in the workflow, to turn on once the suite is stable.
4. Result: the run's *Summary* tab + the `desktop-e2e-windows-<id>` artifact with WebdriverIO logs,
   failure screenshots, the installer log and the app logs.

The Desktop's MSI artifacts expire after **7 days** — the workflow needs a recent "Build Unsigned" run.
A full run takes ~10–15 min (the first boot installs Python + Langflow: ~7 min).

> This repository is public: anyone signed in to GitHub can read the run logs and download the artifacts. Never
> commit secrets; they go in GitHub Secrets. The artifacts carry logs only — the app's database and `.env` are left out.

## Running on your Windows PC (to write/debug tests)

⚠️ The app uses the fixed port **7860** and keeps its data in `%LOCALAPPDATA%\com.LangflowDesktop` and
`%APPDATA%\com.LangflowDesktop`. The tests touch the same data as a Langflow Desktop you use day to day,
and the "first boot" flow only shows on a clean machine (without those folders).

Prerequisites: Node 20+ and the WebView2 Runtime (ships with Windows 11). Run from a **regular** terminal (not as
administrator) — that way the environment variable is enough and the registry stays untouched.

```powershell
npm ci

# installs an MSI downloaded from the "Build Unsigned" workflow and finds the .exe path
$env:LANGFLOW_DESKTOP_EXE = ./scripts/install-langflow-desktop.ps1 -MsiPath C:\path\Langflow_1.13.0_x64_en-US.msi
# or, if it's already installed:
# $env:LANGFLOW_DESKTOP_EXE = "C:\Program Files\Langflow\Langflow .exe"

npm test          # everything
npm run test:smoke
```

Quit Langflow Desktop before running: WebdriverIO starts its own instance.

## macOS

On macOS the webview (WKWebView) has no debug port, so the app has to bring its own WebDriver server:
the `tauri-plugin-wdio-webdriver` plugin, which `langflow-desktop` only compiles when the **"Build Unsigned"** workflow
is dispatched with **`enable_webdriver` = true** (`webdriver` feature; it never goes into a production build).
The app opens the server on `127.0.0.1:4445` and WebdriverIO talks to it directly — no `msedgedriver`.

**CI:** the **Langflow Desktop E2E (macOS)** workflow (*Actions → Run workflow*), manual only; a run takes ~3–4 min, plus
however long GitHub takes to hand out a macOS machine. Pick the build in the `build` field (run link or id, as on Windows)
or leave it empty for the latest build of the branch (default `release-1.14.0`) compiled with `enable_webdriver` (checked
in the DMG job's log). In the **Langflow Desktop builds** table, only DMGs marked "with WebDriver" will do.

```bash
# 1. once per build: download the DMG of a "Build Unsigned" run with enable_webdriver and extract the app into .cache/app
gh run download <RUN_ID> -R langflow-ai/langflow-desktop -n langflow-macos-arm-dmg -D .cache/dmg
scripts/install-langflow-desktop-macos.sh .cache/dmg/*.dmg

# 2. before each run: back to the "first boot" (DELETES this machine's Desktop data)
scripts/reset-langflow-desktop-macos.sh

# 3. run
npm run test:mac
npx wdio run ./wdio.mac.conf.ts --mochaOpts.grep "(Terms agreement|Email registration)"   # Terms + registration only
```

⚠️ On macOS the Desktop keeps everything in **`~/.langflow`** (venv, uv, `data/database.db`) besides `~/Library/*/com.LangflowDesktop`
— the reset deletes those paths. `~/Library/*/langflow` folders (without `com.`) belong to a dev Langflow and are left alone.
Port **7860** must be free (stop any dev Langflow first); the run aborts if it's taken. Interrupting a run with Ctrl+C
also quits the app and its backend.

Differences that matter when writing tests:

- Langflow's menus and modal buttons (Radix) **don't react to WebDriver's click** on WKWebView — the element only gets
  focus. Activate them with the keyboard: focus + `browser.keys('Enter')`. Works the same on Windows.
- The bundle's executable is `Langflow .app/Contents/MacOS/Langflow ` (with a trailing space); `wdio.mac.conf.ts` reads the name from `Info.plist`.
- Downloads (exporting a flow, etc.) open the **native** "Save as" dialog, which WebDriver can't see, on both systems.
  There's no way to test them end to end yet.

## Structure

```
wdio.shared.conf.ts          settings shared by both systems (specs, mocha, timeouts, failure screenshots)
wdio.conf.ts                 Windows: starts the app with the debug port, starts msedgedriver and attaches
wdio.mac.conf.ts             macOS: starts the app with the embedded WebDriver server and connects to it
test/
  specs/                     scenarios (describe/it) and assertions — the only place with expect
    first-boot.spec.ts       Terms → email registration → install → main page
  pageobjects/               one class per screen: how to find its elements + the user's actions
    page.ts                  base: byTestId, byText, pressWithKeyboard (Radix)
    terms.page.ts            terms of use
    registration.page.ts     email registration
    setup.page.ts            install screen (waits for the main page, logging each stage)
    main.page.ts             main page / flow cards
    components/              reusable pieces (modals, menus)
      export-flow.modal.ts
  utils/
    backend.ts               backend API: status, create/delete a flow (test data and checks)
  data/
    test-data.ts             input data (test email) and timeouts
scripts/                     list/pick builds, install the MSI/DMG, reset the Desktop data on macOS
.github/workflows/           Windows and macOS CI + "Langflow Desktop builds" (lists the available builds)
```

## Writing tests

We follow WebdriverIO's [Page Object pattern](https://webdriver.io/docs/pageobjects) and its
[best practices](https://webdriver.io/docs/bestpractices):

- **Page object = selectors + actions, no `expect`.** Each screen is a class extending `Page`, with one getter per
  element (`get agreeButton() { return this.byTestId('terms-agree-button'); }`) and methods for what the user does
  (`agree()`, `submit(email)`). The file exports **one instance** (`export default new TermsPage()`), with no state.
- **Spec = scenario + assertions.** The spec calls the actions and checks with `await expect(Page.element).toBe...()`.
  Expected copy (error messages, copyright) lives as constants at the top of the spec.
- **Selectors:** `data-testid` first (`langflow-ai/langflow-desktop`, `src/frontend/src/`; the Desktop's own screens
  are in `src/frontend/src/customization/`, the rest is the Langflow OSS frontend, same ids as `langflow-e2e`).
  Without a test id: a stable `role`/`id`; text (`byText`) only for messages. No CSS classes or positions.
- **Waits:** WebdriverIO's `expect` already waits (up to `waitforTimeout`, 30 s). Don't use `browser.pause`; for
  something slow use `waitUntil`/`waitForDisplayed` with a timeout from `test-data.ts`.
- **Test data and checks through the API** (`test/utils/backend.ts`): the runner sits on the same machine as the app,
  so the spec creates what it needs (e.g. `createFlow`) and deletes it in `after`. Use the UI only for what the test validates.
- All specs share **one** app instance, started in `onPrepare`, and run in sequence by file name
  (`maxInstances: 1`, fixed port). One spec's end state is the next one's starting point.
- Imports between `.ts` files use the `.js` extension (`'../pageobjects/terms.page.js'`) — required by `module: NodeNext`.
- `main` only takes changes through a pull request: work on a branch and open a PR.
