import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { browser, expect } from '@wdio/globals';
import { Timeouts } from '../data/test-data.js';
import EvaluateFlowModal from '../pageobjects/components/evaluate-flow.modal.js';
import EvalsPage from '../pageobjects/evals.page.js';
import FlowPage from '../pageobjects/flow.page.js';
import MainPage from '../pageobjects/main.page.js';
import {
  createChatEchoFlow,
  createDataset,
  type Dataset,
  datasetStatus,
  deleteDataset,
  deleteEvaluation,
  deleteFlow,
  evaluationResults,
  evaluationsOfFlow,
  type Flow,
  getEvaluation,
  getEvaluationRun,
} from '../utils/backend.js';

// Evals (Langflow 1.14): evaluate a flow against a dataset from the Desktop, read and export the results,
// and keep them after the dataset is deleted. The backend logic is the web app's and is covered by its
// QA run (template "Langflow Evals — 1.14.0"); this spec checks the feature works inside the Desktop.
//
// Evals is off by default (LANGFLOW_FEATURE_EVALS): the wdio configs launch the app with it on (appEnv in
// wdio.shared.conf.ts). Starts on the main page, after first-boot.spec.ts, and leaves the app there.
// The its are steps of one journey and run in order: each starts where the previous one ended.
//
// The flow echoes its input (Chat Input → Chat Output, no model), so the run needs no API key and its
// outcome is known: with Exact match, the two rows whose expected output equals the input pass, Rome fails.
// The LLM judge needs a model provider the CI machines don't have: only its settings are checked.
const ITEMS = [
  { input: 'Paris', expected_output: 'Paris' },
  { input: 'Tokyo', expected_output: 'Tokyo' },
  { input: 'Rome', expected_output: 'Lima' },
];
const PASSED_SUMMARY = '2 of 3 rows passed';
const DATASET_DELETED = 'Dataset deleted';
const NO_JUDGE_MODELS = 'No models enabled';
const SAFETY_CHECKS = 4;

