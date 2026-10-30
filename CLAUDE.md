# Langflow Desktop E2E

WebdriverIO + Mocha (TypeScript) tests for **IBM Langflow Desktop**, a **Tauri v2** app: the UI runs in the
system webview (WebView2 on Windows, WKWebView on macOS), the backend is a local Langflow on port 7860.
It is not Electron and not the Langflow web app: Playwright and the `langflow-e2e` helpers
(`awaitBootstrapTest`, fixtures, `page.getByTestId`) do not apply here. Only the `data-testid`s are shared.

To add or change a test scenario, use the `adding-desktop-e2e-scenarios` skill (`.claude/skills/`).

## Commands

- `npm run typecheck`
- macOS: `scripts/reset-langflow-desktop-macos.sh && npm run test:mac`. The reset deletes this Mac's
  Desktop data so the run starts at first boot. Quit Langflow Desktop and anything on port 7860 first.
- Windows: `npm test` with `LANGFLOW_DESKTOP_EXE` set (see README).
- CI: `gh workflow run "Langflow Desktop E2E (macOS)" -f build=<run id>` (same for "(Windows)");
  `gh workflow run "Langflow Desktop builds"` lists the builds that can still be tested.

## How the app is driven (don't rediscover this)

- **Windows**: WebView2 opens a debug port (9222) and `msedgedriver` attaches with `debuggerAddress`.
  CI runners are elevated and ignore `WEBVIEW2_*` env vars, so the workflow sets the port with the
  HKLM `AdditionalBrowserArguments` policy. tauri-driver does not work there.
- **macOS**: only builds dispatched with `enable_webdriver=true` embed a WebDriver server on 127.0.0.1:4445.
  The executable is `Langflow .app/Contents/MacOS/Langflow ` (trailing space in both names).
- Builds come from the **Build Unsigned** workflow (`pr-build.yml`) in the private
  `langflow-ai/langflow-desktop`; artifacts expire after 7 days. `scripts/desktop-builds.sh` finds and
  validates them; the `LANGFLOW_DESKTOP_TOKEN` secret only has Actions: read.
- All specs share **one** app instance and run in file-name order; each spec starts where the previous ended.
  Every CI run starts on a clean machine, so `first-boot.spec.ts` always runs first.

## Known limits

- Radix triggers (dropdown menus, some dialog buttons) do not open with a WebDriver click on WKWebView:
  use `pressWithKeyboard` from `test/pageobjects/page.ts` (focus + Enter), which works on both systems.
- Native OS dialogs (save/open file) can't be driven, and `__TAURI_INTERNALS__.invoke` is read-only, so
  it can't be stubbed. This is why `flow-export.spec.ts` is skipped.
- Never touch `~/Library/Caches/langflow` or `~/Library/Application Support/langflow` (no `com.`):
  they belong to a dev Langflow, not the Desktop.

## Repo rules

- The repository is **public**: never commit tokens, `.env` files or app data. CI artifacts exclude the
  database and `.env` on purpose.
- `main` only takes changes through a pull request: work on a branch. Pushing a work branch to run CI is
  fine; open PRs only when the QA asks.
- Only write the test scenarios the QA asks for.
- Talk to the QA in Portuguese; code, comments, README, commits and PRs are in English.
