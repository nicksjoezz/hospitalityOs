import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { Actor } from '../common/actor';

export interface CreateGeneratorLogDto {
  generatorName?: string;
  runHoursStart: number;
  runHoursEnd: number;
  fuelAddedLiters?: number;
  fuelPricePerLiterMinor?: number;
  dieselConsumedLiters?: number;
  startedAt: string | Date;
  endedAt?: string | Date;
  notes?: string;
}

@Injectable()
export class GeneratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createLog(actor: Actor, dto: CreateGeneratorLogDto) {
    if (dto.runHoursEnd < dto.runHoursStart) {
      throw new BadRequestException('runHoursEnd cannot be less than runHoursStart');
    }

    const runHours = dto.runHoursEnd - dto.runHoursStart;
    const fuelPrice = dto.fuelPricePerLiterMinor ?? 130000; // e.g. N1,300/L default in kobo
    const fuelConsumed = dto.dieselConsumedLiters ?? (runHours * 28); // fallback estimate ~28L/hr for typical 250kVA generator
    const totalCost = Math.round(fuelConsumed * fuelPrice);

    const log = await this.prisma.generatorLog.create({
      data: {
        hotelId: actor.hotelId,
        generatorName: dto.generatorName ?? 'Main Generator',
        runHoursStart: dto.runHoursStart,
        runHoursEnd: dto.runHoursEnd,
        fuelAddedLiters: dto.fuelAddedLiters ?? 0,
        fuelPricePerLiterMinor: fuelPrice,
        dieselConsumedLiters: fuelConsumed,
        totalCostMinor: totalCost,
        loggedById: actor.id,
        startedAt: new Date(dto.startedAt),
        endedAt: dto.endedAt ? new Date(dto.endedAt) : null,
        notes: dto.notes,
      },
    });

    await this.audit.record({
      actor,
      action: 'generator.log.created',
      entity: 'GeneratorLog',
      entityId: log.id,
      after: log,
    });

    return log;
  }

  async listLogs(hotelId: string, limit = 50) {
    return this.prisma.generatorLog.findMany({
      where: { hotelId },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
  }

  async getMetrics(hotelId: string, from?: string, to?: string) {
    const startDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = to ? new Date(to) : new Date();

    const logs = await this.prisma.generatorLog.findMany({
      where: {
        hotelId,
        startedAt: { gte: startDate, lte: endDate },
      },
      orderBy: { startedAt: 'asc' },
    });

    let totalRunHours = 0;
    let totalDieselLiters = 0;
    let totalCostMinor = 0;
    let fuelAddedTotal = 0;
    const anomalies: { logId: string; reason: string; consumptionPerHour: number }[] = [];

    for (const log of logs) {
      const hours = Math.max(0, log.runHoursEnd - log.runHoursStart);
      totalRunHours += hours;
      totalDieselLiters += log.dieselConsumedLiters;
      totalCostMinor += log.totalCostMinor;
      fuelAddedTotal += log.fuelAddedLiters;

      // Anomaly detection: if consumption per hour > 45 liters/hr for typical hotel gen
      if (hours > 0) {
        const ratePerHour = log.dieselConsumedLiters / hours;
        if (ratePerHour > 45) {
          anomalies.push({
            logId: log.id,
            reason: `High diesel burn rate (${ratePerHour.toFixed(1)} L/h) detected. Possible fuel leakage or shrinkage.`,
            consumptionPerHour: Math.round(ratePerHour * 10) / 10,
          });
        }
      }
    }

    // Calculate Occupied Rooms in this period for CPOR
    const occupiedReservations = await this.prisma.reservation.count({
      where: {
        hotelId,
        status: { in: ['CHECKED_IN', 'CHECKED_OUT'] },
        checkInDate: { lte: endDate },
        checkOutDate: { gte: startDate },
      },
    });

    const roomNights = Math.max(1, occupiedReservations);
    const dieselCporMinor = Math.round(totalCostMinor / roomNights);
    const avgConsumptionPerHour = totalRunHours > 0 ? totalDieselLiters / totalRunHours : 0;

    return {
      period: { from: startDate.toISOString(), to: endDate.toISOString() },
      totalRunHours: Math.round(totalRunHours * 10) / 10,
      totalDieselLiters: Math.round(totalDieselLiters * 10) / 10,
      fuelAddedTotal: Math.round(fuelAddedTotal * 10) / 10,
      totalCostMinor,
      occupiedRoomNights: roomNights,
      dieselCporMinor,
      avgConsumptionPerHour: Math.round(avgConsumptionPerHour * 10) / 10,
      anomalies,
      logCount: logs.length,
    };
  }
}