describe('Flow evaluation', () => {
  const stamp = Date.now();
  let flow: Flow;
  let dataset: Dataset;
  let evaluationId: string | undefined;
  let runId: string;
  let csvPath: string | undefined;

  const meta = (datasetName: string) => `Flow: ${flow.name} · Dataset: ${datasetName}`;

  before(async () => {
    await MainPage.title.waitForDisplayed({ timeout: Timeouts.backendStart });
    flow = await createChatEchoFlow(`E2E Eval ${stamp}`, 'Created by the langflow-desktop-e2e evaluation test');
    dataset = await createDataset(`E2E Eval ds ${stamp}`, ITEMS);
    // The main page was rendered before the flow existed: reload so its card shows up.
    await browser.refresh();
    await expect(MainPage.flowCard(flow.id)).toBeDisplayed();
  });

  after(async () => {
    // Close whatever a failed step left open, then go back to the main page for the next spec.
    await browser.keys('Escape');
    if (flow && (await MainPage.project(flow.folder_id).isDisplayed())) await MainPage.openProject(flow.folder_id);
    for (let i = 0; i < 5 && !(await MainPage.title.isDisplayed()); i++) await browser.back();

    if (csvPath) fs.rmSync(csvPath, { force: true });
    if (flow) {
      // The evaluation was created through the UI: find it by its flow, then delete it before the flow.
      for (const evaluation of await evaluationsOfFlow(flow.id)) await deleteEvaluation(evaluation.id);
      await deleteFlow(flow.id);
    }
    if (dataset && (await datasetStatus(dataset.id)) === 200) await deleteDataset(dataset.id);
  });

  it('opens one Evaluations entry with Datasets and Evaluations tabs, each at its own address', async () => {
    await expect(MainPage.evaluationsEntries).toBeElementsArrayOfSize(1);
    await MainPage.openEvaluations();

    await expect(EvalsPage.tab('datasets')).toHaveAttribute('aria-current', 'page');
    expect(await EvalsPage.path()).toBe('/assets/datasets');
    const tabIds = await EvalsPage.tabs.map((tab) => tab.getAttribute('data-testid'));
    expect(tabIds).toEqual(['evals-tab-datasets', 'evals-tab-evaluations']);

    await EvalsPage.openTab('evaluations');
    await expect(EvalsPage.tab('evaluations')).toHaveAttribute('aria-current', 'page');
    expect(await EvalsPage.path()).toBe('/assets/evaluations');
  });

  it('shows the LLM judge settings and holds Next until a judge model is chosen', async () => {
    await MainPage.openProject(flow.folder_id);
    await MainPage.openFlow(flow.id);
    await FlowPage.openEvaluate();
    await EvaluateFlowModal.chooseDataset(dataset.name);
    await EvaluateFlowModal.next();
    await expect(EvaluateFlowModal.stepPanel('scoring')).toBeDisplayed();
    await expect(EvaluateFlowModal.scorer('exact_match')).toHaveAttribute('aria-checked', 'true');

    await EvaluateFlowModal.toggleScorer('llm_judge');
    await expect(EvaluateFlowModal.judgeModelPicker).toBeDisplayed();
    // A clean machine has no model provider set up: nothing to pick as judge.
    await expect(EvaluateFlowModal.judgeModelValue).toHaveText(NO_JUDGE_MODELS);
    await expect(EvaluateFlowModal.judgeRubric).toBeDisplayed();
    await expect(EvaluateFlowModal.judgeSafetyChecks).toBeElementsArrayOfSize(SAFETY_CHECKS);
    await expect(EvaluateFlowModal.judgeLimitsSection).toBeDisplayed();
    await expect(EvaluateFlowModal.nextButton).toBeDisabled();

    // Back to Exact match alone, for the run in the next step.
    await EvaluateFlowModal.toggleScorer('llm_judge');
    await expect(EvaluateFlowModal.nextButton).toBeEnabled();
  });

  it('runs the evaluation from the canvas and shows 2 of 3 rows passed', async () => {
    await EvaluateFlowModal.next();
    await expect(EvaluateFlowModal.stepPanel('review')).toBeDisplayed();
    await EvaluateFlowModal.createAndRun();

    // A started run opens on the evaluation's Runs view, with the run in the address.
    await browser.waitUntil(async () => (await EvalsPage.path()).startsWith('/assets/evaluations/'), {
      timeoutMsg: 'the evaluation page did not open after Create & run',
    });
    evaluationId = (await EvalsPage.path()).split('/').pop();
    runId = (await EvalsPage.searchParam('run')) ?? '';
    expect(runId).not.toBe('');
    await expect(EvalsPage.viewTab('runs')).toHaveAttribute('data-state', 'active');

    await browser.waitUntil(async () => (await getEvaluationRun(runId)).status === 'completed', {
      timeout: Timeouts.evaluationRun,
      interval: 2_000,
      timeoutMsg: 'the evaluation run did not complete',
    });
    await expect(EvalsPage.runRow.$('[data-testid="run-status-completed"]')).toBeDisplayed();

    await EvalsPage.openRun();
    await expect(EvalsPage.viewTab('results')).toHaveAttribute('data-state', 'active');
    expect(await EvalsPage.searchParam('view')).toBe('results');
    await expect(EvalsPage.byText(PASSED_SUMMARY)).toBeDisplayed();

    const results = await evaluationResults(runId);
    expect(results.map((r) => [r.input, r.actual_output, r.passed])).toEqual([
      ['Paris', 'Paris', true],
      ['Tokyo', 'Tokyo', true],
      ['Rome', 'Rome', false],
    ]);
  });

  it('exports the results as a CSV file with one line per row', async () => {
    // The page downloads the file itself (no "Save as" panel), under the name the backend gives it.
    csvPath = path.join(os.homedir(), 'Downloads', `evaluation-run-${runId}.csv`);
    fs.rmSync(csvPath, { force: true });

    await EvalsPage.exportResults();
    await browser.waitUntil(() => fs.existsSync(csvPath as string) && fs.statSync(csvPath as string).size > 0, {
      timeout: Timeouts.download,
      timeoutMsg: `the results CSV was not written to ${csvPath}`,
    });
    const lines = fs
      .readFileSync(csvPath, 'utf8')
      .replace(/^﻿/, '')
      .trim()
      .split(/\r?\n/);
    expect(lines[0]).toMatch(/^position,input,expected_output,actual_output,passed,error,/);
    expect(lines.slice(1).map((line) => line.split(',').slice(1, 5))).toEqual([
      ['Paris', 'Paris', 'Paris', 'True'],
      ['Tokyo', 'Tokyo', 'Tokyo', 'True'],
      ['Rome', 'Lima', 'Rome', 'False'],
    ]);
  });

  it('keeps the evaluation and its results after the dataset is deleted', async () => {
    await expect(EvalsPage.byText(meta(dataset.name))).toBeDisplayed();

    await MainPage.openEvaluations();
    await expect(EvalsPage.listRow(dataset.id)).toBeDisplayed();
    await EvalsPage.deleteDataset(dataset.id);
    await browser.waitUntil(async () => (await datasetStatus(dataset.id)) === 404, {
      timeoutMsg: 'the dataset was not deleted',
    });
    await expect(EvalsPage.listRow(dataset.id)).not.toBeExisting();

    await EvalsPage.openTab('evaluations');
    await EvalsPage.openEvaluation(evaluationId as string);
    await expect(EvalsPage.byText(meta(DATASET_DELETED))).toBeDisplayed();
    await expect(EvalsPage.runRows).toBeElementsArrayOfSize(1);
    await expect(EvalsPage.runRow.$('[data-testid="run-status-completed"]')).toBeDisplayed();
    await EvalsPage.openRun();
    await expect(EvalsPage.byText(PASSED_SUMMARY)).toBeDisplayed();

    expect((await getEvaluation(evaluationId as string)).dataset_name).toBeNull();
    const results = await evaluationResults(runId);
    expect(results.map((r) => [r.input, r.expected_output, r.passed])).toEqual([
      ['Paris', 'Paris', true],
      ['Tokyo', 'Tokyo', true],
      ['Rome', 'Lima', false],
    ]);
  });
});
