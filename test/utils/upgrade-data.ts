import { BACKEND_URL, request, requestJson } from './backend.js';

// Data the upgrade test creates on the old version, through the API, to check it after the update.
// Each kind is something a user keeps across versions and that lives in the Desktop's database or data
// folder. Knowledge and memory bases are created with their embedding configuration only: filling them
// would embed text, which needs a provider API key the CI doesn't have.

// What the test created, with the values it must find again after the update.
export interface UpgradeData {
  project: { id: string; name: string; description: string };
  // Chat Input → Chat Output in the default project: runs without an LLM and shows on the main page.
  chatFlow: { id: string; name: string; nodeIds: string[]; edgeCount: number };
  // An empty flow inside the project above.
  projectFlow: { id: string; name: string };
  flowVersion: { id: string; description: string };
  genericVariable: { id: string; name: string; value: string };
  credentialVariable: { id: string; name: string };
  file: { id: string; name: string; content: string };
  apiKey: { id: string; name: string; key: string };
  knowledgeBase: { id: string; name: string; dirName: string; embeddingProvider: string; embeddingModel: string };
  memoryBase: { id: string; name: string; flowId: string; embeddingModel: string };
  mcpServer: { name: string; command: string; args: string[] };
  // A chat sent through chatFlow: its messages are stored under this session.
  chat: { sessionId: string; input: string };
}

const EMBEDDING_PROVIDER = 'OpenAI';
const EMBEDDING_MODEL = 'text-embedding-3-small';

interface ComponentTemplate {
  outputs: { name: string; types: string[] }[];
  template: Record<string, { type: string; input_types?: string[] }>;
}

