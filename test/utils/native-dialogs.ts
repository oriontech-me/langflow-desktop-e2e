import { browser } from '@wdio/globals';

// The OS "Save as" panel (NSSavePanel, Windows file dialog) opens outside the webview, where WebDriver
// can't see or answer it. Instead of opening it, answer the page's request for it.
//
// The page asks Tauri for the panel through the dialog plugin, and Tauri v2 carries every such request as a
// fetch to its IPC protocol (ipc://localhost/<cmd> on macOS, http://ipc.localhost/<cmd> on Windows).
// __TAURI_INTERNALS__ is frozen, but it calls the page's fetch, which can be wrapped: the wrapper replies to
// "plugin:dialog|save" with savePath, as if the user had picked it, and passes every other request through.
// The app then writes the file itself (plugin:fs|write_text_file), so the test still checks the real write.
//
// Lasts until the page reloads: call it after any browser.refresh().
export async function answerSaveDialogWith(savePath: string) {
  await browser.execute((answer: string) => {
    const w = window as Window & { __e2eSaveDialog?: string };
    if (w.__e2eSaveDialog === undefined) {
      const pageFetch = window.fetch.bind(window);
      window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        const isIpc = /^(ipc:\/\/localhost|https?:\/\/ipc\.localhost)\//.test(url);
        if (isIpc && decodeURIComponent(url.split('/').pop() ?? '') === 'plugin:dialog|save') {
          return Promise.resolve(
            new Response(JSON.stringify(w.__e2eSaveDialog), {
              headers: { 'Content-Type': 'application/json', 'Tauri-Response': 'ok' },
            }),
          );
        }
        return pageFetch(input, init);
      };
    }
    w.__e2eSaveDialog = answer;
  }, savePath);
}
