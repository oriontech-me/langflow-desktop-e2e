import EvaluateFlowModal from './components/evaluate-flow.modal.js';
import Page from './page.js';

// Flow editor (canvas), opened from a flow card on the main page.
// langflow-desktop (release-1.14.0): src/frontend/src/components/core/flowToolbarComponent
class FlowPage extends Page {
  // Shown only when the Evals flag is on; disabled until the flow has a chat input and output.
  get evaluateButton() { return this.byTestId('evaluate-btn-flow'); }

  async openEvaluate() {
    await this.evaluateButton.waitForEnabled();
    await this.clickInPage(this.evaluateButton);
    await EvaluateFlowModal.stepPanel('setup').waitForDisplayed();
  }
}

export default new FlowPage();
