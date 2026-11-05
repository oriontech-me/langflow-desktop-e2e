import { browser, expect } from '@wdio/globals';
import { E2E_EMAIL, Timeouts } from '../data/test-data.js';
import AccountMenu from '../pageobjects/components/account.menu.js';
import UpgradeModal from '../pageobjects/components/upgrade.modal.js';
import MainPage from '../pageobjects/main.page.js';
import RegistrationPage from '../pageobjects/registration.page.js';
import SetupPage from '../pageobjects/setup.page.js';
import TermsPage from '../pageobjects/terms.page.js';
import { appInstanceId, reattachAfterRestart } from '../utils/app-window.js';
import { backendStatus } from '../utils/backend.js';
import {
  apiKeyStatus,
  createUpgradeData,
  deleteUpgradeData,
  downloadFile,
  getFlow,
  getMcpServer,
  getMemoryBase,
  getProject,
  listFlowVersions,
  listKnowledgeBases,
  listSessionMessages,
  listVariables,
  runChatFlow,
  type UpgradeData,
} from '../utils/upgrade-data.js';

// Upgrade from an older QA release to the current one, the way a QA user does it: first boot on the old
// version, create data, "Update" in the profile menu, then check the data on the new version.
// Starts on a clean machine (Windows or macOS) with UPGRADE_FROM_VERSION installed from
// langflow-ai/desktop-updates (qa-releases/v<version>). On macOS both releases must be built with
// enable_webdriver=true. QA builds read their updates from qa_latest.json, so the version updated to is
// whatever that manifest names when the test runs, not a Build Unsigned run.
// The steps share one app and run in order. The app restarts itself during the update; the test then
// attaches a new session to the new process.
// The regular first boot (terms, registration, setup) is covered by first-boot.spec.ts; here it is only
// the way to an app that has data.
const QA_MANIFEST = 'https://raw.githubusercontent.com/langflow-ai/desktop-updates/RELEASE/qa_latest.json';
// Desktop copy (customization/locales/en.json), not the OSS "(latest)" / "(update available)".
const STATUS_UPDATE_AVAILABLE = 'Update available';
const STATUS_LATEST = 'Latest';

const FROM_VERSION = process.env.UPGRADE_FROM_VERSION ?? '';

function isOlder(a: string, b: string) {
  const [pa, pb] = [a, b].map((v) => v.split('.').map(Number));
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] < pb[i];
  return false;
}

// After the update the app may ask again for what it asks on a first boot: the terms, when their text
// changed between versions (the acceptance is stored with a hash of the text), and the registration.
// Answers whichever shows up and returns the screens it had to answer.
async function reachMainPageAfterUpdate(): Promise<string[]> {
  const answered: string[] = [];
  const started = Date.now();
  let lastStage = '';
  await browser.waitUntil(
    async () => {
      if (await MainPage.title.isDisplayed()) return true;
      if (await TermsPage.agreeButton.isDisplayed()) {
        await TermsPage.agree();
        answered.push('terms');
      } else if (await RegistrationPage.card.isDisplayed()) {
        await RegistrationPage.submit(E2E_EMAIL);
        answered.push('registration');
      } else {
        const stage = await SetupPage.currentStage();
        if (stage !== lastStage) {
          console.log(`[after update +${Math.round((Date.now() - started) / 1000)}s] ${stage}`);
          lastStage = stage;
        }
      }
      return false;
    },
    { timeout: Timeouts.firstBootInstall, interval: 5_000, timeoutMsg: `main page not shown; last stage: "${lastStage}"` },
  );
  return answered;
}

