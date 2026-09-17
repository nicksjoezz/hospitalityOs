import { ActorType, Role } from '@hospitalityos/shared';

/**
 * The authenticated principal behind a request or tool call. Every
 * state-changing service takes an Actor so the audit log records who did what
 * (plan.md §15) — a USER, the AI orchestrator, a SYSTEM job, or a GUEST.
 */
export interface Actor {
  id?: string;
  type: ActorType;
  role?: Role;
  hotelId: string;
  ip?: string;
}

export const systemActor = (hotelId: string): Actor => ({
  type: ActorType.SYSTEM,
  hotelId,
});
