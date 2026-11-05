import { $, browser } from '@wdio/globals';
import Page from '../page.js';

// Profile menu in the header: app version, update status and, in QA builds, the "Update" button.
// langflow-desktop: src/frontend/src/customization/components/custom-AccountMenu.tsx
class AccountMenu extends Page {
  get toggle() { return this.byTestId('user_menu_button'); }
  get versionValue() { return this.byTestId('menu_version_value'); }
  // "Latest" or "Update available", compared with the version in the update manifest.
  get versionStatus() { return this.byTestId('menu_version_status'); }
  // No data-testid on this button (it shows t("nodeToolbar.update")): found by its text until one is added.
  get updateButton() { return $('[role="menu"]').$('//button[normalize-space()="Update"]'); }

  async open() {
    await this.pressWithKeyboard(this.toggle);
    await this.versionValue.waitForDisplayed();
  }

  async close() {
    await browser.keys('Escape');
    await this.versionValue.waitForDisplayed({ reverse: true });
  }

  async startUpdate() {
    await this.clickInPage(this.updateButton);
  }
}

export default new AccountMenu();
