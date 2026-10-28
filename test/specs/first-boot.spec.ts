import { $, browser, expect } from '@wdio/globals';

// First launch on a clean machine: Terms → email registration → backend install → main page.
// The steps share one app instance and run in order; each `it` starts where the previous one ended.
// Selectors and copy come from langflow-desktop: src/frontend/src/customization/pages/
// (TermsAgreementPage, EmailRegistrationPage) and customization/components/custom-empty-page.tsx.
const sel = {
  termsBody: '[data-testid="terms-agreement-body"]',
  termsCopyright: '[data-testid="terms-copyright"]',
  termsAgree: '[data-testid="terms-agree-button"]',
  termsDisagree: '[data-testid="terms-disagree-button"]',
  termsDeclinedNotice: '[data-testid="terms-declined-notice"]',
  termsReview: '[data-testid="terms-review-button"]',
  termsQuit: '[data-testid="terms-quit-button"]',
  registrationCard: '[data-testid="registration-card"]',
  emailPurpose: '[data-testid="email-purpose"]',
  emailInput: '[data-testid="email-input-field"]',
  emailConsent: '[data-testid="telemetry-consent-checkbox"]',
  usageConsent: '[data-testid="usage-consent-checkbox"]',
  continue: '[data-testid="continue-button"]',
  mainPageTitle: '[data-testid="mainpage_title"]',
};

const COPYRIGHT = '© Copyright IBM Corp. 2025, 2026';
const MSG_EMAIL_MISSING = 'Enter your email address';
const MSG_EMAIL_INVALID = 'Enter a valid email address';

// Placeholder domain: the registration must never reach a real inbox.
const E2E_EMAIL = 'langflow-desktop-e2e@example.com';

// Waiting for the main page covers the uv/Python/Langflow install on a clean machine (~7 min on a runner).
const BACKEND_READY_TIMEOUT = 15 * 60_000;

const byText = (text: string) => $(`//*[normalize-space(text())="${text}"]`);

async function backendStatus(): Promise<number> {
  try {
    return (await fetch('http://localhost:7860/health')).status;
  } catch {
    return -1;
  }
}

describe('First boot on a clean machine @smoke', () => {
  describe('Terms agreement', () => {
    it('shows the terms text and the IBM copyright', async () => {
      await expect($(sel.termsBody)).toBeDisplayed();
      await expect($(sel.termsBody)).not.toHaveText('');
      await expect($(sel.termsCopyright)).toHaveText(COPYRIGHT);
      await expect($(sel.termsAgree)).toBeEnabled();
    });

    it('declining keeps the app open, without access, and installs nothing', async () => {
      await $(sel.termsDisagree).click();

      await expect($(sel.termsDeclinedNotice)).toBeDisplayed();
      await expect($(sel.termsBody)).not.toBeExisting();
      await expect($(sel.termsAgree)).not.toBeExisting();
      await expect($(sel.termsQuit)).toBeDisplayed();
      await expect($(sel.termsReview)).toBeDisplayed();
      expect(await backendStatus()).toBe(-1);
    });

    it('reviewing the terms again brings back the text and the Agree button', async () => {
      await $(sel.termsReview).click();

      await expect($(sel.termsBody)).toBeDisplayed();
      await expect($(sel.termsDeclinedNotice)).not.toBeExisting();
      await expect($(sel.termsAgree)).toBeEnabled();
    });

    it('agreeing moves on to the email registration', async () => {
      await $(sel.termsAgree).click();

      await expect($(sel.registrationCard)).toBeDisplayed();
    });
  });

  describe('Email registration', () => {
    it('explains what the email is for and leaves both data-sharing consents unchecked', async () => {
      await expect($(sel.emailPurpose)).toHaveText(/does not create an account/);
      await expect($(sel.emailConsent)).toHaveAttribute('data-state', 'unchecked');
      await expect($(sel.usageConsent)).toHaveAttribute('data-state', 'unchecked');
    });

    it('requires an email address', async () => {
      await $(sel.continue).click();

      await expect(byText(MSG_EMAIL_MISSING)).toBeDisplayed();
      await expect($(sel.registrationCard)).toBeDisplayed();
    });

    it('rejects an invalid email address', async () => {
      await $(sel.emailInput).setValue('not-an-email');
      await $(sel.continue).click();

      await expect(byText(MSG_EMAIL_INVALID)).toBeDisplayed();
      await expect($(sel.registrationCard)).toBeDisplayed();
    });

    it('accepts a valid email without sharing data and starts the setup', async () => {
      await $(sel.emailInput).setValue(E2E_EMAIL);
      await $(sel.continue).click();

      await expect($(sel.registrationCard)).not.toBeDisplayed();
    });
  });

  describe('Setup and first start', () => {
    it('installs and starts the backend, then lands on the main page', async () => {
      // Log each loading-screen stage as it changes, so a slow or stuck install shows where it stopped.
      const started = Date.now();
      let lastStage = '';
      await browser.waitUntil(
        async () => {
          if (await $(sel.mainPageTitle).isDisplayed()) return true;
          // innerText skips the hidden <noscript> fallback, which WebKit's getText returns as the first line.
          const text = await browser.execute(() => document.body.innerText);
          const stage = text.trim().split('\n')[0] ?? '';
          if (stage !== lastStage) {
            console.log(`[setup +${Math.round((Date.now() - started) / 1000)}s] ${stage}`);
            lastStage = stage;
          }
          return false;
        },
        { timeout: BACKEND_READY_TIMEOUT, interval: 5_000, timeoutMsg: `main page not shown; last stage: "${lastStage}"` },
      );
      expect(await backendStatus()).toBe(200);
    });
  });
});
