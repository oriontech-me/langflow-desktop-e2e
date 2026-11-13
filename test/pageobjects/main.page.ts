import { $, $$ } from '@wdio/globals';
import ExportFlowModal from './components/export-flow.modal.js';
import Page from './page.js';

// Main page (flow list), once the backend is up.
// langflow-desktop: src/frontend/src/customization/components/custom-empty-page.tsx and the OSS main page.
class MainPage extends Page {
  get title() { return this.byTestId('mainpage_title'); }

  flowCard(flowId: string) {
    return $(`[data-testid="list-card"]:has([data-testid="flow-name-${flowId}"])`);
  }

  // Sidebar footer entry to Evals (Datasets | Evaluations), only with LANGFLOW_FEATURE_EVALS.
  // langflow-desktop: src/frontend/src/components/core/folderSidebarComponent/components/sideBarFolderButtons
  get evaluationsEntry() { return this.byTestId('sidebar-evaluations'); }
  get evaluationsEntries() { return $$('[data-testid="sidebar-evaluations"]'); }

  // A project in the sidebar: opens its flow list, which is this page.
  project(folderId: string) { return this.byTestId(`sidebar-nav-${folderId}`); }

  async openEvaluations() {
    await this.clickInPage(this.evaluationsEntry);
  }

  async openProject(folderId: string) {
    await this.clickInPage(this.project(folderId));
    await this.title.waitForDisplayed();
  }

  // Opens the flow in the editor.
  async openFlow(flowId: string) {
    await this.clickInPage(this.flowCard(flowId).$(`[data-testid="flow-name-${flowId}"]`));
  }

  async openExportModal(flowId: string) {
    await this.pressWithKeyboard(this.flowCard(flowId).$('[data-testid="home-dropdown-menu"]'));
    await this.chooseMenuItem('btn-download-json');
    await ExportFlowModal.exportButton.waitForDisplayed();
  }
}

export default new MainPage();
