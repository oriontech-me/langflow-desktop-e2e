import { config as windowsConfig } from './wdio.conf.js';

// Upgrade test (Windows): starts on an older QA release installed from langflow-ai/desktop-updates and
// updates it in-app to the release qa_latest.json points to. It needs its own install, so it is kept out
// of the regular suite (test/specs) and run by the "Langflow Desktop Upgrade E2E (Windows)" workflow.
export const config: WebdriverIO.Config = {
  ...windowsConfig,
  specs: ['./test/upgrade/**/*.spec.ts'],
};
