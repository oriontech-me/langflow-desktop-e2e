# Test conventions

Adapted from the `langflow-e2e` (Playwright, web) team skill to this suite. What differs here: one app
instance, specs run one after another in file-name order, no parallel workers, no fixtures.

## Spec files

- **Top comment**: what the spec covers, where it starts (state left by the previous spec) and which
  sibling spec already covers related behavior, so nothing is tested twice.
- **Names**: `describe` names the screen or journey, `it` states the observable result
  ("declining keeps the app open, without access, and installs nothing"), not the action.
- **Dependent steps**: the `it`s of a spec run in order and share the app, like `first-boot.spec.ts`.
  Each `it` starts where the previous ended; say so in the top comment.
- **Tags** go in the `describe` title (`@smoke`) and are selected with `--mochaOpts.grep`.
- **Comment the non-obvious**, especially an assertion deliberately not made and why.

## Waiting

- Wait on a real signal (an element, a status code), never on time. The `expect` matchers already
  retry up to `waitforTimeout` (30 s); longer waits take a value from `test/data/test-data.ts`.
- **Either of two outcomes**: poll both with `browser.waitUntil` over `isDisplayed()`. Don't race two
  waits, and don't branch on `isExisting()`: an element can exist hidden.
- **Persistence**: to prove something was saved, poll the backend API (`test/utils/backend.ts`) until
  it shows the expected state. A quiet UI does not mean the save happened.

## Data and cleanup

- Create what the test needs through the API in `before`, with a unique name
  (`` `e2e ${Date.now()}` ``), and keep the **id** the API returns.
- Delete **only those ids** in `after`, even if the test failed. Never delete by name or "everything":
  the next spec and the QA's own data live in the same app.
- Find cards by id (`MainPage.flowCard(id)`), never by position: the list order changes.
- Before reporting, list the flows (`GET /api/v1/flows/`) and state how many the run left behind (should
  be 0).

## Force-fail (prove the test can fail)

A test that never failed proves nothing. For **each new `it`**, separately (the `it`s are dependent,
so the first failure hides the rest):

1. Change one thing so that `it` must fail, marked `// FF-MUTATION`: an expected text, a test id, a
   skipped action, or a cleanup turned into a no-op (then count leftover flows instead).
2. Run it and confirm it fails on that `it`, with a message that points at the cause.
3. Revert. `grep -rn "FF-MUTATION" test` must print nothing, then do one final green run.

## Reading results

- Trust the final `N passing` / `N failing` line and the process exit code (or the CI run's
  conclusion), not lines scrolling by.
- Use the duration as a sanity check: a test that ends at its timeout failed, whatever the log says.
- Report what really ran: what passed, what was skipped and why. Never claim a pass you didn't see.

## A failure that isn't the test

Suspect the environment before the code:
- A local run started without the reset: the app skips first boot.
- Port 7860 is taken by another Langflow.
- The build is not the one you think it is: check the run's Summary line.
- On CI, the first boot install is slow (Windows ~9 min). Look at the `[setup +Ns]` lines before
  raising timeouts.
