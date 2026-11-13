// The Desktop backend, called straight from Node: the runner sits on the same machine as the app.
// Use it to prepare test data and to check state the UI doesn't show.
export const BACKEND_URL = 'http://localhost:7860';

// HTTP status of /health, or -1 while nothing listens on the port (backend not installed or not started).
export async function backendStatus(): Promise<number> {
  try {
    return (await fetch(`${BACKEND_URL}/health`)).status;
  } catch {
    return -1;
  }
}

// Calls the API as the Desktop's single (auto-login) user. A FormData body is sent as multipart.
export async function request(method: string, apiPath: string, body?: unknown): Promise<Response> {
  const login = await fetch(`${BACKEND_URL}/api/v1/auto_login`);
  if (!login.ok) throw new Error(`auto_login failed: HTTP ${login.status}`);
  const { access_token } = (await login.json()) as { access_token: string };
  const headers: Record<string, string> = { Authorization: `Bearer ${access_token}` };
  if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) payload = JSON.stringify(body);
  return fetch(`${BACKEND_URL}${apiPath}`, { method, headers, body: payload });
}

// request() that expects `status` and returns the parsed JSON body; any other status throws with the body.
export async function requestJson<T>(method: string, apiPath: string, status: number, body?: unknown): Promise<T> {
  const res = await request(method, apiPath, body);
  const text = await res.text();
  if (res.status !== status) throw new Error(`${method} ${apiPath}: HTTP ${res.status} (expected ${status}) ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

export interface Flow {
  id: string;
  name: string;
  description: string;
  // The project the flow was saved in (the default project when none is given).
  folder_id: string;
}

export async function createFlow(name: string, description: string): Promise<Flow> {
  const res = await request('POST', '/api/v1/flows/', {
    name,
    description,
    data: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
    is_component: false,
  });
  if (res.status !== 201) throw new Error(`creating flow "${name}" failed: HTTP ${res.status} ${await res.text()}`);
  return (await res.json()) as Flow;
}

export async function deleteFlow(id: string) {
  await request('DELETE', `/api/v1/flows/${id}`);
}

// A component's template as GET /api/v1/all serves it (only the fields the flow builder reads).
interface ComponentTemplate {
  template: Record<string, { input_types?: string[] }>;
  outputs: { name: string; types: string[] }[];
}

// The template of a built-in component, wherever /api/v1/all files it (the category names change across versions).
async function componentTemplate(type: string): Promise<ComponentTemplate> {
  const all = await requestJson<Record<string, Record<string, ComponentTemplate>>>('GET', '/api/v1/all', 200);
  for (const category of Object.values(all)) {
    if (category[type]) return category[type];
  }
  throw new Error(`component ${type} not found in /api/v1/all`);
}

// Langflow stores a handle as JSON with every double quote replaced by "œ".
const handleString = (handle: object) => JSON.stringify(handle).replace(/"/g, 'œ');

// A flow that answers each message with the message itself: Chat Input → Chat Output, no model.
// Its output is deterministic, so an evaluation scored by exact match passes exactly the rows whose
// expected output equals the input.
export async function createChatEchoFlow(name: string, description: string): Promise<Flow> {
  const [chatInput, chatOutput] = await Promise.all([componentTemplate('ChatInput'), componentTemplate('ChatOutput')]);
  const inputId = 'ChatInput-e2e01';
  const outputId = 'ChatOutput-e2e02';
  const output = chatInput.outputs[0];
  const sourceHandle = { dataType: 'ChatInput', id: inputId, name: output.name, output_types: output.types };
  const targetHandle = {
    fieldName: 'input_value',
    id: outputId,
    inputTypes: chatOutput.template.input_value.input_types,
    type: 'other',
  };
  const node = (id: string, type: string, template: ComponentTemplate, x: number) => ({
    id,
    type: 'genericNode',
    position: { x, y: 0 },
    data: { id, type, node: template },
  });
  const res = await request('POST', '/api/v1/flows/', {
    name,
    description,
    data: {
      nodes: [node(inputId, 'ChatInput', chatInput, 0), node(outputId, 'ChatOutput', chatOutput, 400)],
      edges: [
        {
          id: `reactflow__edge-${inputId}${handleString(sourceHandle)}-${outputId}${handleString(targetHandle)}`,
          source: inputId,
          target: outputId,
          sourceHandle: handleString(sourceHandle),
          targetHandle: handleString(targetHandle),
          data: { sourceHandle, targetHandle },
        },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    is_component: false,
  });
  if (res.status !== 201) throw new Error(`creating flow "${name}" failed: HTTP ${res.status} ${await res.text()}`);
  return (await res.json()) as Flow;
}

// Evals (Langflow 1.14+, behind LANGFLOW_FEATURE_EVALS). Routes: langflow src/backend/base/langflow/api/v1/
// datasets.py and evaluations.py.

export interface Dataset {
  id: string;
  name: string;
  item_count: number;
}

export interface DatasetItemInput {
  input: string;
  expected_output: string;
}

export async function createDataset(name: string, items: DatasetItemInput[]): Promise<Dataset> {
  const dataset = await requestJson<Dataset>('POST', '/api/v1/datasets/', 201, { name });
  await requestJson('POST', `/api/v1/datasets/${dataset.id}/items`, 201, { items });
  return dataset;
}

// HTTP status of GET dataset: 200 while it exists, 404 once deleted.
export async function datasetStatus(id: string): Promise<number> {
  return (await request('GET', `/api/v1/datasets/${id}`)).status;
}

export async function deleteDataset(id: string) {
  await request('DELETE', `/api/v1/datasets/${id}`);
}

export interface Evaluation {
  id: string;
  name: string;
  dataset_id: string | null;
  dataset_name: string | null;
}

export async function getEvaluation(id: string): Promise<Evaluation> {
  return requestJson<Evaluation>('GET', `/api/v1/evaluations/${id}`, 200);
}

// The evaluations of one flow, so a test can find the one it created through the UI.
export async function evaluationsOfFlow(flowId: string): Promise<Evaluation[]> {
  const page = await requestJson<{ items: Evaluation[] }>('GET', `/api/v1/evaluations?flow_id=${flowId}`, 200);
  return page.items;
}

export async function deleteEvaluation(id: string) {
  await request('DELETE', `/api/v1/evaluations/${id}`);
}

export interface EvaluationRun {
  id: string;
  evaluation_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  total_items: number;
  completed_items: number;
  passed_items: number;
  error: string | null;
}

export async function getEvaluationRun(id: string): Promise<EvaluationRun> {
  return requestJson<EvaluationRun>('GET', `/api/v1/evaluation-runs/${id}`, 200);
}

export interface EvaluationResult {
  position: number;
  input: string;
  expected_output: string | null;
  actual_output: string | null;
  passed: boolean | null;
}

export async function evaluationResults(runId: string): Promise<EvaluationResult[]> {
  const page = await requestJson<{ items: EvaluationResult[] }>(
    'GET',
    `/api/v1/evaluation-runs/${runId}/results?size=100`,
    200,
  );
  return page.items;
}
