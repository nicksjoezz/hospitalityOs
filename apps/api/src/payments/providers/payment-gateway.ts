import { PaymentMethod } from '@hospitalityos/shared';

/**
 * Online payment provider abstraction (plan.md §4). Each provider can start a
 * hosted-checkout transaction and verify/parse its webhook. CASH is handled
 * directly by the deterministic payment flow, not here.
 */
export interface InitializeInput {
  reference: string;
  amount: number; // minor units, in the provider's currency
  currency: string;
  email: string;
  redirectUrl?: string;
}

export interface InitializeResult {
  authorizationUrl: string;
  reference: string;
}

export interface WebhookEvent {
  ok: boolean;
  /** true only for a successful, completed charge */
  success: boolean;
  reference?: string;
  amount?: number;
  currency?: string;
  method: PaymentMethod;
}

export interface PaymentProvider {
  readonly method: PaymentMethod;
  isConfigured(): boolean;
  initialize(input: InitializeInput): Promise<InitializeResult>;
  verifyAndParse(rawBody: Buffer | undefined, headers: Record<string, unknown>): WebhookEvent;
}

/** Encode/decode the reservation id inside a provider transaction reference. */
export function buildReference(reservationId: string, nonce: string): string {
  return `hos.${reservationId}.${nonce}`;
}
export function reservationFromReference(reference: string): string | null {
  const parts = reference.split('.');
  return parts.length >= 2 && parts[0] === 'hos' ? parts[1] : null;
}
