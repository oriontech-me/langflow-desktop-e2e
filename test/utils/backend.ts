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

async function request(method: string, apiPath: string, body?: unknown): Promise<Response> {
  const login = await fetch(`${BACKEND_URL}/api/v1/auto_login`);
  if (!login.ok) throw new Error(`auto_login failed: HTTP ${login.status}`);
  const { access_token } = (await login.json()) as { access_token: string };
  return fetch(`${BACKEND_URL}${apiPath}`, {
    method,
    headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export interface Flow {
  id: string;
  name: string;
  description: string;
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
