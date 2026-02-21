# Backend Dev Agent — OpenClaw Operating Manual

## Recommended Skills
Use these skills by default for this role:
- `obra/superpowers/systematic-debugging`
- `obra/superpowers/test-driven-development`
- `better-auth/skills/better-auth-best-practices`

You are the backend-dev specialist in the OpenClaw multi-agent team.
Your scope: design, implement, test, and maintain backend services using NestJS (TypeScript) and FastAPI (Python), backed by PostgreSQL and Redis, with production-grade auth, validation, caching, and observability.

---

## 1. Quick Commands

```bash
# --- Package Management ---
npm install <package>                        # Install Node.js dependency
pip install <package>                        # Install Python dependency (use venv)
source /home/node/venv/bin/activate          # Activate Python virtual environment

# --- Running Services ---
npm run start                                # Start NestJS application
npm run start:dev                            # Start NestJS in watch mode
uvicorn main:app --host 0.0.0.0 --port 8000 --reload  # Start FastAPI dev server
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker  # FastAPI production server

# --- Testing ---
npm test                                     # Run Jest test suite
npm run test:cov                             # Jest with coverage report
npm run test:e2e                             # End-to-end tests
pytest -q                                    # Run pytest suite
pytest --cov=app --cov-report=term-missing   # Pytest with coverage

# --- Linting & Formatting ---
npm run lint                                 # ESLint check
npm run lint -- --fix                        # ESLint auto-fix
npm run format                               # Prettier formatting
ruff check . --fix                           # Python linting with Ruff
ruff format .                                # Python formatting with Ruff

# --- Database ---
npm run migration:generate -- -n MigrationName  # Generate TypeORM migration
npm run migration:run                        # Apply pending migrations
npm run migration:revert                     # Revert last migration
npx prisma migrate dev --name migration_name # Prisma migration (if used)
npx prisma generate                          # Regenerate Prisma client
alembic revision --autogenerate -m "msg"     # Alembic migration (FastAPI)
alembic upgrade head                         # Apply Alembic migrations

# --- Infrastructure ---
curl http://localhost:3000/health             # NestJS health probe
curl http://localhost:8000/health             # FastAPI health probe
openclaw status                               # OpenClaw platform status
openclaw gateway status                       # Gateway connectivity check
redis-cli ping                                # Redis connectivity check
psql -U $DB_USER -d $DB_NAME -c "SELECT 1"   # PostgreSQL connectivity check

# --- OpenClaw Tools ---
# exec, bash, web_fetch, web_search, browser, cron, message, image, sessions_spawn, gateway
```

---

## 2. Project Map

```
/home/node/.openclaw/workspace/
  AGENTS.md                              # Team-wide agent instructions
  backend-dev-AGENTS.md                  # This file
  MEMORY.md                              # Long-term memory store
  memory/
    YYYY-MM-DD.md                        # Daily operational memory

  openclaw-team-config/
    openclaw.team.example.json           # Team configuration template
    agents/                              # Per-agent config definitions

  agent_marketplace_poc/
    v2/
      server_v21.js                      # Reference: API + event flow patterns
      marketplace_v2.js                  # Reference: policy-aware processing
    CLOUD_CODE.md                        # Reference: engineering handoff style

  investment_app/                        # Investment application project
  investment_strategy/                   # Strategy computation modules
  stock-price-app/                       # Stock price service

# --- Typical NestJS Project Layout ---
src/
  main.ts                               # Application bootstrap
  app.module.ts                          # Root module
  common/
    decorators/                          # Custom decorators (@CurrentUser, @Roles)
    filters/                             # Exception filters (HttpExceptionFilter)
    guards/                              # Auth guards (JwtAuthGuard, RolesGuard)
    interceptors/                        # Logging, transform, cache interceptors
    pipes/                               # Validation pipes (ParseIntPipe, custom)
    middleware/                          # Rate limiting, request logging
    dto/                                 # Shared DTOs
  modules/
    auth/
      auth.module.ts
      auth.controller.ts
      auth.service.ts
      strategies/                        # Passport strategies (jwt.strategy.ts)
      dto/                               # LoginDto, RegisterDto, TokenDto
    users/
      users.module.ts
      users.controller.ts
      users.service.ts
      entities/user.entity.ts
      dto/
  config/
    database.config.ts
    redis.config.ts
    jwt.config.ts

# --- Typical FastAPI Project Layout ---
app/
  main.py                               # Application entry, lifespan events
  config.py                             # Settings via pydantic-settings
  dependencies.py                       # Shared Depends() factories
  routers/
    auth.py                             # /auth endpoints
    users.py                            # /users endpoints
  models/
    user.py                             # SQLAlchemy / SQLModel ORM models
  schemas/
    user.py                             # Pydantic request/response schemas
  services/
    auth_service.py                     # Business logic layer
    user_service.py
  middleware/
    rate_limit.py
    logging.py
  utils/
    security.py                         # JWT encode/decode, password hashing
    cache.py                            # Redis cache helpers
```

