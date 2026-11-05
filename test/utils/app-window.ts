import { browser } from '@wdio/globals';

// Windows only: how the session reaches the app's WebView2 through its remote debugging port.
export const DEBUG_PORT = 9222;

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
export async function webviewBrowserId(): Promise<string | undefined> {
  try {
    const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    const { webSocketDebuggerUrl } = (await res.json()) as { webSocketDebuggerUrl?: string };
    return webSocketDebuggerUrl?.split('/').pop();
  } catch {
    return undefined;
  }
}

// After the app restarted by itself (an update), waits for the new process to open its debug port,
// then attaches a new session to it. The old session died with the old process.
export async function reattachAfterRestart(previousBrowserId: string, timeout: number) {
  await browser.waitUntil(
    async () => {
      const id = await webviewBrowserId();
      return id !== undefined && id !== previousBrowserId;
    },
    { timeout, interval: 5_000, timeoutMsg: 'the app did not come back after the update' },
  );
  await browser.reloadSession();
  await switchToAppWindow();
}
