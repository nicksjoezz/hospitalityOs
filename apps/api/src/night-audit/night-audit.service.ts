import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ReservationStatus } from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { Actor, systemActor } from '../common/actor';

const DAY = 86_400_000;

/**
 * Night audit (plan.md §5/§13): the daily close. Processes no-shows, rolls the
 * hotel business date forward, and records a dated summary. Runs nightly via cron
 * and can be triggered manually.
 */
@Injectable()
export class NightAuditService {
  private readonly logger = new Logger(NightAuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async run(actor: Actor) {
    const hotelId = actor.hotelId;
    const hotel = await this.prisma.hotel.findUniqueOrThrow({ where: { id: hotelId } });
    const businessDate = hotel.businessDate ?? startOfDay(new Date());
    const dayStart = startOfDay(businessDate);
    const dayEnd = new Date(dayStart.getTime() + DAY);

    // 1. No-shows: confirmed arrivals for the business date that never checked in.
    const noShowRes = await this.prisma.reservation.findMany({
      where: {
        hotelId,
        status: ReservationStatus.CONFIRMED,
        checkInDate: { lt: dayEnd },
      },
      select: { id: true },
    });
    for (const r of noShowRes) {
      await this.prisma.$transaction([
        this.prisma.reservation.update({ where: { id: r.id }, data: { status: ReservationStatus.NO_SHOW } }),
        this.prisma.reservationStatusHistory.create({
          data: { reservationId: r.id, fromStatus: ReservationStatus.CONFIRMED, toStatus: ReservationStatus.NO_SHOW, byId: actor.id, note: 'night audit no-show' },
        }),
      ]);
    }

    // 2. Summary metrics for the business date.
    const [arrivals, departures, inHouse, totalRooms, occupiedRooms, payments] = await Promise.all([
      this.prisma.reservation.count({ where: { hotelId, checkInDate: { gte: dayStart, lt: dayEnd } } }),
      this.prisma.reservation.count({ where: { hotelId, checkOutDate: { gte: dayStart, lt: dayEnd } } }),
      this.prisma.reservation.count({ where: { hotelId, status: ReservationStatus.CHECKED_IN } }),
      this.prisma.room.count({ where: { hotelId, deletedAt: null } }),
      this.prisma.room.count({ where: { hotelId, status: 'OCCUPIED' } }),
      this.prisma.payment.aggregate({ where: { hotelId, at: { gte: dayStart, lt: dayEnd } }, _sum: { baseAmount: true } }),
    ]);
    const summary = {
      arrivals,
      departures,
      inHouse,
      noShows: noShowRes.length,
      occupancyPct: totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0,
      revenueCollected: payments._sum.baseAmount ?? 0,
    };

    // 3. Roll the business date and persist the run.
    const nextBusinessDate = new Date(dayStart.getTime() + DAY);
    const run = await this.prisma.$transaction(async (tx) => {
      const r = await tx.nightAuditRun.create({
        data: { hotelId, businessDate: dayStart, summary },
      });
      await tx.hotel.update({ where: { id: hotelId }, data: { businessDate: nextBusinessDate } });
      return r;
    });
    await this.audit.record({
      actor, action: 'night_audit.run', entity: 'NightAuditRun', entityId: run.id,
      after: { businessDate: dayStart.toISOString().slice(0, 10), ...summary },
    });
    this.logger.log(`Night audit for ${hotelId} @ ${dayStart.toISOString().slice(0, 10)}: ${JSON.stringify(summary)}`);
    return { businessDate: dayStart.toISOString().slice(0, 10), nextBusinessDate: nextBusinessDate.toISOString().slice(0, 10), summary, runId: run.id };
  }

  listRuns(hotelId: string) {
    return this.prisma.nightAuditRun.findMany({ where: { hotelId }, orderBy: { runAt: 'desc' }, take: 90 });
  }

  /** Nightly close at 03:00 for every hotel. */
  @Cron('0 0 3 * * *')
  async nightly(): Promise<void> {
    const hotels = await this.prisma.hotel.findMany({ select: { id: true } });
    for (const { id } of hotels) {
      try {
        await this.run(systemActor(id));
      } catch (e) {
        this.logger.error(`Night audit failed for ${id}: ${e}`);
      }
    }
  }
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}
