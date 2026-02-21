import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { UsersService } from '../users/users.service';
import { SessionsService } from '../sessions/sessions.service';

const ACCESS_TTL_SEC = 15 * 60;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    private readonly sessions: SessionsService
  ) {}

  async login(email: string, password: string) {
    const user = await this.users.findByEmail(email);
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');

    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const refreshPlain = this.randomToken();
    const session = await this.sessions.createSession({ userId: user.id, refreshToken: refreshPlain, ttlMs: REFRESH_TTL_MS });

    return this.issueTokenPair(user.id, user.roles, session.id, refreshPlain);
  }

  async refresh(payload: { sub: string; sid: string; roles: string[] }, refreshToken: string) {
    await this.sessions.validateRefresh(payload.sid, refreshToken);

    const newRefresh = this.randomToken();
    const nextSession = await this.sessions.rotateSession(payload.sid, newRefresh, REFRESH_TTL_MS);

    return this.issueTokenPair(payload.sub, payload.roles, nextSession.id, newRefresh);
  }

  async logout(sessionId: string) {
    await this.sessions.revokeSession(sessionId);
    return { ok: true };
  }

  private issueTokenPair(userId: string, roles: string[], sessionId: string, _refreshPlain: string) {
    const accessToken = this.jwt.sign(
      { sub: userId, sid: sessionId, roles },
      { expiresIn: ACCESS_TTL_SEC, issuer: 'auth-service', audience: 'api' }
    );

    const refreshToken = this.jwt.sign(
      { sub: userId, sid: sessionId, roles, typ: 'refresh' },
      { expiresIn: Math.floor(REFRESH_TTL_MS / 1000), issuer: 'auth-service', audience: 'auth' }
    );

    return { accessToken, refreshToken, sessionId };
  }

  private randomToken() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}
