import { $, browser } from '@wdio/globals';

// Base for every Desktop screen. The app has no URLs to open (it shows one screen at a time inside the
// webview), so page objects only hold how to find things and the actions a user takes on them.
// Assertions stay in the specs.
export default class Page {
  protected byTestId(testId: string) {
    return $(`[data-testid="${testId}"]`);
  }

  // For copy without a data-testid (validation messages, toasts).
  byText(text: string) {
    return $(`//*[normalize-space(text())="${text}"]`);
  }

  // Radix triggers (menus, a dialog's submit) react to pointer events that the embedded WebDriver's click
  // does not fire on WKWebView: the element gets focus and nothing else happens. Activate them the way a
  // keyboard user would, which behaves the same on WebView2 and WKWebView.
  protected async pressWithKeyboard(element: ChainablePromiseElement) {
    await element.waitForDisplayed();
    await element.execute((node) => (node as HTMLElement).focus());
    await browser.keys('Enter');
  }

  // An item of an open Radix dropdown menu. Opening the menu moves focus to its first item, so focusing
  // another item from outside doesn't stick: arrow down to it, like a keyboard user, then press Enter.
  protected async chooseMenuItem(testId: string) {
    const focused = () => browser.execute(() => document.activeElement?.getAttribute('data-testid') ?? '');
    await this.byTestId(testId).waitForDisplayed();
    await browser.waitUntil(
      async () => {
        if ((await focused()) === testId) return true;
        await browser.keys('ArrowDown');
        return false;
      },
      { timeout: 5_000, interval: 100, timeoutMsg: `menu item "${testId}" never got focus` },
    );
    await browser.keys('Enter');
  }

  // Runs the element's click handler straight from the page. For a Radix dialog's buttons, where focus +
  // Enter doesn't submit on WKWebView (seen on the export modal).
  protected async clickInPage(element: ChainablePromiseElement) {
    await element.waitForDisplayed();
    await element.execute((node) => (node as HTMLElement).click());
  }
}