---

## 3. Tech Stack

| Layer           | NestJS Stack                        | FastAPI Stack                         |
|-----------------|-------------------------------------|---------------------------------------|
| Runtime         | Node.js v22+, TypeScript 5.x       | Python 3.12+, uvicorn/gunicorn       |
| Framework       | NestJS 10+                          | FastAPI 0.110+                        |
| Validation      | class-validator, class-transformer  | Pydantic v2                           |
| ORM             | TypeORM or Prisma                   | SQLAlchemy 2.0 / SQLModel             |
| Database        | PostgreSQL 15+                      | PostgreSQL 15+                        |
| Cache           | ioredis / @nestjs/cache-manager     | redis-py / aioredis                   |
| Auth            | Passport.js, @nestjs/jwt            | python-jose, passlib                  |
| Testing         | Jest, supertest                     | pytest, httpx (AsyncClient)           |
| Docs            | @nestjs/swagger (OpenAPI)           | Built-in OpenAPI + Swagger UI         |
| Migrations      | TypeORM CLI / Prisma Migrate        | Alembic                               |
| Observability   | OpenTelemetry, pino/winston         | OpenTelemetry, structlog/loguru       |
| Linting         | ESLint, Prettier                    | Ruff                                  |

---

## 4. Standards

### Always Do

1. **Validate all input at the boundary.** Use DTOs with class-validator decorators (NestJS) or Pydantic models (FastAPI) on every endpoint. Never trust raw request data.
2. **Use dependency injection.** Register services in modules (NestJS) or use `Depends()` factories (FastAPI). Never instantiate services manually.
3. **Separate business logic from controllers/routers.** Controllers handle HTTP concerns; services handle domain logic. Keep controllers thin.
4. **Write migrations for every schema change.** Never modify the database manually. Every column add/drop/alter goes through a versioned migration file.
5. **Return consistent error responses.** Use a standard envelope: `{ statusCode, message, error }` (NestJS) or `{ detail }` (FastAPI). Map exceptions to proper HTTP status codes.
6. **Set explicit DB indexes.** Add indexes on columns used in WHERE, JOIN, and ORDER BY clauses. Use `EXPLAIN ANALYZE` to verify query plans.
7. **Use parameterized queries.** Never concatenate user input into SQL strings. Always use ORM query builders or parameterized statements.
8. **Hash passwords with bcrypt (cost >= 12).** Never store plaintext passwords. Use `bcrypt.hash()` (Node) or `passlib.hash.bcrypt` (Python).
9. **Log structured JSON.** Include `requestId`, `userId`, `method`, `path`, `statusCode`, `duration` in every log line. Never log secrets, tokens, or PII.
10. **Run tests before reporting completion.** Every change must pass `npm test` or `pytest -q` with zero failures.

### Never Do

1. **Never expose stack traces in production responses.** Use exception filters to catch unhandled errors and return generic messages.
2. **Never store JWT secrets in source code.** Load from environment variables; validate their presence at startup.
3. **Never use `any` type in TypeScript.** Define proper interfaces and types. Use `unknown` if the type is genuinely unknown.
4. **Never skip database migrations.** Do not use `synchronize: true` in TypeORM production config. It causes data loss.
5. **Never return database entities directly.** Always map to response DTOs to control which fields are exposed.
6. **Never use `SELECT *` in production queries.** Select only the columns you need. This reduces I/O and prevents leaking new columns.
7. **Never disable CORS without explicit approval.** Configure allowed origins, methods, and headers explicitly.
8. **Never commit `.env` files or secrets.** Use `.env.example` for templates; load secrets from environment or a vault.
9. **Never catch exceptions silently.** Every catch block must log or rethrow. Empty catch blocks hide bugs.
10. **Never bypass rate limiting in production.** Always apply throttling to public endpoints.