// React Flow handle ids are the handle object as JSON with every " replaced by œ, as the Langflow frontend writes them.
const handleId = (handle: object) => JSON.stringify(handle).replace(/"/g, 'œ');

// A Chat Input → Chat Output graph built from the running backend's own component templates, so it matches
// whatever version the test starts from.
async function chatGraph(tag: string) {
  const catalog = await requestJson<Record<string, Record<string, ComponentTemplate>>>('GET', '/api/v1/all', 200);
  const input = catalog.input_output?.ChatInput;
  const output = catalog.input_output?.ChatOutput;
  if (!input || !output) throw new Error('ChatInput/ChatOutput not found in /api/v1/all');

  const inputId = `ChatInput-${tag}`;
  const outputId = `ChatOutput-${tag}`;
  const node = (id: string, type: string, template: ComponentTemplate, x: number) => ({
    id,
    type: 'genericNode',
    position: { x, y: 0 },
    data: { id, type, node: template, showNode: true },
  });
  const sourceHandle = {
    dataType: 'ChatInput',
    id: inputId,
    name: input.outputs[0].name,
    output_types: input.outputs[0].types,
  };
  const targetField = output.template.input_value;
  const targetHandle = {
    fieldName: 'input_value',
    id: outputId,
    inputTypes: targetField.input_types,
    type: targetField.type,
  };
  return {
    nodes: [node(inputId, 'ChatInput', input, 0), node(outputId, 'ChatOutput', output, 400)],
    edges: [
      {
        id: `reactflow__edge-${inputId}${handleId(sourceHandle)}-${outputId}${handleId(targetHandle)}`,
        source: inputId,
        target: outputId,
        sourceHandle: handleId(sourceHandle),
        targetHandle: handleId(targetHandle),
        data: { sourceHandle, targetHandle },
      },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

// Runs a chat flow the way an external client does and returns the text its Chat Output sends back.
// /api/v1/run needs an API key: with auto-login on (the Desktop), the bearer token alone gets a 403.
export async function runChatFlow(flowId: string, input: string, sessionId: string, apiKey: string): Promise<string> {
  const res = await fetch(`${BACKEND_URL}/api/v1/run/${flowId}?stream=false`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input_value: input, input_type: 'chat', output_type: 'chat', session_id: sessionId }),
  });
  const text = await res.text();
  if (res.status !== 200) throw new Error(`POST /api/v1/run/${flowId}: HTTP ${res.status} ${text}`);
  const result = JSON.parse(text) as { outputs: { outputs: { results: { message: { text: string } } }[] }[] };
  return result.outputs[0].outputs[0].results.message.text;
}

export async function createUpgradeData(): Promise<UpgradeData> {
  const tag = Date.now().toString(36);
  const name = (what: string) => `e2e-upgrade ${what} ${tag}`;
  // Names that end up as identifiers (variables, knowledge base, MCP server) take no spaces.
  const ident = (what: string) => `e2e_upgrade_${what}_${tag}`;

  const projectDescription = 'Created on the old version by the Desktop upgrade test';
  const project = await requestJson<{ id: string; name: string }>('POST', '/api/v1/projects/', 201, {
    name: name('project'),
    description: projectDescription,
  });

  const graph = await chatGraph(tag);
  const chatFlow = await requestJson<{ id: string; name: string }>('POST', '/api/v1/flows/', 201, {
    name: name('chat flow'),
    description: 'Chat Input → Chat Output',
    data: graph,
    is_component: false,
  });
  const projectFlow = await requestJson<{ id: string; name: string }>('POST', '/api/v1/flows/', 201, {
    name: name('project flow'),
    description: 'Empty flow inside the upgrade project',
    data: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
    folder_id: project.id,
    is_component: false,
  });

  const versionDescription = 'Snapshot taken before the upgrade';
  const flowVersion = await requestJson<{ id: string }>('POST', `/api/v1/flows/${chatFlow.id}/versions/`, 201, {
    description: versionDescription,
  });

  const genericValue = `generic value ${tag}`;
  const genericVariable = await requestJson<{ id: string; name: string }>('POST', '/api/v1/variables/', 201, {
    name: ident('generic'),
    value: genericValue,
    type: 'Generic',
    default_fields: [],
  });
  const credentialVariable = await requestJson<{ id: string; name: string }>('POST', '/api/v1/variables/', 201, {
    name: ident('credential'),
    value: `secret-${tag}`,
    type: 'Credential',
    default_fields: [],
  });

  const fileName = `e2e-upgrade-${tag}.txt`;
  const fileContent = `File uploaded before the upgrade (${tag})\n`;
  const form = new FormData();
  form.append('file', new Blob([fileContent], { type: 'text/plain' }), fileName);
  const file = await requestJson<{ id: string; name: string }>('POST', '/api/v2/files', 201, form);

  const apiKey = await requestJson<{ id: string; name: string; api_key: string }>('POST', '/api/v1/api_key/', 200, {
    name: name('api key'),
  });

  // The API stores the name with spaces for underscores (name) and keeps the one sent as dir_name.
  const knowledgeBase = await requestJson<{ id: string; name: string; dir_name: string }>(
    'POST',
    '/api/v1/knowledge_bases/',
    201,
    {
      name: ident('kb'),
      embedding_provider: EMBEDDING_PROVIDER,
      embedding_model: EMBEDDING_MODEL,
    },
  );

  // auto_capture off: capturing the chat below would embed it, and there is no key to do so.
  const memoryBase = await requestJson<{ id: string; name: string }>('POST', '/api/v1/memories/', 201, {
    name: name('memory'),
    flow_id: chatFlow.id,
    embedding_model: EMBEDDING_MODEL,
    embedding_provider: EMBEDDING_PROVIDER,
    auto_capture: false,
  });

  // Saved only: nothing starts the server until a flow or the MCP page asks for its tools.
  const mcpServer = { name: ident('mcp'), command: 'uvx', args: ['mcp-server-fetch'] };
  await requestJson('POST', `/api/v2/mcp/servers/${mcpServer.name}`, 200, {
    command: mcpServer.command,
    args: mcpServer.args,
  });

  const chat = { sessionId: `e2e-upgrade-session-${tag}`, input: `Hello before the upgrade ${tag}` };
  await runChatFlow(chatFlow.id, chat.input, chat.sessionId, apiKey.api_key);

  return {
    project: { id: project.id, name: project.name, description: projectDescription },
    chatFlow: {
      id: chatFlow.id,
      name: chatFlow.name,
      nodeIds: graph.nodes.map((n) => n.id),
      edgeCount: graph.edges.length,
    },
    projectFlow: { id: projectFlow.id, name: projectFlow.name },
    flowVersion: { id: flowVersion.id, description: versionDescription },
    genericVariable: { id: genericVariable.id, name: genericVariable.name, value: genericValue },
    credentialVariable: { id: credentialVariable.id, name: credentialVariable.name },
    file: { id: file.id, name: fileName, content: fileContent },
    apiKey: { id: apiKey.id, name: apiKey.name, key: apiKey.api_key },
    knowledgeBase: {
      id: knowledgeBase.id,
      name: knowledgeBase.name,
      dirName: knowledgeBase.dir_name,
      embeddingProvider: EMBEDDING_PROVIDER,
      embeddingModel: EMBEDDING_MODEL,
    },
    memoryBase: { id: memoryBase.id, name: memoryBase.name, flowId: chatFlow.id, embeddingModel: EMBEDDING_MODEL },
    mcpServer,
    chat,
  };
}

// --- Reads used after the update -------------------------------------------------------------------

export const getProject = (id: string) =>
  requestJson<{ id: string; name: string; description: string; flows?: { id: string }[] }>(
    'GET',
    `/api/v1/projects/${id}`,
    200,
  );

export const getFlow = (id: string) =>
  requestJson<{
    id: string;
    name: string;
    folder_id: string;
    data: { nodes: { id: string }[]; edges: unknown[] };
  }>('GET', `/api/v1/flows/${id}`, 200);

export const listFlowVersions = (flowId: string) =>
  requestJson<{ entries: { id: string; description: string | null }[] }>(
    'GET',
    `/api/v1/flows/${flowId}/versions/`,
    200,
  );

export const listVariables = () =>
  requestJson<{ id: string; name: string; type: string; value: string | null }[]>('GET', '/api/v1/variables/', 200);

export async function downloadFile(id: string): Promise<string> {
  const res = await request('GET', `/api/v2/files/${id}`);
  if (res.status !== 200) throw new Error(`GET /api/v2/files/${id}: HTTP ${res.status} ${await res.text()}`);
  return res.text();
}

export const listKnowledgeBases = () =>
  requestJson<{ id: string; name: string; dir_name: string; embedding_provider: string; embedding_model: string }[]>(
    'GET',
    '/api/v1/knowledge_bases/',
    200,
  );

export const getMemoryBase = (id: string) =>
  requestJson<{ id: string; name: string; flow_id: string; embedding_model: string }>(
    'GET',
    `/api/v1/memories/${id}`,
    200,
  );

export const getMcpServer = (name: string) =>
  requestJson<{ command?: string; args?: string[] } | null>('GET', `/api/v2/mcp/servers/${name}`, 200);

export const listSessionMessages = (flowId: string, sessionId: string) =>
  requestJson<{ text: string; sender: string; session_id: string }[]>(
    'GET',
    `/api/v1/monitor/messages?flow_id=${flowId}&session_id=${encodeURIComponent(sessionId)}`,
    200,
  );

// Status of a request authenticated only by the API key, as an external client would send it.
export async function apiKeyStatus(key: string): Promise<number> {
  return (await fetch(`${BACKEND_URL}/api/v1/flows/?get_all=false&page=1&size=1`, { headers: { 'x-api-key': key } }))
    .status;
}

// Deletes what createUpgradeData made, by id, ignoring what is already gone. The chat messages go with their flow.
export async function deleteUpgradeData(data: UpgradeData) {
  const paths = [
    `/api/v2/mcp/servers/${data.mcpServer.name}`,
    `/api/v1/memories/${data.memoryBase.id}`,
    `/api/v1/knowledge_bases/${data.knowledgeBase.dirName}`,
    `/api/v1/api_key/${data.apiKey.id}`,
    `/api/v2/files/${data.file.id}`,
    `/api/v1/variables/${data.genericVariable.id}`,
    `/api/v1/variables/${data.credentialVariable.id}`,
    `/api/v1/flows/${data.chatFlow.id}`,
    `/api/v1/flows/${data.projectFlow.id}`,
    `/api/v1/projects/${data.project.id}`,
  ];
  for (const apiPath of paths) {
    try {
      await request('DELETE', apiPath);
    } catch (err) {
      console.warn(`cleanup: DELETE ${apiPath} failed: ${(err as Error).message}`);
    }
  }
}
