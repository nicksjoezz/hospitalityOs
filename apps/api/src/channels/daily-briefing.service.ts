import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Channel, formatMoney, Role } from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { RevenueService } from '../revenue/revenue.service';
import { MessagingService } from '../messaging/messaging.service';
import { WhatsAppQueueService } from './whatsapp-queue.service';

/**
 * Daily WhatsApp briefing to the owner (plan.md §11.14). Composes a short
 * cross-department summary from deterministic figures and sends it to each
 * hotel's OWNER (dev-noop when WhatsApp is unconfigured).
 */
@Injectable()
export class DailyBriefingService {
  private readonly logger = new Logger(DailyBriefingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboard: DashboardService,
    private readonly revenue: RevenueService,
    private readonly messaging: MessagingService,
    private readonly queue: WhatsAppQueueService,
  ) {}

  async buildBriefing(hotelId: string): Promise<string> {
    const hotel = await this.prisma.hotel.findUniqueOrThrow({
      where: { id: hotelId },
      select: { name: true, currency: true },
    });
    const snap = await this.dashboard.snapshot(hotelId);
    const analytics = await this.revenue.analytics(
      hotelId,
      new Date(Date.now() - 7 * 86_400_000),
      new Date(),
    );
    const m = (n: number) => formatMoney(n, hotel.currency);
    return [
      `Good morning! Daily briefing for ${hotel.name}:`,
      `• Occupancy now: ${snap.occupancy.percent}% (${snap.occupancy.occupied}/${snap.occupancy.total})`,
      `• Check-ins ${snap.checkInsToday}, check-outs ${snap.checkOutsToday}`,
      `• Revenue today: ${m(snap.revenueToday)}; outstanding ${m(snap.expectedOutstanding)}`,
      `• 7-day ADR ${m(analytics.adr)}, RevPAR ${m(analytics.revpar)}, occ ${analytics.occupancyPct}%`,
      `• Open maintenance ${snap.openMaintenance}, rooms to clean ${snap.roomsNeedingCleaning}`,
      snap.alerts.length ? `• Alerts: ${snap.alerts.map((a) => a.message).join('; ')}` : '• No alerts',
    ].join('\n');
  }

  /** Send the briefing to all OWNER users of a hotel. */
  async runForHotel(hotelId: string): Promise<{ sent: number; briefing: string }> {
    const briefing = await this.buildBriefing(hotelId);
    const owners = await this.prisma.user.findMany({
      where: { hotelId, role: Role.OWNER, active: true },
    });
    let sent = 0;
    for (const owner of owners) {
      const to = owner.whatsappId ?? owner.phone;
      if (!to) continue;
      const conversation = await this.messaging.getOrCreateConversation({
        hotelId,
        channel: Channel.WHATSAPP,
        externalId: to,
        userId: owner.id,
      });
      await this.queue.enqueueText(to, briefing);
      await this.messaging.recordOutbound(conversation.id, briefing, {
        templateName: 'daily_briefing',
      });
      sent += 1;
    }
    return { sent, briefing };
  }

  @Cron('0 0 7 * * *')
  async dailyRun(): Promise<void> {
    const hotels = await this.prisma.hotel.findMany({ select: { id: true } });
    for (const { id } of hotels) {
      try {
        await this.runForHotel(id);
      } catch (e) {
        this.logger.error(`Briefing failed for hotel ${id}: ${e}`);
      }
    }
  }
}
