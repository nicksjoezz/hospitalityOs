import { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';

export interface WsPrincipal {
  sub: string;
  hotelId: string;
  role: string;
}

/**
 * Authenticate a Socket.IO client from its handshake access token
 * (`auth.token` or `?token=`). Returns the verified principal or null.
 * The hotel room a client may join is derived from the token, not the query —
 * so a client can only subscribe to its own hotel's live feed.
 */
export function authenticateSocket(
  client: Socket,
  jwt: JwtService,
  secret: string,
): WsPrincipal | null {
  const raw =
    (client.handshake.auth?.token as string | undefined) ??
    (client.handshake.query?.token as string | undefined);
  if (!raw) return null;
  const token = raw.startsWith('Bearer ') ? raw.slice(7) : raw;
  try {
    return jwt.verify<WsPrincipal>(token, { secret });
  } catch {
    return null;
  }
}
