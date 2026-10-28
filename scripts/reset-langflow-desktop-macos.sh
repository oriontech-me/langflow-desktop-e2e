#!/usr/bin/env bash
# Deletes every Langflow Desktop file on this Mac so the next launch is a first boot again
# (Terms → email registration → setup). Destructive: flows, variables and the venv in ~/.langflow go too.
# ~/Library/*/langflow (no "com.") belongs to a dev/pip Langflow and is left alone.
set -euo pipefail

if pgrep -f 'Langflow .app/Contents/MacOS' >/dev/null; then
  echo "Langflow Desktop is running; quit it first (⌘Q)." >&2
  exit 1
fi
if pgrep -f '\.langflow/\.langflow-venv/bin/python' >/dev/null; then
  echo "A Langflow Desktop backend is still running (port 7860); stop it first: pkill -f .langflow-venv/bin/python" >&2
  exit 1
fi

rm -rf "$HOME/.langflow" \
  "$HOME/Library/Application Support/com.LangflowDesktop" \
  "$HOME/Library/Caches/com.LangflowDesktop" \
  "$HOME/Library/WebKit/com.LangflowDesktop" \
  "$HOME/Library/Logs/com.LangflowDesktop" \
  "$HOME/Library/Saved Application State/com.LangflowDesktop.savedState"
defaults delete com.LangflowDesktop 2>/dev/null || true
echo "Langflow Desktop data removed: next launch is a first boot."
