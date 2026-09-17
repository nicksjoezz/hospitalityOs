// Master-controller (platform admin) API client. Uses its own token slot,
// kept separate from the hotel-user accessToken so the two sessions can't mix.
import { API_ORIGIN } from './api';

const BASE = `${API_ORIGIN}/api/v1`;
const KEY = 'platformToken';

let token: string | null = localStorage.getItem(KEY);

export function setPlatformToken(t: string | null): void {
  token = t;
  if (t) localStorage.setItem(KEY, t);
  else localStorage.removeItem(KEY);
}
export function getPlatformToken(): string | null {
  return token;
}

export class PlatformError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (res.ok) return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  let code = 'ERROR';
  let message = res.statusText;
  try {
    const p = await res.json();
    code = p?.error?.code ?? code;
    message = p?.error?.message ?? message;
  } catch {
    /* non-JSON */
  }
  if (res.status === 401) setPlatformToken(null);
  throw new PlatformError(res.status, code, message);
}

function headers(json = false): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h['Content-Type'] = 'application/json';
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export function pGet<T>(path: string): Promise<T> {
  return fetch(`${BASE}${path}`, { headers: headers() }).then((r) => handle<T>(r));
}
export function pSend<T>(
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  return fetch(`${BASE}${path}`, {
    method,
    headers: headers(true),
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then((r) => handle<T>(r));
}

export interface PlatformAdmin {
  id: string;
  name: string;
  email: string;
  role: 'SUPER_ADMIN' | 'STAFF';
}

export async function platformLogin(
  email: string,
  password: string,
): Promise<PlatformAdmin> {
  const res = await pSend<{ accessToken: string; refreshToken: string; admin: PlatformAdmin }>(
    'POST',
    '/platform/auth/login',
    { email, password },
  );
  setPlatformToken(res.accessToken);
  localStorage.setItem('platformRefresh', res.refreshToken);
  return res.admin;
}

export function platformLogout(): void {
  setPlatformToken(null);
  localStorage.removeItem('platformRefresh');
}
