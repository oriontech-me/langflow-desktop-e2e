import { expect } from '@wdio/globals';
import { E2E_EMAIL, Timeouts } from '../data/test-data.js';
import MainPage from '../pageobjects/main.page.js';
import RegistrationPage from '../pageobjects/registration.page.js';
import SetupPage from '../pageobjects/setup.page.js';
import TermsPage from '../pageobjects/terms.page.js';
import { backendStatus } from '../utils/backend.js';

// First launch on a clean machine: Terms → email registration → backend install → main page.
// The steps share one app instance and run in order; each `it` starts where the previous one ended.
const COPYRIGHT = '© Copyright IBM Corp. 2025, 2026';
const MSG_EMAIL_MISSING = 'Enter your email address';
const MSG_EMAIL_INVALID = 'Enter a valid email address';

describe('First boot on a clean machine @smoke', () => {
  describe('Terms agreement', () => {
    it('shows the terms text and the IBM copyright', async () => {
      await expect(TermsPage.body).toBeDisplayed();
      await expect(TermsPage.body).not.toHaveText('');
      await expect(TermsPage.copyright).toHaveText(COPYRIGHT);
      await expect(TermsPage.agreeButton).toBeEnabled();
    });

    it('declining keeps the app open, without access, and installs nothing', async () => {
      await TermsPage.decline();

      await expect(TermsPage.declinedNotice).toBeDisplayed();
      await expect(TermsPage.body).not.toBeExisting();
      await expect(TermsPage.agreeButton).not.toBeExisting();
      await expect(TermsPage.quitButton).toBeDisplayed();
      await expect(TermsPage.reviewButton).toBeDisplayed();
      expect(await backendStatus()).toBe(-1);
    });

    it('reviewing the terms again brings back the text and the Agree button', async () => {
      await TermsPage.reviewAgain();

      await expect(TermsPage.body).toBeDisplayed();
      await expect(TermsPage.declinedNotice).not.toBeExisting();
      await expect(TermsPage.agreeButton).toBeEnabled();
    });

    it('agreeing moves on to the email registration', async () => {
      await TermsPage.agree();

      await expect(RegistrationPage.card).toBeDisplayed();
    });
  });

  describe('Email registration', () => {
    it('explains what the email is for and leaves both data-sharing consents unchecked', async () => {
      await expect(RegistrationPage.emailPurpose).toHaveText(/does not create an account/);
      await expect(RegistrationPage.emailConsent).toHaveAttribute('data-state', 'unchecked');
      await expect(RegistrationPage.usageConsent).toHaveAttribute('data-state', 'unchecked');
    });

    it('requires an email address', async () => {
      await RegistrationPage.submit();

      await expect(RegistrationPage.byText(MSG_EMAIL_MISSING)).toBeDisplayed();
      await expect(RegistrationPage.card).toBeDisplayed();
    });

    it('rejects an invalid email address', async () => {
      await RegistrationPage.submit('not-an-email');

      await expect(RegistrationPage.byText(MSG_EMAIL_INVALID)).toBeDisplayed();
      await expect(RegistrationPage.card).toBeDisplayed();
    });

    it('accepts a valid email without sharing data and starts the setup', async () => {
      await RegistrationPage.submit(E2E_EMAIL);

      await expect(RegistrationPage.card).not.toBeDisplayed();
    });
  });

  describe('Setup and first start', () => {
    it('installs and starts the backend, then lands on the main page', async () => {
      await SetupPage.waitForMainPage(Timeouts.firstBootInstall);

      await expect(MainPage.title).toBeDisplayed();
      expect(await backendStatus()).toBe(200);
    });
  });
});
