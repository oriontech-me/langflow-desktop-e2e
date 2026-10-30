import { $ } from '@wdio/globals';
import Page from '../page.js';

// "Export" modal opened from a flow card's menu (Download). It is a Radix dialog with no test id of its
// own; only the footer's submit has one. Langflow: src/frontend/src/modals/exportModal
class ExportFlowModal extends Page {
  get container() { return $('[role="dialog"]'); }
  // "Save with my API keys", unchecked by default.
  get saveWithApiKeysCheckbox() { return this.container.$('#terms'); }
  get exportButton() { return this.byTestId('modal-export-button'); }

  async export() {
    await this.clickInPage(this.exportButton);
  }
}

export default new ExportFlowModal();
