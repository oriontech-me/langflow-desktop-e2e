import { $ } from '@wdio/globals';
import Page from '../page.js';

// "Update" modal opened from the profile menu: "<current> Your version → <latest> Latest" and the
// "Install Update" button, which downloads the update, installs it and restarts the app.
// None of it has a data-testid, so elements are found by their English copy
// (src/frontend/src/customization/locales/en.json, desktop.update.*).
// langflow-desktop: src/frontend/src/customization/components/custom-UpgradeModal.tsx
class UpgradeModal extends Page {
  get container() { return $('[role="dialog"]'); }
  get installButton() { return this.container.$('//button[normalize-space()="Install Update"]'); }
  // The "<version> Your version" pair and the "<version> Latest" pair.
  versionLabel(version: string) {
    return this.container.$(`//span[normalize-space()="${version}"]`);
  }

  async installUpdate() {
    await this.clickInPage(this.installButton);
  }
}

export default new UpgradeModal();
