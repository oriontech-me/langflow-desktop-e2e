import Page from './page.js';

// Terms agreement, the first screen on a clean machine.
// langflow-desktop: src/frontend/src/customization/pages/TermsAgreementPage
class TermsPage extends Page {
  get body() { return this.byTestId('terms-agreement-body'); }
  get copyright() { return this.byTestId('terms-copyright'); }
  get agreeButton() { return this.byTestId('terms-agree-button'); }
  get disagreeButton() { return this.byTestId('terms-disagree-button'); }
  get declinedNotice() { return this.byTestId('terms-declined-notice'); }
  get reviewButton() { return this.byTestId('terms-review-button'); }
  get quitButton() { return this.byTestId('terms-quit-button'); }

  async agree() {
    await this.agreeButton.click();
  }

  async decline() {
    await this.disagreeButton.click();
  }

  async reviewAgain() {
    await this.reviewButton.click();
  }
}

export default new TermsPage();
