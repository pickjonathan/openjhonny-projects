import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class RefreshJwtStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      secretOrKey: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
      issuer: 'auth-service',
      audience: 'auth'
    });
  }

  validate(payload: any) {
    if (payload?.typ !== 'refresh') return null;
    return payload;
  }
}
