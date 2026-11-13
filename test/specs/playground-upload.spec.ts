import { browser, expect } from '@wdio/globals';
import { Timeouts } from '../data/test-data.js';
import PlaygroundPanel from '../pageobjects/components/playground.panel.js';
import FlowPage from '../pageobjects/flow.page.js';
import MainPage from '../pageobjects/main.page.js';
import { createChatEchoFlow, deleteFlow, deleteMessages, type Flow, messagesOfFlow } from '../utils/backend.js';

// Files attached in the Playground chat. Picking and uploading a file is the web app's code; showing it in the
// conversation is the Desktop's: images are read from disk through a Tauri command (read_playground_image), since
// the web app's image URL rejects Playground uploads. That is what breaks when the frontend is synced from
// upstream, so this spec checks a sent image really renders, also after the page is reloaded.
//
// Starts on the main page (after flow-export.spec.ts) and leaves the app there. The its run in order and share
// the flow and its Playground. The flow echoes its input (Chat Input → Chat Output, no model): no API key needed.
// The OS file picker can't be driven: PlaygroundPanel.attach hands the file to the input behind it.
const stamp = Date.now();
// Unique names: the backend renames an upload whose name is already taken ("name (1).png").
const IMAGE = {
  name: `e2e-${stamp}.png`,
  type: 'image/png',
  // A 1×1 PNG.
  base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
};
const PDF = {
  name: `e2e-${stamp}.pdf`,
  type: 'application/pdf',
  base64: Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
  ).toString('base64'),
};
// An empty ZIP archive: a type the chat does not accept.
const ZIP = { name: `e2e-${stamp}.zip`, type: 'application/zip', base64: 'UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==' };

const IMAGE_MESSAGE = 'e2e image';
const PDF_MESSAGE = 'e2e pdf';
const UPLOAD_ERROR = 'Error uploading file';
const UNSUPPORTED_TYPE =
  'Unsupported attachment type. Supported chat attachments include images, PDF, CSV, DOCX, and common text/code files.';

// The name of a stored file: the backend keeps absolute paths, with "\\" on Windows.
const fileName = (filePath: string) => filePath.split(/[\\/]/).pop();

// True once the <img> has loaded real pixels (a failed load leaves naturalWidth at 0).
const imageLoaded = (image: ChainablePromiseElement) =>
  image.execute((node) => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0);

describe('Playground file upload', () => {
  let flow: Flow;

  // The user message with that text, as the backend stored it.
  const sentMessage = async (text: string) =>
    (await messagesOfFlow(flow.id)).find((message) => message.sender === 'User' && message.text === text);

  before(async () => {
    await MainPage.title.waitForDisplayed({ timeout: Timeouts.backendStart });
    flow = await createChatEchoFlow(`E2E Upload ${stamp}`, 'Created by the langflow-desktop-e2e upload test');
    // The main page was rendered before the flow existed: reload so its card shows up.
    await browser.refresh();
    await MainPage.openFlow(flow.id);
    await PlaygroundPanel.open();
  });

  after(async () => {
    await browser.keys('Escape');
    if (await FlowPage.backButton.isDisplayed()) await FlowPage.backToMainPage();
    await MainPage.title.waitForDisplayed();
    if (flow) {
      await deleteMessages((await messagesOfFlow(flow.id)).map((message) => message.id));
      await deleteFlow(flow.id);
    }
  });

  it('sends an attached image and shows it in the conversation, read from disk', async () => {
    await PlaygroundPanel.attach(IMAGE.name, IMAGE.type, IMAGE.base64);
    await expect(PlaygroundPanel.attachedImage(IMAGE.name)).toBeDisplayed();
    await PlaygroundPanel.send(IMAGE_MESSAGE);

    await expect(PlaygroundPanel.userMessage(IMAGE_MESSAGE)).toBeDisplayed();
    const image = PlaygroundPanel.messageImage(IMAGE_MESSAGE, IMAGE.name);
    await expect(image).toBeDisplayed();
    await browser.waitUntil(() => imageLoaded(image), { timeoutMsg: 'the sent image did not load' });

    await browser.waitUntil(async () => (await sentMessage(IMAGE_MESSAGE)) !== undefined, {
      timeoutMsg: 'the message was not saved',
    });
    const files = (await sentMessage(IMAGE_MESSAGE))?.files ?? [];
    expect(files.map(fileName)).toEqual([IMAGE.name]);
  });

  it('sends an attached PDF and shows it as a file with its name', async () => {
    await PlaygroundPanel.attach(PDF.name, PDF.type, PDF.base64);
    await PlaygroundPanel.send(PDF_MESSAGE);

    await expect(PlaygroundPanel.userMessage(PDF_MESSAGE)).toBeDisplayed();
    // Names longer than 10 characters are shortened, keeping the extension: e2e-<stamp>...pdf
    await expect(PlaygroundPanel.messageFileLabel(PDF_MESSAGE, `${PDF.name.slice(0, 10)}...pdf`)).toBeDisplayed();

    await browser.waitUntil(async () => (await sentMessage(PDF_MESSAGE)) !== undefined, {
      timeoutMsg: 'the message was not saved',
    });
    const files = (await sentMessage(PDF_MESSAGE))?.files ?? [];
    expect(files.map(fileName)).toEqual([PDF.name]);
  });

  it('refuses an unsupported file type before uploading it', async () => {
    await PlaygroundPanel.attach(ZIP.name, ZIP.type, ZIP.base64);

    await expect(PlaygroundPanel.byText(UPLOAD_ERROR)).toBeDisplayed();
    await expect(PlaygroundPanel.byText(UNSUPPORTED_TYPE)).toBeDisplayed();
    // Nothing waits in the chat box to be sent.
    await expect(PlaygroundPanel.inputWrapper.$('img')).not.toBeExisting();
    await expect(PlaygroundPanel.inputWrapper.$('button[aria-label="Delete file"]')).not.toBeExisting();
  });

  it('still shows the sent image after the app reloads and the Playground reopens', async () => {
    // A reload drops every image the page already had in memory: the history has to read it from disk again.
    await FlowPage.backToMainPage();
    await MainPage.title.waitForDisplayed();
    await browser.refresh();
    await MainPage.openFlow(flow.id);
    await PlaygroundPanel.open();

    const image = PlaygroundPanel.messageImage(IMAGE_MESSAGE, IMAGE.name);
    await expect(image).toBeDisplayed();
    await browser.waitUntil(() => imageLoaded(image), { timeoutMsg: 'the image in the history did not load' });
  });
});
