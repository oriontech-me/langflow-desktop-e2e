import fs from 'node:fs';
import path from 'node:path';

// Settings both platforms share. wdio.conf.ts (Windows) and wdio.mac.conf.ts (macOS) add how the app is
// launched and how WebdriverIO reaches its webview.
export const outputDir = path.resolve('./test-results');

export async function waitForHttp(url: string, what: string, timeoutMs: number) {
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

export const sharedConfig: Omit<WebdriverIO.Config, 'capabilities'> = {
  runner: 'local',
  specs: ['./test/specs/**/*.spec.ts'],
  // One app instance shared by all specs: the backend binds the fixed port 7860.
  maxInstances: 1,

  hostname: '127.0.0.1',
  logLevel: 'info',
  outputDir: path.join(outputDir, 'logs'),
  waitforTimeout: 30_000,
  connectionRetryCount: 0,

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
