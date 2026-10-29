import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { start as startEdgeDriver } from 'edgedriver';
import { sharedConfig, waitForHttp } from './wdio.shared.conf.js';

// Path to the installed "Langflow .exe". CI resolves it after installing the MSI
// (see scripts/install-langflow-desktop.ps1); locally, export it yourself.
const appPath = process.env.LANGFLOW_DESKTOP_EXE;
if (!appPath || !fs.existsSync(appPath)) {
  throw new Error(
    `LANGFLOW_DESKTOP_EXE must point to the installed Langflow Desktop executable (got: ${appPath ?? '<unset>'})`,
  );
}

const DEBUG_PORT = 9222;
const DRIVER_PORT = 9515;

// We launch the app ourselves with WebView2 remote debugging on and let msedgedriver attach to it
// (debuggerAddress) instead of letting msedgedriver/tauri-driver launch it. WebView2 ignores
// WEBVIEW2_* env vars in elevated processes, and GitHub's Windows runners run everything elevated,
// so on CI the port comes from the HKLM AdditionalBrowserArguments policy (see the workflow).
// The env var below covers non-elevated local runs.
let app: ChildProcess | undefined;
let driver: ChildProcess | undefined;

function webview2Version(): string | undefined {
  try {
    const out = execFileSync(
      'reg',
      ['query', 'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', '/v', 'pv'],
      { encoding: 'utf8' },
    );
    return out.match(/pv\s+REG_SZ\s+(\S+)/)?.[1];
  } catch {
    return undefined;
  }
}

function killTree(pid: number | undefined) {
  if (!pid) return;
  try {
    execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  } catch {
    // already gone
  }
}

export const config: WebdriverIO.Config = {
  ...sharedConfig,
  port: DRIVER_PORT,
  capabilities: [
    {
      browserName: 'webview2',
      'ms:edgeOptions': { debuggerAddress: `127.0.0.1:${DEBUG_PORT}` },
      // When attaching, msedgedriver's BiDi mapper only exposes its own about:blank tab, never the app page.
      'wdio:enforceWebDriverClassic': true,
    },
  ],

  onPrepare: async () => {
    const version = webview2Version();
    driver = await startEdgeDriver({ port: DRIVER_PORT, edgeDriverVersion: version, cacheDir: path.resolve('.cache') });
    await waitForHttp(`http://127.0.0.1:${DRIVER_PORT}/status`, `msedgedriver ${version ?? ''}`, 30_000);

    app = spawn(appPath, [], {
      env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${DEBUG_PORT}` },
      stdio: 'ignore',
    });
    await waitForHttp(`http://127.0.0.1:${DEBUG_PORT}/json/version`, 'Langflow Desktop WebView2 debug port', 60_000);
  },

  // The attached session may start on a non-app target; switch to the window serving the Langflow UI.
  before: async () => {
    for (const handle of await browser.getWindowHandles()) {
      await browser.switchToWindow(handle);
      if (!(await browser.getUrl()).startsWith('about:')) return;
    }
    throw new Error('No WebView2 target is serving the Langflow Desktop UI');
  },

  onComplete: () => {
    killTree(app?.pid);
    killTree(driver?.pid);
  },
};
