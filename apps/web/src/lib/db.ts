import Dexie, { type Table } from 'dexie';

/**
 * Offline write-queue (plan.md §10). Mutations made while offline are stored
 * here with a client-generated idempotencyKey and replayed to /sync on
 * reconnect. The server applies them idempotently, so a double-replay is safe.
 */
export interface QueuedOp {
  id?: number;
  idempotencyKey: string;
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  enqueuedAt: number;
  /** 'pending' until synced; 'failed' if the server rejected it. */
  status: 'pending' | 'failed';
  lastError?: string;
}

class HospitalityDB extends Dexie {
  outbox!: Table<QueuedOp, number>;

  constructor() {
    super('hospitalityos');
    this.version(1).stores({
      outbox: '++id, idempotencyKey, status, enqueuedAt',
    });
  }
}

export const db = new HospitalityDB();

export function newIdempotencyKey(): string {
  // crypto.randomUUID is available in modern browsers and secure contexts.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `op-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

export async function enqueue(
  op: Omit<QueuedOp, 'id' | 'enqueuedAt' | 'status'>,
): Promise<void> {
  await db.outbox.add({
    ...op,
    enqueuedAt: Date.now(),
    status: 'pending',
  });
}

export async function pendingCount(): Promise<number> {
  return db.outbox.where('status').equals('pending').count();
}
