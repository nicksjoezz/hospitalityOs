import { Controller, Get, Query } from '@nestjs/common';
import { Role } from '@hospitalityos/shared';
import { CurrentUser, Roles, AuthUser } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

/** Read-only audit log viewer (plan.md §15). OWNER/MANAGER + ACCOUNTANT (auditor). */
@Roles(Role.OWNER, Role.MANAGER, Role.ACCOUNTANT)
@Controller('audit')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('actorId') actorId?: string,
    @Query('entity') entity?: string,
    @Query('entityId') entityId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const take = Math.min(Number(limit) || 50, 200);
    return this.prisma.auditLog.findMany({
      where: {
        hotelId: user.hotelId,
        ...(actorId ? { actorId } : {}),
        ...(entity ? { entity } : {}),
        ...(entityId ? { entityId } : {}),
        ...(from || to
          ? { at: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
          : {}),
      },
      orderBy: { at: 'desc' },
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }
}