describe('Upgrade from a previous QA release @upgrade', () => {
  let targetVersion: string;
  let data: UpgradeData | undefined;
  // The data checks only make sense if the creation step passed.
  const seeded = () => {
    if (!data) throw new Error('no data was created on the old version');
    return data;
  };

  before(async () => {
    if (!FROM_VERSION) throw new Error('UPGRADE_FROM_VERSION must name the installed QA release (e.g. 1.12.2)');
    const manifest = await fetch(`${QA_MANIFEST}?t=${Date.now()}`);
    if (!manifest.ok) throw new Error(`${QA_MANIFEST}: HTTP ${manifest.status}`);
    targetVersion = ((await manifest.json()) as { version: string }).version;
    if (!isOlder(FROM_VERSION, targetVersion)) {
      throw new Error(`Nothing to update: ${FROM_VERSION} is not older than the QA release ${targetVersion}`);
    }
    console.log(`Upgrading ${FROM_VERSION} → ${targetVersion}`);
  });

  after(async () => {
    if (data && (await backendStatus()) === 200) await deleteUpgradeData(data);
  });

  describe('On the old version', () => {
    it('finishes the first boot and lands on the main page', async () => {
      await expect(TermsPage.agreeButton).toBeEnabled();
      await TermsPage.agree();
      await expect(RegistrationPage.card).toBeDisplayed();
      await RegistrationPage.submit(E2E_EMAIL);
      await SetupPage.waitForMainPage(Timeouts.firstBootInstall);

      await expect(MainPage.title).toBeDisplayed();
    });

    it('stores projects, flows, a flow version, variables, a file, an API key, knowledge and memory bases, an MCP server and chat history', async () => {
      // Every call checks its HTTP status; the chat flow is run once so its messages are stored.
      data = await createUpgradeData();
    });

    it('shows its own version and offers the QA release as an update', async () => {
      await AccountMenu.open();
      await expect(AccountMenu.versionValue).toHaveText(FROM_VERSION);
      await expect(AccountMenu.versionStatus).toHaveText(STATUS_UPDATE_AVAILABLE);

      await AccountMenu.startUpdate();
      await expect(UpgradeModal.versionLabel(FROM_VERSION)).toBeDisplayed();
      await expect(UpgradeModal.versionLabel(targetVersion)).toBeDisplayed();
    });
  });

  describe('Update', () => {
    it('installs the update and restarts the app by itself', async () => {
      const oldInstance = await appInstanceId();
      if (!oldInstance) throw new Error('the app cannot be reached before the update');

      await UpgradeModal.installUpdate();

      // update_app stops the backend before downloading; the old process then exits for the installer.
      await reattachAfterRestart(oldInstance, Timeouts.updateInstall);
    });

    it('reaches the main page with the backend up, asking again only for what changed', async () => {
      const answered = await reachMainPageAfterUpdate();
      console.log(`Screens answered again after the update: ${answered.join(', ') || 'none'}`);

      await expect(MainPage.title).toBeDisplayed();
      expect(await backendStatus()).toBe(200);
    });

    it('runs the QA release, marked as the latest version', async () => {
      await AccountMenu.open();
      await expect(AccountMenu.versionValue).toHaveText(targetVersion);
      await expect(AccountMenu.versionStatus).toHaveText(STATUS_LATEST);
      await AccountMenu.close();
    });
  });

  describe('Data after the update', () => {
    it('keeps the project, with its flow', async () => {
      const { project, projectFlow } = seeded();
      const found = await getProject(project.id);
      expect(found.name).toBe(project.name);
      expect(found.description).toBe(project.description);
      expect((found.flows ?? []).map((f) => f.id)).toContain(projectFlow.id);
    });

    it('keeps the chat flow, with the same components and connection', async () => {
      const { chatFlow } = seeded();
      const found = await getFlow(chatFlow.id);
      expect(found.name).toBe(chatFlow.name);
      expect(found.data.nodes.map((n) => n.id).sort()).toEqual([...chatFlow.nodeIds].sort());
      expect(found.data.edges).toHaveLength(chatFlow.edgeCount);
    });

    it('keeps the flow version history', async () => {
      const { chatFlow, flowVersion } = seeded();
      const { entries } = await listFlowVersions(chatFlow.id);
      expect(entries.find((v) => v.id === flowVersion.id)?.description).toBe(flowVersion.description);
    });

    it('keeps both global variables, the credential still hidden', async () => {
      const { genericVariable, credentialVariable } = seeded();
      const variables = await listVariables();
      const generic = variables.find((v) => v.id === genericVariable.id);
      const credential = variables.find((v) => v.id === credentialVariable.id);
      expect(generic).toMatchObject({ name: genericVariable.name, type: 'Generic', value: genericVariable.value });
      expect(credential).toMatchObject({ name: credentialVariable.name, type: 'Credential' });
      // The API never returns a credential's value; a migration must not start leaking it.
      expect(credential?.value ?? null).toBeNull();
    });

    it('keeps the uploaded file and its content', async () => {
      const { file } = seeded();
      expect(await downloadFile(file.id)).toBe(file.content);
    });

    it('still accepts the API key created on the old version', async () => {
      expect(await apiKeyStatus(seeded().apiKey.key)).toBe(200);
    });

    it('keeps the knowledge base and its embedding model', async () => {
      const { knowledgeBase } = seeded();
      const found = (await listKnowledgeBases()).find((kb) => kb.id === knowledgeBase.id);
      expect(found).toMatchObject({
        name: knowledgeBase.name,
        embedding_provider: knowledgeBase.embeddingProvider,
        embedding_model: knowledgeBase.embeddingModel,
      });
    });

    it('keeps the memory base, still linked to its flow', async () => {
      const { memoryBase } = seeded();
      expect(await getMemoryBase(memoryBase.id)).toMatchObject({
        name: memoryBase.name,
        flow_id: memoryBase.flowId,
        embedding_model: memoryBase.embeddingModel,
      });
    });

    it('keeps the MCP server configuration', async () => {
      const { mcpServer } = seeded();
      expect(await getMcpServer(mcpServer.name)).toMatchObject({ command: mcpServer.command, args: mcpServer.args });
    });

    it('keeps the chat history of the session', async () => {
      const { chatFlow, chat } = seeded();
      const messages = await listSessionMessages(chatFlow.id, chat.sessionId);
      expect(messages.map((m) => [m.sender, m.text])).toEqual([
        ['User', chat.input],
        ['Machine', chat.input],
      ]);
    });
  });

  describe('Using the app after the update', () => {
    it('shows the chat flow on the main page', async () => {
      const { chatFlow } = seeded();
      await browser.refresh();
      await expect(MainPage.flowCard(chatFlow.id)).toBeDisplayed();
    });

    it('runs the migrated flow, adding to the same chat session', async () => {
      const { chatFlow, chat, apiKey } = seeded();
      const input = 'Hello after the upgrade';
      expect(await runChatFlow(chatFlow.id, input, chat.sessionId, apiKey.key)).toBe(input);

      const messages = await listSessionMessages(chatFlow.id, chat.sessionId);
      expect(messages.map((m) => m.text)).toEqual([chat.input, chat.input, input, input]);
    });
  });
});
