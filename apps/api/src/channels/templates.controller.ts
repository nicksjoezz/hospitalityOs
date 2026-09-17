import { Body, Controller, Get, Post } from '@nestjs/common';
import { z } from 'zod';
import { Role } from '@hospitalityos/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser, Roles, AuthUser } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

const templateSchema = z.object({
  name: z.string().min(1),
  category: z.string().default('UTILITY'),
  language: z.string().default('en'),
  body: z.string().min(1),
  status: z.string().default('PENDING'),
});

/** WhatsApp template registry (plan.md §8). Only approved templates are billable/sendable. */
@Roles(Role.OWNER, Role.MANAGER)
@Controller('channels/whatsapp/templates')
export class TemplatesController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(templateSchema)) dto: z.infer<typeof templateSchema>,
  ) {
    return this.prisma.whatsAppTemplate.create({
      data: { hotelId: user.hotelId, ...dto },
    });
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.prisma.whatsAppTemplate.findMany({
      where: { hotelId: user.hotelId },
      orderBy: { name: 'asc' },
    });
  }
}
