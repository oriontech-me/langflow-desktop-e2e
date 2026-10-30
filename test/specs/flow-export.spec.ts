import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { browser, expect } from '@wdio/globals';
import { Timeouts } from '../data/test-data.js';
import ExportFlowModal from '../pageobjects/components/export-flow.modal.js';
import MainPage from '../pageobjects/main.page.js';
import { createFlow, deleteFlow, type Flow } from '../utils/backend.js';
import { answerSaveDialogWith } from '../utils/native-dialogs.js';

// Exports a flow from its card on the main page and checks the JSON the app writes to disk.
// Needs a machine past the first boot: after first-boot.spec.ts (specs run in file-name order and share
// one app instance), or on its own (--spec) against an already set-up app, which then starts its backend.
// The app asks where to save through the native "Save as" panel; answerSaveDialogWith answers it with a
// path in Downloads, and the app writes the file there itself.
describe('Flow export', () => {
  const description = 'Created by the langflow-desktop-e2e export test';
  let flow: Flow;
  let exportPath: string;

  before(async () => {
    await MainPage.title.waitForDisplayed({ timeout: Timeouts.backendStart });
    flow = await createFlow(`E2E Export ${Date.now()}`, description);
    exportPath = path.join(os.homedir(), 'Downloads', `${flow.name}.json`);
    fs.mkdirSync(path.dirname(exportPath), { recursive: true });

    // The main page was rendered before the flow existed: reload so its card shows up.
    await browser.refresh();
    await expect(MainPage.flowCard(flow.id)).toBeDisplayed();
    await answerSaveDialogWith(exportPath);
  });

  after(async () => {
    if (exportPath) fs.rmSync(exportPath, { force: true });
    if (flow) await deleteFlow(flow.id);
  });

  it('exports the flow from its card as a JSON file with the flow data', async () => {
    await MainPage.openExportModal(flow.id);
    await expect(ExportFlowModal.saveWithApiKeysCheckbox).toHaveAttribute('data-state', 'unchecked');
    await ExportFlowModal.export();

    await expect(MainPage.byText(`${flow.name} exported successfully`)).toBeDisplayed();
    await browser.waitUntil(() => fs.existsSync(exportPath), {
      timeout: 10_000,
      timeoutMsg: `export not written to ${exportPath}`,
    });
    const exported = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
    expect(exported.id).toBe(flow.id);
    expect(exported.name).toBe(flow.name);
    expect(exported.description).toBe(description);
    expect(exported.data).toEqual(expect.objectContaining({ nodes: [], edges: [] }));
  });
});
