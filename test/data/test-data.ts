// Values the specs type in or wait with. Expected UI copy lives next to the assertions in each spec.

// Placeholder domain: the registration must never reach a real inbox.
export const E2E_EMAIL = 'langflow-desktop-e2e@example.com';

export const Timeouts = {
  // First boot on a clean machine installs uv/Python/Langflow before the main page (~7 min on a Windows runner).
  firstBootInstall: 15 * 60_000,
  // An already set-up app only starts its backend.
  backendStart: 5 * 60_000,
  // The in-app update downloads the new MSI (hundreds of MB), installs it and restarts the app.
  updateInstall: 15 * 60_000,
  // An evaluation run of a few rows on a flow without models (each row is one flow run).
  evaluationRun: 2 * 60_000,
  // A file the webview downloads by itself (no "Save as" panel).
  download: 30_000,
} as const;
