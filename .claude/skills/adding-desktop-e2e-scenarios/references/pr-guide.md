# Opening a PR

Open the PR only when the QA asks (the branch is already pushed for CI). `main` rejects direct pushes.

## Branch and title

- Branch: `type/short-kebab-desc` with type `test/`, `fix/`, `feat/`, `docs/` or `chore/`
  (e.g. `test/user-menu-settings`).
- Commit and PR title: Conventional Commits, `type(scope): summary`, imperative, lowercase, no period
  (e.g. `test(main-page): check the user menu shows Settings`). Scope is the screen or area.
- Commit only the files of this change; stage them by name.

## Body: new test

```markdown
## Covered tests
| # | Test | What it validates |
|---|------|-------------------|
| 1 | `<exact it title>` | <observable behavior and the regression it catches> |

## How it was built
- Selectors and where they were confirmed (langflow-desktop file path).
- Any workaround used (keyboard instead of click, API setup) and why.

## Validation
- Build: <build link> — `<branch>` @ `<commit>`
- macOS CI: <run link> — <N passing>
- Windows CI: <run link> — <N passing>
- Force-fail: <what was mutated, failed as expected, reverted>
- Leftover flows after the run: 0
```

## Body: fix or flaky test

```markdown
**Problem:** what failed, on which system and runs, and the root cause.
**Fix:** what changed and why; alternatives rejected.
**Unchanged:** assertions and behavior left as they were.
**Validation:** the same block as above.
```

Put real results only: if something was not run, say so.
