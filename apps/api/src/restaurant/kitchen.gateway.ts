import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { DomainEvents } from '@hospitalityos/shared';
import { authenticateSocket } from '../common/ws-auth';
import { AppConfig } from '../config/configuration';

/**
 * Prep-station display feed (plan.md §11.4–§11.5). Pushes live order tickets to
 * the KITCHEN and BAR screens separately over Socket.IO — bar is handled apart
 * from the kitchen. Clients join a per-hotel room and listen for their station's
 * event (`kitchen:order` or `bar:order`).
 */
@WebSocketGateway({ namespace: '/kitchen', cors: { origin: true } })
export class KitchenGateway implements OnGatewayConnection {
  private readonly logger = new Logger(KitchenGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  handleConnection(client: Socket): void {
    const payload = authenticateSocket(client, this.jwt, this.config.get('JWT_ACCESS_SECRET', { infer: true }));
    if (!payload) {
      client.disconnect(true);
      return;
    }
    void client.join(`hotel:${payload.hotelId}`);
  }

  @OnEvent(DomainEvents.KitchenOrderUpdate)
  onOrderUpdate(payload: { hotelId?: string; station?: 'kitchen' | 'bar'; order: unknown }): void {
    if (!payload?.hotelId || !this.server) return;
    const event = payload.station === 'bar' ? 'bar:order' : 'kitchen:order';
    this.server.to(`hotel:${payload.hotelId}`).emit(event, payload.order);
  }
}
