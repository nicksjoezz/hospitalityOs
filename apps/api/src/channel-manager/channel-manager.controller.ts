import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { ChannelType, Feature, Role } from '@hospitalityos/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentActor, CurrentUser, Public, RequireFeature, Roles, AuthUser } from '../common/decorators';
import { Actor } from '../common/actor';
import { AppConfig } from '../config/configuration';
import { ChannelManagerService } from './channel-manager.service';

const connectSchema = z.object({
  channel: z.nativeEnum(ChannelType),
  name: z.string().min(1),
  credentials: z.record(z.unknown()).optional(),
});
const otaSchema = z.object({
  hotelId: z.string().uuid(),
  externalId: z.string().min(1),
  guestName: z.string().min(1),
  guestPhone: z.string().optional(),
  guestEmail: z.string().email().optional(),
  roomTypeId: z.string().uuid(),
  checkIn: z.string().min(8),
  checkOut: z.string().min(8),
  adults: z.number().int().positive().optional(),
});

@RequireFeature(Feature.CHANNEL_MANAGER)
@Controller('channel-manager')
export class ChannelManagerController {
  constructor(
    private readonly channels: ChannelManagerService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @Roles(Role.OWNER, Role.MANAGER)
  @Post('connections')
  connect(@CurrentActor() actor: Actor, @Body(new ZodValidationPipe(connectSchema)) dto: z.infer<typeof connectSchema>) {
    return this.channels.connect(actor, dto);
  }

  @Get('connections')
  list(@CurrentUser() user: AuthUser) {
    return this.channels.list(user.hotelId);
  }

  @Roles(Role.OWNER, Role.MANAGER)
  @Post('connections/:id/push')
  push(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.channels.pushInventory(actor, id);
  }

  /**
   * Inbound OTA reservation webhook. Public (OTA servers call it); in production
   * secure with provider signature/IP allow-listing. Normalised "generic" body.
   */
  @Public()
  @Post(':channel/webhook')
  webhook(
    @Param('channel') channel: string,
    @Headers('x-webhook-secret') secret: string | undefined,
    @Body(new ZodValidationPipe(otaSchema)) dto: z.infer<typeof otaSchema>,
  ) {
    // If a shared secret is configured, require it (defends the public webhook).
    const expected = this.config.get('CHANNEL_WEBHOOK_SECRET', { infer: true });
    if (expected && secret !== expected) {
      throw new UnauthorizedException('Invalid channel webhook secret');
    }
    const upper = channel.toUpperCase();
    const ch = (Object.values(ChannelType) as string[]).includes(upper)
      ? (upper as ChannelType)
      : ChannelType.GENERIC;
    return this.channels.ingestReservation(dto.hotelId, ch, dto);
  }
}
