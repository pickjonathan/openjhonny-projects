# NestJS Auth Service Starter

Implements a starter auth service with:
- JWT access tokens
- JWT refresh tokens
- Refresh rotation (session replacement)
- Session revocation (logout)

## Next hardening steps
- Replace in-memory session store with Prisma/DB
- Keep refresh token hash in DB only
- Add reuse detection policy (revoke all sessions on replay)
- Add DTO validation decorators + global ValidationPipe
- Add rate limiting on /auth/login and /auth/refresh
