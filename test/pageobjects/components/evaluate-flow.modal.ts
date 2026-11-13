import { $, $$, browser } from '@wdio/globals';
import Page from '../page.js';

// "Evaluate" dialog, opened from the canvas toolbar: a stepper (Setup → Scoring → [Models] → Review) whose
// footer button is "Next" until the last step, then "Create & run". Models only shows for a flow with
// model components. langflow-desktop (release-1.14.0): src/frontend/src/modals/evaluateFlowModal
class EvaluateFlowModal extends Page {
  stepPanel(step: 'setup' | 'scoring' | 'models' | 'review') {
    return this.byTestId(`evaluate-step-panel-${step}`);
  }

  get datasetPicker() { return this.byTestId('evaluate-dataset'); }
  get datasetSearch() { return this.byTestId('evaluate-dataset-search'); }
  get nextButton() { return this.byTestId('evaluate-next'); }
  get runButton() { return this.byTestId('evaluate-submit'); }

  // Scoring step: one checkbox card per scorer; Exact match is on by default.
  scorer(type: 'exact_match' | 'contains' | 'similarity' | 'llm_judge') {
    return this.byTestId(`scorer-${type}`);
  }

  // LLM judge settings, shown only while the LLM judge scorer is on.
  get judgeModelPicker() { return this.byTestId('judge-model'); }
  // The picker's visible value: the chosen model, or why there is none.
  get judgeModelValue() { return this.byTestId('value-dropdown-judge-model'); }
  get judgeRubric() { return $('#judge-rubric'); }
  // Safety checks and token limits are folded sections: only their header (a toggle) shows until expanded.
  get judgeSafetyToggle() { return this.byTestId('judge-safety-toggle'); }
  get judgeSafetyChecks() { return $$('#judge-safety-panel [role="checkbox"]'); }
  get judgeLimitsSection() { return this.byTestId('judge-limits-toggle'); }

  // The dataset picker is a Radix popover with a search box: type the (unique) name, Enter picks the match.
  async chooseDataset(name: string) {
    await this.pressWithKeyboard(this.datasetPicker);
    await this.datasetSearch.waitForDisplayed();
    await this.datasetSearch.setValue(name);
    await browser.keys('Enter');
  }

  async expandSafetyChecks() {
    await this.clickInPage(this.judgeSafetyToggle);
  }

  async toggleScorer(type: 'exact_match' | 'contains' | 'similarity' | 'llm_judge') {
    await this.clickInPage(this.scorer(type));
  }

  // Next waits for the step to be complete (the flow check, for Setup), so wait for it to enable.
  async next() {
    await this.nextButton.waitForEnabled();
    await this.clickInPage(this.nextButton);
  }

  // Create & run arrives disabled for a moment on Review, and until the cost estimate settles.
  async createAndRun() {
    await this.runButton.waitForEnabled();
    await this.clickInPage(this.runButton);
  }
}

export default new EvaluateFlowModal();
