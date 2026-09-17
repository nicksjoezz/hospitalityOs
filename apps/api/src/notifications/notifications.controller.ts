import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, AuthUser, Roles } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

/**
 * Notification feed & dispatch (plan.md §12).
 * Returns notifications addressed to the user directly, to their role, or broadcast to all.
 */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('unread') unread?: string) {
    return this.prisma.notification.findMany({
      where: {
        hotelId: user.hotelId,
        OR: [
          { userId: user.id },
          { role: user.role as never },
          { role: null, userId: null },
        ],
        ...(unread === 'true' ? { readAt: null } : {}),
      },
      orderBy: { at: 'desc' },
      take: 100,
    });
  }

  @Roles(Role.OWNER, Role.MANAGER)
  @Post()
  async sendAlert(
    @CurrentUser() user: AuthUser,
    @Body() dto: { role?: string; userId?: string; title: string; body: string; type?: string },
  ) {
    if (!dto.title?.trim() || !dto.body?.trim()) {
      throw new BadRequestException('Alert title and message body are required.');
    }
    const targetRole = dto.role && dto.role !== 'ALL' ? (dto.role as Role) : null;
    const notif = await this.prisma.notification.create({
      data: {
        hotelId: user.hotelId,
        userId: dto.userId || null,
        role: targetRole,
        type: dto.type || 'alert.notice',
        title: dto.title.trim(),
        body: dto.body.trim(),
      },
    });
    return notif;
  }

  @Post(':id/read')
  async markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.prisma.notification.updateMany({
      where: { id, hotelId: user.hotelId },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  @Post('read-all')
  async markAllRead(@CurrentUser() user: AuthUser) {
    await this.prisma.notification.updateMany({
      where: {
        hotelId: user.hotelId,
        OR: [
          { userId: user.id },
          { role: user.role as never },
          { role: null, userId: null },
        ],
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}
