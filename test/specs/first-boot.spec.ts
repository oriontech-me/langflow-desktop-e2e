import { $, expect } from '@wdio/globals';

// Selectors come from langflow-desktop: src/frontend/src/customization/pages/
// (TermsAgreementPage, EmailRegistrationPage) and components/custom-empty-page.tsx.
const sel = {
  termsBody: '[data-testid="terms-agreement-body"]',
  termsAgree: '[data-testid="terms-agree-button"]',
  registrationCard: '[data-testid="registration-card"]',
  emailInput: '[data-testid="email-input-field"]',
  emailConsent: '[data-testid="telemetry-consent-checkbox"]',
  usageConsent: '[data-testid="usage-consent-checkbox"]',
  continue: '[data-testid="continue-button"]',
  mainPageTitle: '[data-testid="mainpage_title"]',
};

// Placeholder domain: the registration must never reach a real inbox.
const E2E_EMAIL = 'langflow-desktop-e2e@example.com';

// Waiting for the dashboard covers the uv/Python/Langflow install on a clean machine.
const BACKEND_READY_TIMEOUT = 10 * 60_000;

async function uncheck(selector: string) {
  const box = $(selector);
  if (!(await box.isExisting())) return;
  if ((await box.getAttribute('data-state')) === 'checked') await box.click();
}

describe('First boot on a clean machine @smoke', () => {
  it('shows the terms agreement and accepts it', async () => {
    await expect($(sel.termsBody)).toBeDisplayed();
    await $(sel.termsAgree).click();
  });

  it('registers with an email without sharing data', async () => {
    await expect($(sel.registrationCard)).toBeDisplayed();
    await $(sel.emailInput).setValue(E2E_EMAIL);
    // CI runs must not send telemetry or share the test email.
    await uncheck(sel.emailConsent);
    await uncheck(sel.usageConsent);
    await $(sel.continue).click();
  });

  it('starts the backend and lands on the main page', async () => {
    await $(sel.mainPageTitle).waitForDisplayed({ timeout: BACKEND_READY_TIMEOUT });

    // The runner shares the machine with the app, so hit the backend directly (no webview CORS).
    const health = await fetch('http://localhost:7860/health');
    expect(health.status).toBe(200);
  });
});
