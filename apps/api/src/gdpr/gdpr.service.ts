import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { CryptoService } from '../common/crypto.service';
import { Actor } from '../common/actor';

/**
 * Data-subject rights (plan.md §14; GDPR Art. 15/17/20). Export a guest's data,
 * erase (anonymise) it while preserving financial records, and honour marketing
 * opt-out. Every action is audited.
 */
@Injectable()
export class GdprService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly crypto: CryptoService,
  ) {}

  /** Full export of everything tied to a guest (Art. 20 portability). */
  async export(actor: Actor, guestId: string) {
    const guest = await this.prisma.guest.findFirst({
      where: { id: guestId, hotelId: actor.hotelId },
    });
    if (!guest) throw new NotFoundException('Guest not found');

    const [reservations, loyalty, conversations, reviews, complaints] = await Promise.all([
      this.prisma.reservation.findMany({
        where: { hotelId: actor.hotelId, guestId },
        include: { payments: true, folio: true },
      }),
      this.prisma.loyaltyTransaction.findMany({ where: { hotelId: actor.hotelId, guestId } }),
      this.prisma.conversation.findMany({
        where: { hotelId: actor.hotelId, guestId },
        include: { messages: true },
      }),
      this.prisma.review.findMany({ where: { hotelId: actor.hotelId, guestId } }),
      this.prisma.complaint.findMany({ where: { hotelId: actor.hotelId, guestId } }),
    ]);

    await this.audit.record({
      actor,
      action: 'gdpr.export',
      entity: 'Guest',
      entityId: guestId,
      after: { exportedBy: actor.id },
    });

    return {
      exportedAt: new Date().toISOString(),
      guest: { ...guest, idNumber: this.crypto.decrypt(guest.idNumber) },
      reservations,
      loyaltyTransactions: loyalty,
      conversations,
      reviews,
      complaints,
    };
  }

  /** Anonymise the guest (Art. 17). Financial rows are retained but de-identified. */
  async erase(actor: Actor, guestId: string) {
    if (actor.role !== Role.OWNER) {
      throw new ForbiddenException('Only the OWNER may erase a guest');
    }
    const guest = await this.prisma.guest.findFirst({
      where: { id: guestId, hotelId: actor.hotelId },
    });
    if (!guest) throw new NotFoundException('Guest not found');

    const anon = `ERASED-${guestId.slice(0, 8)}`;
    const updated = await this.prisma.guest.update({
      where: { id: guestId },
      data: {
        name: 'Erased Guest',
        phone: anon,
        whatsappId: null,
        email: null,
        idType: null,
        idNumber: null,
        allergies: null,
        preferences: null,
        notes: null,
        birthday: null,
        optedInMarketing: false,
        anonymizedAt: new Date(),
      },
    });
    // Scrub message bodies tied to the guest's conversations.
    const convos = await this.prisma.conversation.findMany({
      where: { hotelId: actor.hotelId, guestId },
      select: { id: true },
    });
    if (convos.length > 0) {
      await this.prisma.message.updateMany({
        where: { conversationId: { in: convos.map((c) => c.id) } },
        data: { body: '[erased]' },
      });
    }
    await this.audit.record({
      actor,
      action: 'gdpr.erase',
      entity: 'Guest',
      entityId: guestId,
      after: { anonymizedAt: updated.anonymizedAt },
    });
    return { ok: true, anonymizedAt: updated.anonymizedAt };
  }

  async marketingOptOut(actor: Actor, guestId: string) {
    const guest = await this.prisma.guest.findFirst({
      where: { id: guestId, hotelId: actor.hotelId },
    });
    if (!guest) throw new NotFoundException('Guest not found');
    await this.prisma.guest.update({
      where: { id: guestId },
      data: { optedInMarketing: false },
    });
    await this.audit.record({
      actor,
      action: 'gdpr.marketing_opt_out',
      entity: 'Guest',
      entityId: guestId,
    });
    return { ok: true };
  }
}
