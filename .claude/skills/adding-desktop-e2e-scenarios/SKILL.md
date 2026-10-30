---
name: adding-desktop-e2e-scenarios
description: Use when the QA hands over a Langflow Desktop scenario to automate, or when adding, changing or fixing a spec or page object in this WebdriverIO repo (langflow-desktop-e2e). Not for the Langflow web app or Playwright tests.
---

# Adding a Langflow Desktop E2E scenario

A scenario is done when it passes on **macOS and Windows CI** against the same Desktop build, has been
seen failing once, and is in a PR. Automate only what the QA asked for.

## 1. Find the selectors in the Desktop source, not by guessing

The Desktop ships its own copy of the Langflow frontend, so web `data-testid`s may differ or be missing
(the Desktop has no login, for example). Look them up in `langflow-ai/langflow-desktop`:

```bash
# Default branch only. Screens the Desktop overrides live in src/frontend/src/customization/.
gh search code '<testid or visible text>' --repo langflow-ai/langflow-desktop --json path -q '.[].path'
# A file on the branch being tested:
gh api "repos/langflow-ai/langflow-desktop/contents/<path>?ref=<branch>" --jq .content | base64 -d
```

Selector order: `data-testid` → stable `id`/`role` → `byText` (only for messages). Never CSS classes or
positions. UI copy is `t("key")`: the English text is in `src/frontend/src/locales/en.json`. If the
test id sits on an inner element of a menu trigger, press the focusable ancestor instead, e.g.
`$('button:has([data-testid="x"])')`. If the element has no usable selector, tell the QA and ask the Langflow team for a test id;
don't invent one. Put the source path in a comment on the page object, like `main.page.ts` does.

## 2. Write it the way the repo already does

- **Page object** (`test/pageobjects/`, modals in `components/`): extends `Page`, one getter per element,
  one method per user action, `export default new X()`, no `expect`. Radix menus/dialog buttons:
  `pressWithKeyboard`, never `click()`. Radix content renders in a portal: select it globally, not
  inside the trigger's parent.
- **Spec** (`test/specs/`): actions + `await expect(...)`; expected copy as constants at the top.
  The file must sort **after** `first-boot.spec.ts`: it starts on the main page left by the previous spec,
  and must leave the app there (close menus/modals in `after`).
- Test data through the API (`test/utils/backend.ts`), created in `before`, deleted in `after`.
- No `browser.pause`; long waits use a timeout from `test/data/test-data.ts`.
- Imports end in `.js`.

## 3. Validate, in this order

```bash
npm run typecheck
scripts/reset-langflow-desktop-macos.sh && npm run test:mac   # full suite: first boot runs first
```

The reset deletes only Langflow Desktop's data (`~/.langflow`, `~/Library/*/com.LangflowDesktop`), never
a dev Langflow's. Tell the QA before the first reset in a session.

Then break one selector or expected value, run again, confirm the new test fails with a clear message,
and revert. Then CI, from the branch, on one build that has both installers and a DMG
"with WebDriver":

```bash
GH_TOKEN=$(gh auth token) scripts/desktop-builds.sh list     # pick <build id>
gh workflow run "Langflow Desktop E2E (macOS)"   --ref <branch> -f build=<build id>
gh workflow run "Langflow Desktop E2E (Windows)" --ref <branch> -f build=<build id>
gh run list -R oriontech-me/langflow-desktop-e2e -b <branch> -L 2   # then: gh run watch <e2e run id> --exit-status
```

If no build has both, run each system on its newest valid build and say so in the PR.

A failure on one system only is usually the webview: check the failure screenshot in the run's
artifact before changing waits.

## 4. Deliver

Branch off `main`, commit only the files for this scenario, open a PR with both CI run links and what the
scenario covers. Never push to `main`.
