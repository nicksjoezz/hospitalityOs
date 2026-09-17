import { Channel } from '@hospitalityos/shared';
import { OrchestratorService } from './orchestrator.service';

/**
 * Orchestrator loop with a mocked Claude (plan.md §19): assert the model's
 * tool_use is dispatched to the deterministic tool layer and the final text is
 * returned — i.e. the AI calls tools, it does not hallucinate state.
 */
describe('OrchestratorService (mocked Claude)', () => {
  function build(toolResult: unknown) {
    const prisma = {
      hotel: {
        findFirst: jest.fn().mockResolvedValue({ id: 'hotel-1' }),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ name: 'Test Hotel', currency: 'NGN', timezone: 'Africa/Lagos' }),
      },
      user: { findFirst: jest.fn().mockResolvedValue(null) }, // not staff
      guest: {
        findFirst: jest.fn().mockResolvedValue({ id: 'guest-1', name: 'Ada' }),
        create: jest.fn(),
      },
      reservation: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const messaging = {
      getOrCreateConversation: jest.fn().mockResolvedValue({ id: 'conv-1' }),
      recordInbound: jest.fn().mockResolvedValue(undefined),
      recordOutbound: jest.fn().mockResolvedValue(undefined),
      recentTurns: jest.fn().mockResolvedValue([{ direction: 'IN', body: 'Any rooms this weekend?' }]),
    };
    const createMessage = jest
      .fn()
      // 1st call: Claude asks to use a tool
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 'tu_1', name: 'check_availability', input: { checkIn: '2030-01-01', checkOut: '2030-01-03' } },
        ],
      })
      // 2nd call: Claude composes the final reply from the tool result
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Yes! We have a Standard room available.' }],
      });
    const anthropic = { isConfigured: () => true, createMessage };
    const tools = { execute: jest.fn().mockResolvedValue(toolResult) };

    const orchestrator = new OrchestratorService(
      prisma as never,
      anthropic as never,
      tools as never,
      messaging as never,
    );
    return { orchestrator, tools, createMessage, messaging };
  }

  it('dispatches a tool_use to the tool layer and returns the composed reply', async () => {
    const { orchestrator, tools, createMessage, messaging } = build({
      available: [{ roomTypeId: 'rt1', name: 'Standard', available: 3 }],
    });

    const reply = await orchestrator.handleInbound({
      channel: Channel.WHATSAPP,
      externalId: '+2347000000001',
      from: '+2347000000001',
      text: 'Any rooms this weekend?',
      senderName: 'Ada',
    });

    expect(reply).toBe('Yes! We have a Standard room available.');
    // The tool was actually executed (not hallucinated) with guest audience.
    expect(tools.execute).toHaveBeenCalledWith(
      'check_availability',
      { checkIn: '2030-01-01', checkOut: '2030-01-03' },
      expect.objectContaining({ audience: 'guest' }),
    );
    expect(createMessage).toHaveBeenCalledTimes(2);
    expect(messaging.recordOutbound).toHaveBeenCalled();
  });

  it('falls back to a templated reply when the AI is not configured', async () => {
    const { orchestrator } = build({});
    // Override isConfigured via a fresh instance
    const prisma = {
      hotel: { findFirst: jest.fn().mockResolvedValue({ id: 'h1' }), findUniqueOrThrow: jest.fn() },
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      guest: { findFirst: jest.fn().mockResolvedValue({ id: 'g1', name: 'A' }), create: jest.fn() },
      reservation: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const messaging = {
      getOrCreateConversation: jest.fn().mockResolvedValue({ id: 'c1' }),
      recordInbound: jest.fn(),
      recordOutbound: jest.fn(),
      recentTurns: jest.fn(),
    };
    const svc = new OrchestratorService(
      prisma as never,
      { isConfigured: () => false, createMessage: jest.fn() } as never,
      { execute: jest.fn() } as never,
      messaging as never,
    );
    const reply = await svc.handleInbound({
      channel: Channel.WHATSAPP,
      externalId: 'x',
      from: 'x',
      text: 'hi',
    });
    expect(reply).toContain('team will get back');
    void orchestrator;
  });
});
