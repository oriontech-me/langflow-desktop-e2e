import { $, browser } from '@wdio/globals';
import Page from '../page.js';

// Playground: the chat panel that slides in over the canvas (toolbar "Playground" toggles it).
// Langflow: src/frontend/src/components/core/playgroundComponent (chat-view). The Desktop replaces how a message's
// files are shown (langflow-desktop: src/frontend/src/customization/utils/custom-file-preview-display-override.tsx,
// swapped in by vite.config.mts): images are read from disk through the Tauri command read_playground_image
// instead of over HTTP, and a file that is not an image, or an image that fails to load, shows as an icon
// with its (shortened) name.
class PlaygroundPanel extends Page {
  get toggleButton() { return this.byTestId('playground-btn-flow-io'); }
  get input() { return this.byTestId('input-chat-playground'); }
  get sendButton() { return this.byTestId('button-send'); }
  get inputWrapper() { return this.byTestId('input-wrapper'); }

  // An attachment waiting in the input box, by file name (images show as <img alt="<name>">).
  attachedImage(name: string) { return this.inputWrapper.$(`img[alt="${name}"]`); }

  // A sent message of the user, by its text.
  userMessage(text: string) { return this.byTestId(`chat-message-User-${text}`); }
  // The files shown under that message.
  private messageFiles(text: string) {
    return $(`//*[@data-testid="chat-message-User-${text}"]/following-sibling::div`);
  }
  messageImage(text: string, name: string) { return this.messageFiles(text).$(`img[alt="${name}"]`); }
  messageFileLabel(text: string, label: string) {
    return this.messageFiles(text).$(`.//span[normalize-space(text())="${label}"]`);
  }

  async open() {
    await this.clickInPage(this.toggleButton);
    await this.input.waitForDisplayed();
  }

  // The "attach" button opens the OS file picker, which WebDriver can't drive. Hand the file to the
  // input behind it instead, as the picker would: the app then validates and uploads it as usual.
  async attach(name: string, mimeType: string, base64: string) {
    await this.inputWrapper.waitForDisplayed();
    await browser.execute(
      (fileName: string, type: string, data: string) => {
        const input = document.querySelector<HTMLInputElement>('[data-testid="input-wrapper"] input[type="file"]');
        if (!input) throw new Error('no file input in the Playground chat box');
        const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
        const transfer = new DataTransfer();
        transfer.items.add(new File([bytes], fileName, { type }));
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      },
      name,
      mimeType,
      base64,
    );
  }

  // The send button waits for the attachments to finish uploading.
  async send(text: string) {
    await this.input.setValue(text);
    await this.sendButton.waitForEnabled();
    await this.clickInPage(this.sendButton);
  }
}

export default new PlaygroundPanel();
