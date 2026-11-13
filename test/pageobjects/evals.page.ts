import { $, $$ } from '@wdio/globals';
import Page from './page.js';

// Evals pages (Langflow 1.14+, only with LANGFLOW_FEATURE_EVALS): the Datasets and Evaluations lists
// (/assets/datasets, /assets/evaluations) and one evaluation's page (/assets/evaluations/<id>), whose
// Runs | Results views live in the URL (?run=<id>&view=results).
// langflow-desktop (release-1.14.0): src/frontend/src/pages/MainPage/pages/evalsPage
class EvalsPage extends Page {
  // The tab row: links, in display order.
  get tabs() { return $$('[data-testid^="evals-tab-"]'); }
  tab(id: 'datasets' | 'evaluations') { return this.byTestId(`evals-tab-${id}`); }

  async openTab(id: 'datasets' | 'evaluations') {
    await this.clickInPage(this.tab(id));
  }

  // List rows are AG Grid rows keyed by the record id.
  listRow(id: string) { return $(`[role="row"][row-id="${id}"]`); }

  // The "Delete" item of a dataset row's menu (Open, Duplicate, Delete) has no test id: it is found by its text.
  async deleteDataset(datasetId: string) {
    await this.pressWithKeyboard(this.listRow(datasetId).$('[data-testid="evals-row-actions"]'));
    await this.chooseMenuItemByText('Delete');
    await this.clickInPage(this.byTestId('btn_delete_delete_confirmation_modal'));
  }

  async openEvaluation(evaluationId: string) {
    await this.clickInPage(this.listRow(evaluationId).$('[col-id="name"]'));
  }

  // Evaluation page.
  get runRows() { return $$('[data-testid="run-row"]'); }
  get runRow() { return $('[data-testid="run-row"]'); }
  runStatus(status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled') {
    return this.byTestId(`run-status-${status}`);
  }
  // Radix tab triggers: data-state="active" on the view shown.
  viewTab(view: 'runs' | 'results' | 'comparison') { return this.byTestId(`detail-tab-${view}`); }
  get exportButton() { return this.byTestId('export-run-button'); }

  // Clicking a run in the Runs view opens its Results.
  async openRun() {
    await this.clickInPage(this.runRow.$('button'));
  }

  async exportResults() {
    await this.clickInPage(this.exportButton);
  }
}

export default new EvalsPage();
