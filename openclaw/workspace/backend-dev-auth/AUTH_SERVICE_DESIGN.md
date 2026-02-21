# Auth Service Design (NestJS + JWT + Refresh Tokens)

## Objective
Design a secure, scalable authentication service for a NestJS backend using short-lived access tokens and rotating refresh tokens.

## Scope
- Email/password authentication (extensible to OAuth later)
- JWT access tokens
- Refresh token rotation + reuse detection
- Role-based authorization support
- Session revocation and logout

## Non-Goals
- UI implementation
- Full IAM provider integration
- Enterprise SSO setup (future extension)

---

## High-Level Architecture

### Components
- `AuthModule`: login, refresh, logout, token issuance
- `UsersModule`: user profile + credential lookup
- `SessionsModule`: refresh session persistence and revocation
- `CryptoService`: password hashing + token hashing
- `JwtStrategy` / `RefreshJwtStrategy`: guards for access/refresh flows

### Token Model
- **Access token**
  - JWT, short TTL (e.g., 10–15 min)
  - Stored client-side in memory or secure cookie
  - Contains: `sub`, `sid`, `roles`, `iat`, `exp`, `iss`, `aud`
- **Refresh token**
  - Long TTL (e.g., 30 days)
  - Opaque random token or JWT with JTI
  - Rotated on each refresh
  - Persist only a **hash** in DB

---

## Data Model (Prisma-style)

```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  isActive     Boolean  @default(true)
  roles        String[]
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  sessions     Session[]
}

model Session {
  id                 String   @id @default(cuid())
  userId             String
  refreshTokenHash   String
  userAgent          String?
  ipAddress          String?
  expiresAt          DateTime
  revokedAt          DateTime?
  replacedBySessionId String?
  createdAt          DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
}
```

---

## API Endpoints

### `POST /auth/login`
- Input: email, password
- Validate credentials
- Create session
- Return access + refresh token

### `POST /auth/refresh`
- Input: refresh token
- Validate signature/format and DB hash
- Detect reuse (token already rotated/revoked)
- Rotate session:
  1. Revoke old session
  2. Create new session with new refresh hash
  3. Issue new access + refresh

### `POST /auth/logout`
- Authenticated via access token (or refresh token endpoint variant)
- Revoke current session (or all user sessions)

### `POST /auth/logout-all`
- Revoke all active sessions for `sub`

---

## Security Controls

1. Password hashing: `argon2id` (preferred) or `bcrypt` with strong cost.
2. Refresh token hashing in DB (never store plaintext refresh tokens).
3. Rotation on every refresh (one-time-use refresh semantics).
4. Reuse detection:
   - If old refresh token seen after rotation, revoke all sessions for that user/device policy.
5. JWT hardening:
   - Set `iss`, `aud`, strict algorithm allowlist, short access TTL.
6. Transport/cookies:
   - Use `HttpOnly`, `Secure`, `SameSite=Lax/Strict` if cookie-based.
7. Rate limits:
   - Per IP + per account on login/refresh routes.
8. Observability:
   - Audit logs for login success/fail, refresh, logout, revocation events.
9. Secrets management:
   - Load signing keys from env/secret manager; support key rotation via `kid`.

---

## NestJS Structure

```text
src/
  auth/
    auth.module.ts
    auth.controller.ts
    auth.service.ts
    dto/
      login.dto.ts
      refresh.dto.ts
    guards/
      jwt-auth.guard.ts
      refresh-auth.guard.ts
    strategies/
      jwt.strategy.ts
      refresh.strategy.ts
  sessions/
    sessions.module.ts
    sessions.service.ts
    sessions.repository.ts
  users/
    users.module.ts
    users.service.ts
```

---

## Core Flow (Login)

1. `AuthController.login()` receives credentials.
2. `AuthService.validateUser()` checks email + password hash.
3. `SessionsService.createSession()` stores `hash(refreshToken)` and metadata.
4. `AuthService.signAccessToken()` and `AuthService.signRefreshToken()` issue tokens.
5. Return tokens + user claims.

## Core Flow (Refresh)

1. Parse refresh token and identify session (`sid` / session lookup).
2. Verify token validity and hash equality.
3. If invalid or replayed -> trigger reuse response policy.
4. Revoke old session, create replacement session.
5. Return new access + refresh.

---

## Suggested Config Defaults
- Access token TTL: `15m`
- Refresh token TTL: `30d`
- Access signing key: asymmetric (`RS256`) preferred
- Refresh signing key: separate key/secret
- Clock skew tolerance: 30–60s max

---

## Testing Plan

### Unit
- Password validation and token signing
- Refresh rotation logic and reuse detection

### Integration
- Login -> refresh -> refresh old token (replay) -> verify revocation
- Logout and logout-all session invalidation

### Security/Negative
- Brute-force and rate-limit tests
- Expired token handling
- Invalid issuer/audience rejection

---

## Rollout Plan
1. Implement module + DB schema + migrations.
2. Add guards and route protection.
3. Ship with feature flag in staging.
4. Run auth security checklist + penetration tests.
5. Enable in production with monitoring dashboards and alerting.

---

## Future Enhancements
- OAuth providers (Google/GitHub)
- MFA (TOTP/WebAuthn)
- Device session management UI
- Risk-based auth (new geo/device checks)
