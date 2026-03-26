const API_BASE = '/api/v1';

export async function fetchRecords(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== '' && value !== null && value !== undefined) {
      query.set(key, value);
    }
  }
  const resp = await fetch(`${API_BASE}/records?${query}`);
  if (!resp.ok) throw new Error(`Failed to fetch records: ${resp.status}`);
  return resp.json();
}

export async function fetchRecord(callId) {
  const resp = await fetch(`${API_BASE}/records/${encodeURIComponent(callId)}`);
  if (!resp.ok) throw new Error(`Failed to fetch record: ${resp.status}`);
  return resp.json();
}

export async function deleteRecord(callId) {
  const resp = await fetch(`${API_BASE}/records/${encodeURIComponent(callId)}`, { method: 'DELETE' });
  if (!resp.ok) throw new Error(`Failed to delete record: ${resp.status}`);
}

export async function uploadRecord(rawPayload) {
  const resp = await fetch(`${API_BASE}/ingest/webhook?upsert=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rawPayload),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.detail || `Upload failed: ${resp.status}`);
  }
  return resp.json();
}

export async function fetchStats() {
  const resp = await fetch(`${API_BASE}/records/stats`);
  if (!resp.ok) throw new Error(`Failed to fetch stats: ${resp.status}`);
  return resp.json();
}
