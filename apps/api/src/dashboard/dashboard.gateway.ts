import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { DomainEvents } from '@hospitalityos/shared';
import { authenticateSocket } from '../common/ws-auth';
import { AppConfig } from '../config/configuration';
import { DashboardService } from './dashboard.service';

/**
 * Pushes live dashboard updates over Socket.IO (plan.md §11.14). Clients join a
 * per-hotel room; whenever a state-changing domain event fires we recompute and
 * broadcast the snapshot to that hotel.
 */
@WebSocketGateway({ namespace: '/dashboard', cors: { origin: true } })
export class DashboardGateway implements OnGatewayConnection {
  private readonly logger = new Logger(DashboardGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly dashboard: DashboardService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /** Verify the JWT and join the caller's own hotel room (derived from the token). */
  handleConnection(client: Socket): void {
    const payload = authenticateSocket(client, this.jwt, this.config.get('JWT_ACCESS_SECRET', { infer: true }));
    if (!payload) {
      client.disconnect(true);
      return;
    }
    void client.join(`hotel:${payload.hotelId}`);
  }

  @OnEvent(DomainEvents.ReservationCheckedIn)
  @OnEvent(DomainEvents.ReservationCheckedOut)
  @OnEvent(DomainEvents.ReservationCreated)
  @OnEvent(DomainEvents.PaymentRecorded)
  @OnEvent(DomainEvents.HousekeepingTaskCreated)
  @OnEvent(DomainEvents.MaintenanceIssueRegistered)
  async onDomainChange(payload: { hotelId?: string }): Promise<void> {
    if (!payload?.hotelId || !this.server) return;
    try {
      const snapshot = await this.dashboard.snapshot(payload.hotelId);
      this.server.to(`hotel:${payload.hotelId}`).emit('dashboard:update', snapshot);
    } catch (e) {
      this.logger.warn(`Failed to broadcast dashboard update: ${e}`);
    }
  }
}
