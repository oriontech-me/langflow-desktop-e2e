#!/usr/bin/env bash
# Finds langflow-desktop "Build Unsigned" (pr-build.yml) runs whose installers can still be downloaded
# (artifacts expire after 7 days). Needs GH_TOKEN with Actions: read on langflow-ai/langflow-desktop.
#
#   desktop-builds.sh list [limit]
#       Markdown table of the recent builds that still have a Windows MSI or a macOS DMG.
#   desktop-builds.sh resolve <artifact> <branch> [build] [webdriver]
#       Prints the run id to test. build: a run id or run URL; empty = latest build on <branch> with
#       <artifact>. "webdriver" also requires the DMG to be built with enable_webdriver=true.
set -euo pipefail

REPO=langflow-ai/langflow-desktop
WORKFLOW=pr-build.yml
MSI=langflow-windows-msi
DMG=langflow-macos-arm-dmg
DMG_JOB='macOS ARM (DMG)'

fail() { echo "::error::$*" >&2; exit 1; }

# Names of run $1's artifacts that haven't expired. tr: gh on the Windows runner may end lines with CR.
artifacts() {
  gh api "repos/$REPO/actions/runs/$1/artifacts" --jq '.artifacts[] | select(.expired | not) | .name' | tr -d '\r'
}

# The run's inputs aren't exposed by the API: read the DMG job's log for the flag instead.
has_webdriver() {
  local job
  job=$(gh api "repos/$REPO/actions/runs/$1/jobs" --paginate \
    --jq ".jobs[] | select(.name == \"$DMG_JOB\" and .conclusion == \"success\") | .id" | tr -d '\r')
  # curl, not gh api: recent gh refuses to print a response holding terminal escape sequences,
  # and build logs are full of ANSI colours. grep without -q: an early exit would fail curl under pipefail.
  [ -n "$job" ] && curl -fsSL -H "Authorization: Bearer $GH_TOKEN" \
    "https://api.github.com/repos/$REPO/actions/jobs/$job/logs" | grep -F 'ENABLE_WEBDRIVER: true' >/dev/null
}

list() {
  echo "| Build | Branch @ commit | Created | Windows MSI | macOS DMG |"
  echo "|---|---|---|---|---|"
  gh run list -R "$REPO" -w "$WORKFLOW" -s success -L "${1:-30}" \
    --json databaseId,headBranch,createdAt,headSha \
    --jq '.[] | [.databaseId, .headBranch, .createdAt, .headSha[0:7]] | @tsv' | tr -d '\r' |
    while IFS=$'\t' read -r id branch created sha; do
      names=$(artifacts "$id")
      msi='—'
      dmg='—'
      grep -x "$MSI" <<<"$names" >/dev/null && msi='✅'
      if grep -x "$DMG" <<<"$names" >/dev/null; then
        if has_webdriver "$id"; then dmg='✅ with WebDriver'; else dmg='without WebDriver (not testable)'; fi
      fi
      [ "$msi$dmg" = '——' ] && continue
      echo "| [$id](https://github.com/$REPO/actions/runs/$id) | \`$branch\` @ \`$sha\` | ${created%T*} | $msi | $dmg |"
    done
}

resolve() {
  local artifact=$1 branch=$2 build=${3:-} need=${4:-} id
  local what="downloadable $artifact${need:+ built with enable_webdriver=true}"
  usable() { artifacts "$1" | grep -x "$artifact" >/dev/null && { [ "$need" != webdriver ] || has_webdriver "$1"; }; }

  if [ -n "$build" ]; then
    id=$(grep -oE '[0-9]{6,}' <<<"$build" | head -1 || true)
    [ -n "$id" ] || fail "\"$build\" is not a run id or a run URL"
    usable "$id" || fail "Run $id has no $what (artifacts expire after 7 days). Run the \"Langflow Desktop builds\" workflow to see the builds you can pick."
    echo "$id"
    return
  fi
  for id in $(gh run list -R "$REPO" -w "$WORKFLOW" -b "$branch" -s success -L 20 \
                --json databaseId --jq '.[].databaseId' | tr -d '\r'); do
    if usable "$id"; then echo "$id"; return; fi
  done
  fail "No Build Unsigned on $branch has a $what. Dispatch one${need:+ with enable_webdriver checked}, or pick another build."
}

case "${1:-}" in
  list) shift; list "$@" ;;
  resolve) shift; resolve "$@" ;;
  *) echo "usage: $0 list [limit] | resolve <artifact> <branch> [build] [webdriver]" >&2; exit 2 ;;
esac
