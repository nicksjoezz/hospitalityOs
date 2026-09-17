import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { Role } from '@hospitalityos/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentActor, CurrentUser, Roles, AuthUser } from '../common/decorators';
import { Actor } from '../common/actor';
import { UsersService } from './users.service';

const createSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(3),
  role: z.nativeEnum(Role),
  password: z.string().min(6),
  email: z.string().email().optional(),
  whatsappId: z.string().optional(),
  extraPermissions: z.array(z.string()).optional(),
  hourlyRate: z.number().int().nonnegative().optional(),
});
const updateSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  role: z.nativeEnum(Role).optional(),
  active: z.boolean().optional(),
  whatsappId: z.string().optional(),
  extraPermissions: z.array(z.string()).optional(),
  hourlyRate: z.number().int().nonnegative().optional(),
});

@Roles(Role.OWNER, Role.MANAGER)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  create(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(createSchema)) dto: z.infer<typeof createSchema>,
  ) {
    return this.users.create(actor, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.users.list(user.hotelId);
  }

  @Patch(':id')
  update(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSchema)) dto: z.infer<typeof updateSchema>,
  ) {
    return this.users.update(actor, id, dto);
  }

  @Post(':id/reset-password')
  resetPassword(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body('password') password: string,
  ) {
    return this.users.resetPassword(actor, id, password ?? '');
  }

  @Delete(':id')
  deactivate(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.users.deactivate(actor, id);
  }
}
