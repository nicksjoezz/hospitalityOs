import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Feature, IncidentStatus, Role, Severity } from '@hospitalityos/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentActor, CurrentUser, RequireFeature, Roles, AuthUser } from '../common/decorators';
import { Actor } from '../common/actor';
import { SecurityService } from './security.service';

const visitorSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  purpose: z.string().optional(),
  hostRoomId: z.string().uuid().optional(),
});
const incidentSchema = z.object({
  type: z.string().min(1),
  severity: z.nativeEnum(Severity).optional(),
  location: z.string().optional(),
  description: z.string().min(1),
  photoUrls: z.array(z.string()).optional(),
});
const incidentStatusSchema = z.object({
  status: z.nativeEnum(IncidentStatus),
  resolutionNote: z.string().optional(),
});
const handoverSchema = z.object({
  toUserId: z.string().uuid(),
  notes: z.string().min(1),
  openItems: z.unknown().optional(),
});

@RequireFeature(Feature.SECURITY_REPORTS)
@Roles(Role.OWNER, Role.MANAGER, Role.SECURITY)
@Controller('security')
export class SecurityController {
  constructor(private readonly security: SecurityService) {}

  @Post('visitors')
  logVisitor(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(visitorSchema)) dto: z.infer<typeof visitorSchema>,
  ) {
    return this.security.logVisitor(actor, dto);
  }

  @Post('visitors/:id/checkout')
  checkoutVisitor(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.security.checkoutVisitor(actor, id);
  }

  @Get('visitors')
  visitors(@CurrentUser() user: AuthUser, @Query('active') active?: string) {
    return this.security.listVisitors(user.hotelId, active === 'true');
  }

  @Post('incidents')
  createIncident(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(incidentSchema)) dto: z.infer<typeof incidentSchema>,
  ) {
    return this.security.createIncident(actor, dto);
  }

  @Patch('incidents/:id')
  updateIncident(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(incidentStatusSchema))
    dto: z.infer<typeof incidentStatusSchema>,
  ) {
    return this.security.updateIncident(actor, id, dto.status, dto.resolutionNote);
  }

  @Get('incidents')
  incidents(@CurrentUser() user: AuthUser, @Query('status') status?: IncidentStatus) {
    return this.security.listIncidents(user.hotelId, status);
  }

  @Post('handovers')
  createHandover(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(handoverSchema)) dto: z.infer<typeof handoverSchema>,
  ) {
    return this.security.createHandover(actor, dto);
  }

  @Get('handovers')
  handovers(@CurrentUser() user: AuthUser) {
    return this.security.listHandovers(user.hotelId);
  }
}