---

## 5. Golden Examples

### 5.1 NestJS Controller + Service + DTO

```typescript
// dto/create-user.dto.ts
import { IsEmail, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}

// users.controller.ts
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.create(dto);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<UserResponseDto> {
    return this.usersService.findOneOrFail(id);
  }
}

// users.service.ts
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
  ) {}

  async create(dto: CreateUserDto): Promise<UserResponseDto> {
    const hashedPassword = await bcrypt.hash(dto.password, 12);
    const user = this.repo.create({ ...dto, password: hashedPassword });
    const saved = await this.repo.save(user);
    return plainToInstance(UserResponseDto, saved, { excludeExtraneousValues: true });
  }

  async findOneOrFail(id: string): Promise<UserResponseDto> {
    const user = await this.repo.findOneByOrFail({ id });
    return plainToInstance(UserResponseDto, user, { excludeExtraneousValues: true });
  }
}
```

### 5.2 FastAPI Router + Service + Pydantic Schema

```python
# schemas/user.py
from pydantic import BaseModel, EmailStr, Field

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)

class UserResponse(BaseModel):
    id: str
    email: EmailStr
    model_config = {"from_attributes": True}

# services/user_service.py
from passlib.hash import bcrypt

class UserService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: UserCreate) -> User:
        hashed = bcrypt.hash(data.password)
        user = User(email=data.email, password=hashed)
        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)
        return user

# routers/users.py
from fastapi import APIRouter, Depends, HTTPException, status

router = APIRouter(prefix="/users", tags=["users"])

@router.post("/", status_code=status.HTTP_201_CREATED, response_model=UserResponse)
async def create_user(data: UserCreate, db: AsyncSession = Depends(get_db)):
    service = UserService(db)
    return await service.create(data)

@router.get("/{user_id}", response_model=UserResponse)
async def get_user(user_id: str, db: AsyncSession = Depends(get_db),
                   current_user: User = Depends(get_current_user)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
```

### 5.3 JWT Auth with Refresh Token Rotation

```typescript
// auth.service.ts — NestJS refresh token rotation
@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    @InjectRepository(RefreshToken) private readonly tokenRepo: Repository<RefreshToken>,
  ) {}

  async login(dto: LoginDto): Promise<TokenPairDto> {
    const user = await this.usersService.validateCredentials(dto.email, dto.password);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    return this.generateTokenPair(user.id);
  }

  async refresh(oldToken: string): Promise<TokenPairDto> {
    const stored = await this.tokenRepo.findOneBy({ token: oldToken, revoked: false });
    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    // Revoke old token (rotation)
    stored.revoked = true;
    await this.tokenRepo.save(stored);
    return this.generateTokenPair(stored.userId);
  }

  private async generateTokenPair(userId: string): Promise<TokenPairDto> {
    const accessToken = this.jwtService.sign({ sub: userId }, { expiresIn: '15m' });
    const refreshToken = crypto.randomUUID();
    await this.tokenRepo.save({
      token: refreshToken, userId, expiresAt: addDays(new Date(), 7),
    });
    return { accessToken, refreshToken };
  }
}
```

### 5.4 Redis Caching Pattern

```typescript
// NestJS cache interceptor for specific routes
@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ProductResponseDto> {
    const cacheKey = `product:${id}`;
    const cached = await this.cache.get<ProductResponseDto>(cacheKey);
    if (cached) return cached;

    const product = await this.productsService.findOneOrFail(id);
    await this.cache.set(cacheKey, product, 300_000); // 5 min TTL
    return product;
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto) {
    const result = await this.productsService.update(id, dto);
    await this.cache.del(`product:${id}`); // Invalidate on write
    return result;
  }
}
```

### 5.5 Rate Limiting Setup

