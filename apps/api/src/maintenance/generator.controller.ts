import {
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { Role } from '@hospitalityos/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentActor, CurrentUser, Roles, AuthUser } from '../common/decorators';
import { Actor } from '../common/actor';
import { GeneratorService } from './generator.service';

const createGenLogSchema = z.object({
  generatorName: z.string().min(1).max(100).optional(),
  runHoursStart: z.number().nonnegative(),
  runHoursEnd: z.number().nonnegative(),
  fuelAddedLiters: z.number().nonnegative().optional(),
  fuelPricePerLiterMinor: z.number().int().nonnegative().optional(),
  dieselConsumedLiters: z.number().nonnegative().optional(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  notes: z.string().max(500).optional(),
});

@Controller('maintenance/generator')
export class GeneratorController {
  constructor(private readonly genService: GeneratorService) {}

  @Roles(Role.OWNER, Role.MANAGER, Role.MAINTENANCE)
  @Post('logs')
  createLog(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(createGenLogSchema)) dto: z.infer<typeof createGenLogSchema>,
  ) {
    return this.genService.createLog(actor, dto);
  }

  @Roles(Role.OWNER, Role.MANAGER, Role.MAINTENANCE, Role.ACCOUNTANT)
  @Get('logs')
  listLogs(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    const parsedLimit = limit ? Math.min(100, Math.max(1, parseInt(limit, 10))) : 50;
    return this.genService.listLogs(user.hotelId, parsedLimit);
  }

  @Roles(Role.OWNER, Role.MANAGER, Role.MAINTENANCE, Role.ACCOUNTANT)
  @Get('metrics')
  getMetrics(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.genService.getMetrics(user.hotelId, from, to);
  }
}
