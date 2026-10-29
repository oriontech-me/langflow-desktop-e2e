import { $ } from '@wdio/globals';
import ExportFlowModal from './components/export-flow.modal.js';
import Page from './page.js';

// Main page (flow list), once the backend is up.
// langflow-desktop: src/frontend/src/customization/components/custom-empty-page.tsx and the OSS main page.
class MainPage extends Page {
  get title() { return this.byTestId('mainpage_title'); }

  flowCard(flowId: string) {
    return $(`[data-testid="list-card"]:has([data-testid="flow-name-${flowId}"])`);
  }

  async openExportModal(flowId: string) {
    await this.pressWithKeyboard(this.flowCard(flowId).$('[data-testid="home-dropdown-menu"]'));
    await this.pressWithKeyboard(this.byTestId('btn-download-json'));
    await ExportFlowModal.exportButton.waitForDisplayed();
  }
}

export default new MainPage();
