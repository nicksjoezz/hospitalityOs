/**
 * Channel abstraction (plan.md §3.7). A ChannelAdapter hides the concrete BSP
 * (WhatsApp Cloud API here) so it can be swapped without touching the
 * orchestrator. Outbound replies and templates go through this interface.
 */
export interface OutboundResult {
  ok: boolean;
  providerId?: string;
  cost?: number;
  error?: string;
}

export interface ParsedInbound {
  /** Provider message id — used for idempotent dedupe. */
  messageId: string;
  from: string;
  text: string;
  senderName?: string;
  /** Business phone number id the message arrived on (multi-tenant routing). */
  phoneNumberId?: string;
}

export interface ChannelAdapter {
  /** Send a free-form text reply (valid inside the 24h service window). */
  sendText(to: string, body: string): Promise<OutboundResult>;
  /** Send a pre-approved template (for business-initiated / out-of-window). */
  sendTemplate(
    to: string,
    templateName: string,
    languageCode: string,
    params?: string[],
  ): Promise<OutboundResult>;
}
