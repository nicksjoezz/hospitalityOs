import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { Role } from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { Actor } from '../common/actor';

const publicSelect = {
  id: true,
  name: true,
  phone: true,
  email: true,
  role: true,
  active: true,
  whatsappId: true,
  extraPermissions: true,
  lastSeenAt: true,
} as const;

/** Staff account management (create logins, roles, reset password, deactivate). */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    actor: Actor,
    input: {
      name: string;
      phone: string;
      role: Role;
      password: string;
      email?: string;
      whatsappId?: string;
      extraPermissions?: string[];
    },
  ) {
    const existing = await this.prisma.user.findFirst({
      where: { hotelId: actor.hotelId, phone: input.phone },
    });
    if (existing) throw new BadRequestException('A user with that phone already exists');
    const passwordHash = await argon2.hash(input.password);
    const user = await this.prisma.user.create({
      data: {
        hotelId: actor.hotelId,
        name: input.name,
        phone: input.phone,
        role: input.role,
        email: input.email,
        whatsappId: input.whatsappId,
        extraPermissions: input.extraPermissions ?? [],
        passwordHash,
      },
      select: publicSelect,
    });
    await this.audit.record({
      actor,
      action: 'user.create',
      entity: 'User',
      entityId: user.id,
      after: { name: user.name, role: user.role },
    });
    return user;
  }

  list(hotelId: string) {
    return this.prisma.user.findMany({
      where: { hotelId, deletedAt: null },
      select: publicSelect,
      orderBy: { name: 'asc' },
    });
  }

  private async ownedUser(actor: Actor, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, hotelId: actor.hotelId, deletedAt: null },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async update(
    actor: Actor,
    id: string,
    data: { name?: string; email?: string; role?: Role; active?: boolean; extraPermissions?: string[]; whatsappId?: string },
  ) {
    await this.ownedUser(actor, id);
    const user = await this.prisma.user.update({ where: { id }, data, select: publicSelect });
    await this.audit.record({
      actor,
      action: 'user.update',
      entity: 'User',
      entityId: id,
      after: data,
    });
    return user;
  }

  async resetPassword(actor: Actor, id: string, newPassword: string) {
    await this.ownedUser(actor, id);
    if (newPassword.length < 6) throw new BadRequestException('Password too short');
    const passwordHash = await argon2.hash(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { passwordHash } }),
      // Revoke active sessions so the old password's tokens can't refresh.
      this.prisma.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.audit.record({
      actor,
      action: 'user.reset_password',
      entity: 'User',
      entityId: id,
    });
    return { ok: true };
  }

  async deactivate(actor: Actor, id: string) {
    const user = await this.ownedUser(actor, id);
    if (user.role === Role.OWNER) {
      const owners = await this.prisma.user.count({
        where: { hotelId: actor.hotelId, role: Role.OWNER, active: true, deletedAt: null },
      });
      if (owners <= 1) throw new BadRequestException('Cannot deactivate the last owner');
    }
    await this.prisma.user.update({ where: { id }, data: { active: false } });
    await this.prisma.session.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.record({
      actor,
      action: 'user.deactivate',
      entity: 'User',
      entityId: id,
    });
    return { ok: true };
  }
}
