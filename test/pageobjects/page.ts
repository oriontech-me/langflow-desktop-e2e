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
}
