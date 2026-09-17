import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, AuthUser } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Notification feed (plan.md §12). Returns notifications addressed to the user
 * directly or to their role.
 */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('unread') unread?: string) {
    return this.prisma.notification.findMany({
      where: {
        hotelId: user.hotelId,
        OR: [{ userId: user.id }, { role: user.role as never }],
        ...(unread === 'true' ? { readAt: null } : {}),
      },
      orderBy: { at: 'desc' },
      take: 100,
    });
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
        OR: [{ userId: user.id }, { role: user.role as never }],
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}
