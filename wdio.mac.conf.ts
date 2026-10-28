import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { SevereServiceError } from 'webdriverio';

// macOS runs against a "Build Unsigned" DMG built with enable_webdriver=true: the app embeds
// tauri-plugin-wdio-webdriver, a W3C WebDriver server, so WebdriverIO talks to the app directly
// (no msedgedriver, no debug port). Builds without that input never open the port.
// LANGFLOW_DESKTOP_APP is the executable inside the bundle: "Langflow .app/Contents/MacOS/Langflow "
// (trailing space). Unset, it defaults to the app scripts/install-langflow-desktop-macos.sh put in .cache/app.
const DEFAULT_APP_DIR = path.resolve('.cache/app');

function installedApp(): string | undefined {
  const bundle = fs.existsSync(DEFAULT_APP_DIR)
    ? fs.readdirSync(DEFAULT_APP_DIR).find((name) => name.endsWith('.app'))
    : undefined;
  if (!bundle) return undefined;
  const plist = path.join(DEFAULT_APP_DIR, bundle, 'Contents/Info.plist');
  const exe = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleExecutable', plist], {
    encoding: 'utf8',
  }).replace(/\n$/, '');
  return path.join(DEFAULT_APP_DIR, bundle, 'Contents/MacOS', exe);
}

const appPath = process.env.LANGFLOW_DESKTOP_APP || installedApp();
if (!appPath || !fs.existsSync(appPath)) {
  throw new Error(
    `No Langflow Desktop app: set LANGFLOW_DESKTOP_APP or run scripts/install-langflow-desktop-macos.sh <dmg> (got: ${appPath ?? '<unset>'})`,
  );
}

const DRIVER_PORT = 4445;
const BACKEND_PORT = 7860;
const outputDir = path.resolve('./test-results');

let app: ChildProcess | undefined;

async function waitForHttp(url: string, what: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error(`${what} not reachable at ${url} after ${timeoutMs / 1000}s`);
}

export const config: WebdriverIO.Config = {
  runner: 'local',
  specs: ['./test/specs/**/*.spec.ts'],
  // One app instance shared by all specs: the backend binds the fixed port 7860.
  maxInstances: 1,

  hostname: '127.0.0.1',
  port: DRIVER_PORT,
  capabilities: [
    {
      // The embedded server ignores capabilities; the name only labels the session.
      browserName: 'langflow-desktop',
      'wdio:enforceWebDriverClassic': true,
    },
  ],

  logLevel: 'info',
  outputDir: path.join(outputDir, 'logs'),
  waitforTimeout: 30_000,
  connectionRetryCount: 0,

  framework: 'mocha',
  mochaOpts: { ui: 'bdd', timeout: 15 * 60_000 },
  reporters: ['spec'],

  onPrepare: async () => {
    // The Desktop backend binds the fixed port 7860. Anything already there (a dev Langflow, a Docker
    // container) would answer the specs' /health checks in its place, so refuse to start.
    const answers = (host: string) => fetch(`http://${host}:${BACKEND_PORT}/`).then(() => true, () => false);
    if ((await answers('127.0.0.1')) || (await answers('[::1]'))) {
      // SevereServiceError aborts the run; a plain Error in onPrepare is only logged and the specs still start.
      throw new SevereServiceError(`Port ${BACKEND_PORT} is already in use: stop the Langflow running there before the tests`);
    }
    // detached: the app leads its own process group, so onComplete can stop the Python backend it starts too.
    app = spawn(appPath, [], {
      env: { ...process.env, TAURI_WEBDRIVER_PORT: String(DRIVER_PORT) },
      stdio: 'ignore',
      detached: true,
    });
    await waitForHttp(
      `http://127.0.0.1:${DRIVER_PORT}/status`,
      'Langflow Desktop WebDriver server (was the DMG built with enable_webdriver=true?)',
      60_000,
    ).catch((err: Error) => {
      throw new SevereServiceError(err.message);
    });
  },

  onComplete: () => {
    // Killing only the app leaves its backend holding port 7860 for the next run.
    if (!app?.pid) return;
    try {
      process.kill(-app.pid, 'SIGTERM');
    } catch {
      // already gone
    }
  },

  afterTest: async (test, _context, { passed }) => {
    if (passed) return;
    const shotsDir = path.join(outputDir, 'screenshots');
    fs.mkdirSync(shotsDir, { recursive: true });
    const name = `${test.parent} - ${test.title}`.replace(/[^\w.-]+/g, '_');
    await browser.saveScreenshot(path.join(shotsDir, `${name}.png`));
  },
};
