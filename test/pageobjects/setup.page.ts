import { browser } from '@wdio/globals';
import MainPage from './main.page.js';
import Page from './page.js';

// Loading screen shown while the Desktop installs uv/Python/Langflow and starts the backend.
// It has no test ids: each stage ("Checking Environment…", "Loading Components…") is the first line of text.
class SetupPage extends Page {
  async currentStage(): Promise<string> {
    // innerText skips the hidden <noscript> fallback, which WebKit's getText returns as the first line.
    const text = await browser.execute(() => document.body.innerText);
    return text.trim().split('\n')[0] ?? '';
  }

  // Waits for the main page, logging each stage as it changes so a slow or stuck install shows where it stopped.
  async waitForMainPage(timeout: number) {
    const started = Date.now();
    let lastStage = '';
    await browser.waitUntil(
      async () => {
        if (await MainPage.title.isDisplayed()) return true;
        const stage = await this.currentStage();
        if (stage !== lastStage) {
          console.log(`[setup +${Math.round((Date.now() - started) / 1000)}s] ${stage}`);
          lastStage = stage;
        }
        return false;
      },
      { timeout, interval: 5_000, timeoutMsg: `main page not shown; last stage: "${lastStage}"` },
    );
  }
}

export default new SetupPage();
