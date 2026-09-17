import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  AssetStatus,
  MaintCategory,
  MaintSource,
  Priority,
  ScheduleFrequency,
} from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { Actor, systemActor } from '../common/actor';
import { MaintenanceService } from './maintenance.service';

const DAY = 86_400_000;
const INTERVAL: Record<ScheduleFrequency, number> = {
  DAILY: DAY,
  WEEKLY: 7 * DAY,
  MONTHLY: 30 * DAY,
  QUARTERLY: 90 * DAY,
  YEARLY: 365 * DAY,
};

/** Preventive-maintenance schedules + asset register (plan.md §11.3). */
@Injectable()
export class PmService {
  private readonly logger = new Logger(PmService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly maintenance: MaintenanceService,
  ) {}

  // ---- Schedules ----
  createSchedule(
    actor: Actor,
    input: {
      title: string;
      category?: MaintCategory;
      roomId?: string;
      areaId?: string;
      frequency: ScheduleFrequency;
      priority?: Priority;
      startAt?: Date;
    },
  ) {
    return this.prisma.maintenanceSchedule.create({
      data: {
        hotelId: actor.hotelId,
        title: input.title,
        category: input.category ?? MaintCategory.OTHER,
        roomId: input.roomId,
        areaId: input.areaId,
        frequency: input.frequency,
        priority: input.priority ?? Priority.MEDIUM,
        nextRunAt: input.startAt ?? new Date(),
      },
    });
  }

  listSchedules(hotelId: string) {
    return this.prisma.maintenanceSchedule.findMany({ where: { hotelId }, orderBy: { nextRunAt: 'asc' } });
  }

  async setActive(actor: Actor, id: string, active: boolean) {
    const s = await this.prisma.maintenanceSchedule.findFirst({ where: { id, hotelId: actor.hotelId } });
    if (!s) throw new NotFoundException('Schedule not found');
    return this.prisma.maintenanceSchedule.update({ where: { id }, data: { active } });
  }

  /** Hourly: spawn maintenance tickets for due schedules and advance them. */
  @Cron('0 0 * * * *')
  async runDue(): Promise<void> {
    const due = await this.prisma.maintenanceSchedule.findMany({
      where: { active: true, nextRunAt: { lte: new Date() } },
    });
    for (const s of due) {
      try {
        await this.maintenance.registerIssue(systemActor(s.hotelId), {
          roomId: s.roomId ?? undefined,
          areaId: s.areaId ?? undefined,
          category: s.category,
          priority: s.priority,
          title: `[PM] ${s.title}`,
          description: `Scheduled preventive maintenance (${s.frequency}).`,
          source: MaintSource.PREVENTIVE,
        });
        await this.prisma.maintenanceSchedule.update({
          where: { id: s.id },
          data: { lastRunAt: new Date(), nextRunAt: new Date(Date.now() + (INTERVAL[s.frequency as ScheduleFrequency] ?? 30 * DAY)) },
        });
      } catch (e) {
        this.logger.error(`PM schedule ${s.id} failed: ${e}`);
      }
    }
  }

  // ---- Assets ----
  createAsset(
    actor: Actor,
    input: { name: string; category?: string; location?: string; serial?: string; purchaseDate?: Date; warrantyUntil?: Date },
  ) {
    return this.prisma.asset.create({ data: { hotelId: actor.hotelId, ...input } });
  }

  listAssets(hotelId: string) {
    return this.prisma.asset.findMany({ where: { hotelId }, orderBy: { name: 'asc' } });
  }

  async setAssetStatus(actor: Actor, id: string, status: AssetStatus) {
    const a = await this.prisma.asset.findFirst({ where: { id, hotelId: actor.hotelId } });
    if (!a) throw new NotFoundException('Asset not found');
    return this.prisma.asset.update({ where: { id }, data: { status } });
  }
}
