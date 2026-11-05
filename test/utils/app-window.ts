import { browser } from '@wdio/globals';

const IS_MAC = process.platform === 'darwin';

// Windows: how the session reaches the app's WebView2 through its remote debugging port.
export const DEBUG_PORT = 9222;
// macOS: the WebDriver server embedded in builds made with enable_webdriver=true.
export const WEBDRIVER_PORT = 4445;

// The attached session may start on a non-app target; switch to the window serving the Langflow UI.
export async function switchToAppWindow() {
  for (const handle of await browser.getWindowHandles()) {
    await browser.switchToWindow(handle);
    if (!(await browser.getUrl()).startsWith('about:')) return;
  }
  throw new Error('No WebView2 target is serving the Langflow Desktop UI');
}

// Id of the WebView2 browser process behind the debug port, or undefined while nothing listens there.
// A new id means a new app process: the app has restarted.
async function webviewBrowserId(): Promise<string | undefined> {
  try {
    const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    const { webSocketDebuggerUrl } = (await res.json()) as { webSocketDebuggerUrl?: string };
    return webSocketDebuggerUrl?.split('/').pop();
  } catch {
    return undefined;
  }
}

// Something that changes when the app process is replaced: the WebView2 browser id on Windows, the
// session on macOS (the embedded server, and its sessions, die with the process).
export async function appInstanceId(): Promise<string | undefined> {
  return IS_MAC ? browser.sessionId : webviewBrowserId();
}

async function hasRestarted(previousId: string): Promise<boolean> {
  if (!IS_MAC) {
    const id = await webviewBrowserId();
    return id !== undefined && id !== previousId;
  }
  // The new process serves WebDriver again but no longer knows the old session.
  try {
    const old = await fetch(`http://127.0.0.1:${WEBDRIVER_PORT}/session/${previousId}/url`);
    if (old.ok) return false;
    return (await fetch(`http://127.0.0.1:${WEBDRIVER_PORT}/status`)).ok;
  } catch {
    return false;
  }
}

// After the app restarted by itself (an update), waits for the new process, then attaches a new session
// to it. The old session died with the old process.
export async function reattachAfterRestart(previousId: string, timeout: number) {
  await browser.waitUntil(() => hasRestarted(previousId), {
    timeout,
    interval: 5_000,
    timeoutMsg: IS_MAC
      ? 'the app did not come back after the update (on macOS the QA release must be built with enable_webdriver=true)'
      : 'the app did not come back after the update',
  });
  await browser.reloadSession();
  if (!IS_MAC) await switchToAppWindow();
}
