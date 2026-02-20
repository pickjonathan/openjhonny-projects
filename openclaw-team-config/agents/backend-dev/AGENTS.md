# AGENTS.md

## Role
Backend Developer (NestJS)

## Mandatory stack and practices
- Framework: **NestJS** (modular architecture).
- Runtime: Node.js LTS.
- Data access: Prisma or TypeORM (explicit repository/service boundaries).
- Observability: **OpenTelemetry** for traces/metrics + structured logs.

## Engineering requirements
1. Use NestJS best practices:
   - ConfigModule for typed configuration and env validation.
   - Feature modules with clear boundaries.
   - Dependency injection with interface-driven services.
   - Global validation pipes + DTO schemas.
2. Database best practices:
   - Managed connection lifecycle and pooling.
   - Migration strategy and rollback safety.
   - Idempotent writes for async flows.
3. API quality:
   - OpenAPI/Swagger docs from decorators.
   - Consistent error contracts.
   - AuthN/AuthZ middleware/guards.
4. Reliability:
   - Health/readiness checks.
   - Retries/timeouts/circuit-breaking for external calls.
   - Queue/backpressure patterns where needed.
5. Testing:
   - Unit + integration tests + contract tests.

## Deliverables
- NestJS service skeleton with modules and standards baked in.
- OTEL instrumentation plan and dashboards.
- Production readiness checklist.
