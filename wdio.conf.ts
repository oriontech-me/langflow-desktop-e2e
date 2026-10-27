import fs from 'node:fs';
import path from 'node:path';
import type { TauriCapabilities } from '@wdio/tauri-service';

// Path to the installed "Langflow .exe". CI resolves it after installing the MSI
// (see scripts/install-langflow-desktop.ps1); locally, export it yourself.
const appPath = process.env.LANGFLOW_DESKTOP_EXE;
if (!appPath || !fs.existsSync(appPath)) {
  throw new Error(
    `LANGFLOW_DESKTOP_EXE must point to the installed Langflow Desktop executable (got: ${appPath ?? '<unset>'})`,
  );
}

const outputDir = path.resolve('./test-results');

export const config: WebdriverIO.Config = {
  runner: 'local',
  specs: ['./test/specs/**/*.spec.ts'],
  // The app binds the backend to the fixed port 7860 and shares ~/.langflow,
  // so only one instance can run at a time.
  maxInstances: 1,

  services: [
    [
      '@wdio/tauri-service',
      {
        // 'official' is deprecated in favour of 'external' (same tauri-driver behaviour).
        driverProvider: 'external',
        appBinaryPath: appPath,
        autoDownloadEdgeDriver: true,
        // First boot installs uv + Python + Langflow into ~/.langflow before the UI is usable.
        startTimeout: 120_000,
        commandTimeout: 60_000,
        captureBackendLogs: true,
        captureFrontendLogs: true,
        logDir: path.join(outputDir, 'logs'),
      },
    ],
  ],

  capabilities: [
    {
      browserName: 'tauri',
      'tauri:options': { application: appPath },
    } satisfies TauriCapabilities as WebdriverIO.Capabilities,
  ],

  logLevel: 'info',
  // Each failed session attempt relaunches the app and waits ~60s; retrying only hides the real error.
  connectionRetryCount: 0,
  outputDir: path.join(outputDir, 'logs'),
  waitforTimeout: 30_000,

  framework: 'mocha',
  mochaOpts: { ui: 'bdd', timeout: 15 * 60_000 },
  reporters: ['spec'],

  afterTest: async (test, _context, { passed }) => {
    if (passed) return;
    const shotsDir = path.join(outputDir, 'screenshots');
    fs.mkdirSync(shotsDir, { recursive: true });
    const name = `${test.parent} - ${test.title}`.replace(/[^\w.-]+/g, '_');
    await browser.saveScreenshot(path.join(shotsDir, `${name}.png`));
  },
};
