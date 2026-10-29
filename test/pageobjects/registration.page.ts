import Page from './page.js';

// Email registration, shown after the terms are accepted.
// langflow-desktop: src/frontend/src/customization/pages/EmailRegistrationPage
class RegistrationPage extends Page {
  get card() { return this.byTestId('registration-card'); }
  get emailPurpose() { return this.byTestId('email-purpose'); }
  get emailInput() { return this.byTestId('email-input-field'); }
  get emailConsent() { return this.byTestId('telemetry-consent-checkbox'); }
  get usageConsent() { return this.byTestId('usage-consent-checkbox'); }
  get continueButton() { return this.byTestId('continue-button'); }

  async submit(email?: string) {
    if (email !== undefined) await this.emailInput.setValue(email);
    await this.continueButton.click();
  }
}

export default new RegistrationPage();