```typescript
// NestJS throttler configuration
// app.module.ts
@Module({
  imports: [
    ThrottlerModule.forRoot([{
      name: 'short',  ttl: 1000,   limit: 3,    // 3 req/sec
    }, {
      name: 'medium', ttl: 10000,  limit: 20,   // 20 req/10sec
    }, {
      name: 'long',   ttl: 60000,  limit: 100,  // 100 req/min
    }]),
  ],
})
export class AppModule {}

// Apply globally via guard
// main.ts
app.useGlobalGuards(new ThrottlerGuard(reflector));
```

---

## 6. Legacy / Avoid

| Anti-Pattern | Why It Is Harmful | Use Instead |
|---|---|---|
| `synchronize: true` in TypeORM prod | Silently drops columns/tables on schema drift | Explicit migrations with `migration:run` |
| Storing sessions in memory | Lost on restart, breaks horizontal scaling | Redis-backed sessions |
| `res.json()` in NestJS controllers | Bypasses interceptors and serialization pipes | Return values from controller methods |
| Bare `try/catch` with `console.log` | Swallows context, no structured data | Exception filters + structured logger |
| Global `ValidationPipe` without `whitelist` | Allows extra fields to pass through | `new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` |
| Hardcoded localhost URLs | Breaks in Docker/K8s | Environment variables for all host/port config |
| `any` type assertions | Defeats type safety | Proper interfaces/generics |
| `SELECT *` queries | Over-fetches data, leaks new columns | Explicit column selection |
| Circular module dependencies | Causes runtime injection errors | Restructure with shared modules or forwardRef as last resort |
| `.env` files committed to repo | Credential exposure | `.env.example` templates, secrets from vault/env |

---

## 7. Testing & Verification

### Unit Tests
- Test services in isolation with mocked repositories and dependencies.
- One test file per service: `users.service.spec.ts` alongside `users.service.ts`.
- Cover the happy path, input validation edge cases, and error branches.
- Mock external calls (database, Redis, HTTP) — do not hit real services.

### Integration Tests
- Test controllers with real NestJS test modules using `@nestjs/testing`.
- Use supertest (NestJS) or httpx AsyncClient (FastAPI) for HTTP-level assertions.
- Run against a test database (Docker Compose or testcontainers).
- Verify response status codes, body structure, and headers.

### Database Tests
- Run migrations on a fresh test DB before the suite.
- Use transactions that roll back after each test for isolation.
- Verify indexes exist: `SELECT indexname FROM pg_indexes WHERE tablename = 'users';`

### Verification Checklist
```
[ ] All existing tests pass (npm test / pytest -q)
[ ] New code has corresponding tests
[ ] Coverage does not decrease
[ ] Lint passes with zero warnings (npm run lint / ruff check .)
[ ] Migrations apply cleanly on empty DB
[ ] Health endpoint responds 200
[ ] API responses match OpenAPI spec
[ ] No secrets in source code (grep -r "password\|secret\|token" --include="*.ts" --include="*.py")
```

---

## 8. PR / Commit Workflow

### Branch Naming
```
feat/backend-<short-description>    # New feature
fix/backend-<short-description>     # Bug fix
refactor/backend-<description>      # Code restructuring
chore/backend-<description>         # Tooling, deps, config
```

### Commit Message Format
```
<type>(backend): <imperative summary under 72 chars>

<optional body explaining WHY, not WHAT>

Refs: #<issue-number>
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`

### Definition of Done
- [ ] Code compiles/type-checks with zero errors
- [ ] All unit and integration tests pass
- [ ] Lint and formatting checks pass
- [ ] Database migrations are included if schema changed
- [ ] OpenAPI spec is updated if endpoints changed
- [ ] No TODO/FIXME introduced without a linked issue
- [ ] Verified locally with `curl` or test client
- [ ] Changes documented in daily memory if significant

---

## 9. Boundaries

### Always (no approval needed)
- Read any file in the workspace
- Install npm/pip packages required for the task
- Run tests, linters, and formatters
- Create or modify files within the workspace
- Apply database migrations on the development database
- Query local PostgreSQL and Redis instances
- Write to daily memory and MEMORY.md

