import { execFileSync } from 'node:child_process';
import { appPath, config as macConfig, stopApp } from './wdio.mac.conf.js';

// Upgrade test (macOS): starts on an older QA release built with enable_webdriver=true, installed from
// langflow-ai/desktop-updates, and updates it in-app to the release qa_latest.json points to.
// Run by the "Langflow Desktop Upgrade E2E (macOS)" workflow.

// The update relaunches the app as a new process, outside the process group stopApp kills: find it by
// its executable and stop its group too (the app and the backend it started).
function stopRelaunchedApp() {
  let pids: string[];
  try {
    pids = execFileSync('pgrep', ['-f', appPath!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
  } catch {
    return; // pgrep exits 1 when nothing matches
  }
  for (const pid of pids) {
    try {
      const pgid = Number(execFileSync('ps', ['-o', 'pgid=', '-p', pid], { encoding: 'utf8' }).trim());
      process.kill(-pgid, 'SIGTERM');
    } catch {
      // already gone
    }
  }
}

export const config: WebdriverIO.Config = {
  ...macConfig,
  specs: ['./test/upgrade/**/*.spec.ts'],
  onComplete: () => {
    stopApp();
    stopRelaunchedApp();
  },
};
