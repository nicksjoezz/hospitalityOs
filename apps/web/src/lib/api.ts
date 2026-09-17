import { db, enqueue, newIdempotencyKey, type QueuedOp } from './db';

// API origin: empty = same origin (single-domain deploy / dev proxy). Set
// VITE_API_BASE at build time to point the SPA at a separate API host.
export const API_ORIGIN = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');
const BASE = `${API_ORIGIN}/api/v1`;

let accessToken: string | null = localStorage.getItem('accessToken');

export function setAccessToken(token: string | null): void {
  accessToken = token;
  if (token) localStorage.setItem('accessToken', token);
  else localStorage.removeItem('accessToken');
}

export function getAccessToken(): string | null {
  return accessToken;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

function authHeaders(): Record<string, string> {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

/** GET — read path. Throws ApiError on non-2xx. May serve from SW cache offline. */
export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { ...authHeaders() },
  });
  return handle<T>(res);
}

/**
 * Write (POST/PATCH/DELETE). When online, sends immediately with an
 * Idempotency-Key. When offline (or the network call fails), the op is queued
 * to IndexedDB and replayed later — the caller gets `{ queued: true }`.
 */
export async function apiWrite<T>(
  method: QueuedOp['method'],
  path: string,
  body?: unknown,
): Promise<{ queued: false; data: T } | { queued: true; idempotencyKey: string }> {
  const idempotencyKey = newIdempotencyKey();

  if (!navigator.onLine) {
    await enqueue({ idempotencyKey, method, path, body });
    return { queued: true, idempotencyKey };
  }

  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
        ...authHeaders(),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await handle<T>(res);
    return { queued: false, data };
  } catch (e) {
    // Network failure mid-write (e.g. power cut) -> queue for later sync.
    if (e instanceof TypeError) {
      await enqueue({ idempotencyKey, method, path, body });
      return { queued: true, idempotencyKey };
    }
    throw e;
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (res.ok) {
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
  let code = 'ERROR';
  let message = res.statusText;
  try {
    const payload = await res.json();
    code = payload?.error?.code ?? code;
    message = payload?.error?.message ?? message;
  } catch {
    /* non-JSON error */
  }
  if (res.status === 401) setAccessToken(null);
  throw new ApiError(res.status, code, message);
}

/** Download a file (CSV/PDF report) with auth, triggering a browser save. */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new ApiError(res.status, 'DOWNLOAD_FAILED', res.statusText);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Replay all queued writes to /sync. Returns how many succeeded. */
export async function flushQueue(): Promise<{ synced: number; failed: number }> {
  if (!navigator.onLine || !accessToken) return { synced: 0, failed: 0 };
  const pending = await db.outbox.where('status').equals('pending').toArray();
  if (pending.length === 0) return { synced: 0, failed: 0 };

  const operations = pending.map((op) => ({
    idempotencyKey: op.idempotencyKey,
    method: op.method,
    path: op.path,
    body: op.body,
    enqueuedAt: op.enqueuedAt,
  }));

  const res = await fetch(`${BASE}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ operations }),
  });
  const results = await handle<
    Array<{ idempotencyKey: string; ok: boolean; error?: string }>
  >(res);

  let synced = 0;
  let failed = 0;
  for (const r of results) {
    const row = pending.find((p) => p.idempotencyKey === r.idempotencyKey);
    if (!row?.id) continue;
    if (r.ok) {
      await db.outbox.delete(row.id);
      synced++;
    } else {
      await db.outbox.update(row.id, { status: 'failed', lastError: r.error });
      failed++;
    }
  }
  return { synced, failed };
}