### Ask First
- Destructive database operations (DROP TABLE, TRUNCATE, DELETE without WHERE)
- Modifying shared team configuration files
- Changing authentication or authorization logic
- Upgrading major versions of frameworks or ORMs
- Adding new external service dependencies
- Running production-like operations or deployments
- Changing API contracts that other agents depend on

### Never
- Commit or log secrets, tokens, API keys, or passwords
- Disable security controls (CORS, rate limiting, auth guards)
- Run `rm -rf` on directories outside your workspace
- Fabricate test results or skip failing tests to report done
- Access or exfiltrate user data beyond what the task requires
- Bypass role boundaries without explicit orchestrator approval
- Push directly to production branches

---

## 10. Troubleshooting

### 1. `MODULE_NOT_FOUND` or `Cannot find module`
**Cause:** Missing dependency or incorrect import path.
**Fix:** `npm install <missing-package>` then verify with `npm ls <package>`. Check tsconfig paths if using aliases.

### 2. `Nest can't resolve dependencies of X`
**Cause:** Missing provider in module imports, or circular dependency.
**Fix:** Ensure the service is in the `providers` array of its module. Use `forwardRef(() => Module)` only as a last resort. Restructure shared logic into a common module.

### 3. TypeORM `QueryFailedError: relation "x" does not exist`
**Cause:** Migrations not applied, or entity not registered.
**Fix:** Run `npm run migration:run`. Verify entity is listed in `TypeOrmModule.forFeature([Entity])` in the module.

### 4. `ECONNREFUSED` on PostgreSQL or Redis
**Cause:** Service not running or wrong host/port.
**Fix:** Check service status. Verify `DB_HOST`, `DB_PORT`, `REDIS_HOST`, `REDIS_PORT` in environment. Use `localhost` in dev, service names in Docker Compose.

### 5. FastAPI `422 Unprocessable Entity`
**Cause:** Request body does not match Pydantic schema.
**Fix:** Check the `detail` array in the response — it lists exactly which fields failed validation and why. Fix the request payload or adjust the schema.

### 6. `Circular dependency detected` (NestJS)
**Cause:** Module A imports Module B which imports Module A.
**Fix:** Extract shared logic into a third module that both import. Use `forwardRef` only if restructuring is not feasible.

### 7. Alembic `Target database is not up to date`
**Cause:** Unapplied migrations exist before generating a new one.
**Fix:** Run `alembic upgrade head` first, then generate the new migration.

### 8. JWT `TokenExpiredError` or `JsonWebTokenError`
**Cause:** Token expired (expected) or secret mismatch between services.
**Fix:** For expired tokens, use the refresh token endpoint. For secret mismatch, verify `JWT_SECRET` is identical across all services. Check clock skew between containers.

### 9. `PayloadTooLargeError`
**Cause:** Request body exceeds the configured limit (default 100kb in Express).
**Fix:** Increase limit in main.ts: `app.useBodyParser('json', { limit: '10mb' })`. Set limits appropriate for your use case — do not set arbitrarily large.

### 10. Tests pass locally but fail in CI
**Cause:** Environment differences — missing env vars, different Node/Python version, or timing issues.
**Fix:** Pin versions in CI config. Use `.env.test` for test environment. Replace `setTimeout` in tests with deterministic awaits. Mock `Date.now()` if time-sensitive.

---

## 11. How to Improve

- **Record daily learnings.** After each session, write discoveries to `workspace/memory/YYYY-MM-DD.md`. Include: what changed, what broke, what pattern worked.
- **Update MEMORY.md with durable patterns.** When a solution works across multiple tasks, promote it from daily memory to `workspace/MEMORY.md`.
- **Track recurring failures.** If the same error appears three times, add it to this file's Troubleshooting section with the exact fix.
- **Benchmark before optimizing.** Use `EXPLAIN ANALYZE` for queries and `autocannon`/`locust` for endpoints before and after changes.
- **Review golden examples periodically.** When a new pattern outperforms an existing example, replace the example in section 5.
- **Update this file immediately** when commands, paths, stack versions, or team conventions change. Remove stale guidance so the team can trust every line.
- **Learn from code reviews.** When feedback highlights a better pattern, integrate it into the Standards section.
- **Stay current.** Periodically check for framework updates (NestJS, FastAPI, TypeORM, Pydantic) and note breaking changes in memory.
