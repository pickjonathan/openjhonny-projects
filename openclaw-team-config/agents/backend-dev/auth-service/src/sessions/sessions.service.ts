import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';

type Session = {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt?: Date;
  replacedBySessionId?: string;
};

@Injectable()
export class SessionsService {
  private readonly sessions = new Map<string, Session>();

  hashRefreshToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async createSession(params: { userId: string; refreshToken: string; ttlMs: number }): Promise<Session> {
    const id = crypto.randomUUID();
    const s: Session = {
      id,
      userId: params.userId,
      refreshTokenHash: this.hashRefreshToken(params.refreshToken),
      expiresAt: new Date(Date.now() + params.ttlMs)
    };
    this.sessions.set(id, s);
    return s;
  }

  async validateRefresh(sessionId: string, refreshToken: string): Promise<Session> {
    const s = this.sessions.get(sessionId);
    if (!s || s.revokedAt || s.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Invalid session');
    }
    if (s.refreshTokenHash !== this.hashRefreshToken(refreshToken)) {
      throw new UnauthorizedException('Refresh token mismatch');
    }
    return s;
  }

  async rotateSession(oldSessionId: string, newRefreshToken: string, ttlMs: number): Promise<Session> {
    const oldS = this.sessions.get(oldSessionId);
    if (!oldS) throw new UnauthorizedException('Session not found');

    oldS.revokedAt = new Date();
    const next = await this.createSession({ userId: oldS.userId, refreshToken: newRefreshToken, ttlMs });
    oldS.replacedBySessionId = next.id;
    this.sessions.set(oldSessionId, oldS);
    return next;
  }

  async revokeSession(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    s.revokedAt = new Date();
    this.sessions.set(sessionId, s);
  }
}
