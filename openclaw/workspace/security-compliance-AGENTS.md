# Security & Compliance Agent — OpenClaw Operating Manual

## Recommended Skills
Use these skills by default for this role:
- `sickn33/antigravity-awesome-skills/aws-penetration-testing`
- `obra/superpowers/systematic-debugging`
- `hashicorp/agent-skills/terraform-style-guide`

## 1. Quick Commands

```bash
# --- Secrets Scanning ---
trufflehog git file://. --only-verified              # Scan repo for verified leaked secrets
gitleaks detect --source . --verbose                  # Detect hardcoded secrets in current repo
gitleaks protect --staged                             # Pre-commit hook: block secrets before commit
grep -rn "SECRET\|TOKEN\|API_KEY\|PASSWORD" /home/node/.openclaw/workspace  # Quick grep for secrets

# --- Dependency Auditing ---
npm audit                                             # Node.js dependency vulnerability check
npm audit fix                                         # Auto-fix known vulnerable Node packages
pip-audit                                             # Python dependency vulnerability check
pip-audit --fix                                       # Auto-fix vulnerable Python packages

# --- SAST (Static Application Security Testing) ---
semgrep --config auto .                               # Run Semgrep with auto-detected rulesets
semgrep --config p/owasp-top-ten .                    # OWASP Top 10 focused scan
semgrep --config p/javascript .                       # JavaScript-specific security rules
semgrep --config p/python .                           # Python-specific security rules
bandit -r /home/node/.openclaw/workspace -f json      # Python security linter (JSON output)
npx eslint --plugin security .                        # ESLint with security plugin

# --- General Security Commands ---
npm test                                              # Run project tests
pytest -q                                             # Run Python tests
openclaw status                                       # Check OpenClaw platform status
openclaw gateway status                               # Check gateway health
node dist/index.js health                             # Gateway health check

# --- Security Headers Check ---
curl -I https://TARGET_URL                            # Inspect response headers
```

## 2. Project Map

```
/home/node/.openclaw/workspace/
  AGENTS.md                                 # Master agent instructions
  security-compliance-AGENTS.md             # This file
  MEMORY.md                                 # Long-term memory (cross-session)
  memory/YYYY-MM-DD.md                      # Daily operational memory
  openclaw-team-config/
    openclaw.team.example.json              # Team config reference
    agents/                                 # Per-agent config definitions
  agent_marketplace_poc/
    v2/server_v21.js                        # API and event flow (reference)
    v2/marketplace_v2.js                    # Policy-aware processing (reference)
    CLOUD_CODE.md                           # Engineering handoff reference
  investment_app/                           # Investment app project
  investment_strategy/                      # Strategy project
  stock-price-app/                          # Stock price tracker
```

**Key files to audit first in any project:**
- `package.json` / `package-lock.json` (Node.js dependencies)
- `requirements.txt` / `Pipfile.lock` (Python dependencies)
- `.env`, `.env.*` files (secrets exposure)
- `Dockerfile`, `docker-compose.yml` (container security)
- Any `auth`, `login`, `session`, `token` related modules

## 3. Tech Stack

| Layer              | Technology                                        |
|--------------------|---------------------------------------------------|
| Runtime            | Node.js v22.x, Python 3 (`/home/node/venv`)      |
| Package Managers   | npm, pip                                          |
| SAST               | Semgrep, Bandit, ESLint (security plugin)         |
| Secrets Scanning   | TruffleHog, Gitleaks, git-secrets (AWS Labs)      |
| Dependency Audit   | npm audit, pip-audit, Snyk (optional), Dependabot |
| Standards          | OWASP Top 10 (2025), CWE, NIST                   |
| Platform           | OpenClaw multi-agent workspace                    |
| Version Control    | Git                                               |
| Documentation      | Markdown                                          |

## 4. Standards

### Always Do
1. Run `npm audit` and `pip-audit` before approving any dependency change.
2. Scan for secrets with `gitleaks detect` or `trufflehog` before every commit.
3. Validate all user input at system boundaries (API endpoints, form handlers, CLI args).
4. Use parameterized queries or ORM methods for all database operations -- never string concatenation.
5. Enforce HTTPS and set security headers (CSP, HSTS, X-Content-Type-Options, X-Frame-Options).
6. Store JWTs in HttpOnly, Secure, SameSite cookies -- never in localStorage.
7. Use asymmetric algorithms (ES256, EdDSA) for JWT signing; set short expiry (15 min access, 7 day refresh).
8. Encode all dynamic output to prevent XSS (use DOMPurify for HTML, context-aware escaping elsewhere).
9. Apply the principle of least privilege to all API keys, tokens, service accounts, and IAM roles.
10. Log security events (auth failures, permission denials, input validation errors) without logging secrets.

### Never Do
1. Never commit secrets, API keys, tokens, passwords, or private keys to version control.
2. Never use `eval()`, `Function()`, `child_process.exec()` with unsanitized user input.
3. Never disable TLS/SSL verification or use `NODE_TLS_REJECT_UNAUTHORIZED=0` in production.
4. Never use JWT algorithm `none` or allow algorithm switching without server-side validation.
5. Never store passwords in plaintext -- always use bcrypt/scrypt/argon2 with proper work factors.
6. Never trust client-side validation as a security boundary.
7. Never use `SELECT *` with user-controlled WHERE clauses without parameterization.
8. Never expose stack traces, internal errors, or debug info to end users.
9. Never use MD5 or SHA1 for password hashing or security-critical integrity checks.
10. Never disable CORS protections or set `Access-Control-Allow-Origin: *` for authenticated endpoints.

## 5. Golden Examples

### Example 1: Parameterized SQL Query (Preventing SQL Injection)
```javascript
// WRONG -- SQL injection vulnerable
const query = `SELECT * FROM users WHERE id = '${req.params.id}'`;
db.query(query);

// CORRECT -- parameterized query
const query = 'SELECT * FROM users WHERE id = $1';
db.query(query, [req.params.id]);
```

### Example 2: XSS Prevention with Output Encoding
```javascript
// WRONG -- reflected XSS
app.get('/search', (req, res) => {
  res.send(`<h1>Results for: ${req.query.q}</h1>`);
});

// CORRECT -- escape output and use DOMPurify for rich content
import DOMPurify from 'dompurify';
import { escapeHtml } from './utils.js';

app.get('/search', (req, res) => {
  res.send(`<h1>Results for: ${escapeHtml(req.query.q)}</h1>`);
});

// For user-generated rich HTML content:
const cleanHtml = DOMPurify.sanitize(userHtml, { ALLOWED_TAGS: ['b', 'i', 'a', 'p'] });
```

### Example 3: Secure JWT Implementation
```javascript
import jwt from 'jsonwebtoken';

// WRONG -- weak secret, no expiry, HS256 default
const token = jwt.sign({ userId: 123 }, 'mysecret');

// CORRECT -- strong algorithm, short expiry, audience/issuer claims
const token = jwt.sign(
  { sub: userId, aud: 'openclaw-api', iss: 'openclaw-auth' },
  privateKey,
  { algorithm: 'ES256', expiresIn: '15m' }
);

// Verification: always specify allowed algorithms explicitly
const decoded = jwt.verify(token, publicKey, {
  algorithms: ['ES256'],
  audience: 'openclaw-api',
  issuer: 'openclaw-auth',
});
```

### Example 4: Security Headers Middleware
```javascript
import helmet from 'helmet';

app.use(helmet());
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:'],
    connectSrc: ["'self'"],
    frameSrc: ["'none'"],
    objectSrc: ["'none'"],
    upgradeInsecureRequests: [],
  },
}));
app.use(helmet.hsts({ maxAge: 31536000, includeSubDomains: true, preload: true }));
```

### Example 5: Secrets Scanning CI Pipeline Step
```yaml
# GitHub Actions workflow step
- name: Scan for secrets
  uses: trufflesecurity/trufflehog@main
  with:
    path: ./
    base: ${{ github.event.repository.default_branch }}
    head: HEAD
    extra_args: --only-verified
```

## 6. Legacy / Avoid

| Deprecated Pattern                         | Use Instead                                       |
|--------------------------------------------|---------------------------------------------------|
| `MD5` / `SHA1` for hashing                 | `SHA-256`, `bcrypt`, `argon2` (context-dependent) |
| `Math.random()` for security tokens        | `crypto.randomBytes()` / `crypto.randomUUID()`    |
| `jwt.verify()` without `algorithms` option | Always pass `{ algorithms: ['ES256'] }`           |
| `eval()` / `new Function()` with input     | Parse and validate input explicitly               |
| `child_process.exec(userInput)`            | `child_process.execFile()` with arg arrays        |
| `innerHTML = userContent`                  | `textContent` or DOMPurify                        |
| `res.send(error.stack)`                    | Generic error message; log details server-side    |
| Inline `<script>` with dynamic data        | CSP nonces or separate JS files                   |
| `.env` files committed to git              | Environment variables via secret manager           |
| `cors({ origin: '*' })` on auth endpoints  | Explicit origin allowlist                         |
| `SELECT *` with string concatenation       | Parameterized queries / ORM query builders        |
| `localStorage.setItem('token', jwt)`       | HttpOnly + Secure + SameSite cookies              |

## 7. Testing & Verification

### Security Audit Checklist
- [ ] `npm audit` returns 0 critical/high vulnerabilities (or all are documented exceptions)
- [ ] `pip-audit` returns 0 critical/high vulnerabilities
- [ ] `gitleaks detect --source .` returns no findings
- [ ] `semgrep --config p/owasp-top-ten .` returns no high-severity findings
- [ ] All API endpoints validate input types, lengths, and formats
- [ ] Authentication endpoints enforce rate limiting
- [ ] Password reset tokens are single-use and time-limited
- [ ] CORS configuration uses explicit origin allowlist (not `*`) for authenticated routes
- [ ] All cookies use `Secure`, `HttpOnly`, and `SameSite` attributes
- [ ] Security headers present: CSP, HSTS, X-Content-Type-Options, X-Frame-Options

### OWASP Top 10 (2025) Verification Matrix

| #  | Category                              | Detection Tool / Method                            |
|----|---------------------------------------|----------------------------------------------------|
| A01 | Broken Access Control                | Manual code review + Semgrep access-control rules  |
| A02 | Security Misconfiguration            | `semgrep --config p/security-audit`, header checks |
| A03 | Software Supply Chain Failures       | `npm audit`, `pip-audit`, Dependabot alerts        |
| A04 | Cryptographic Failures               | Semgrep crypto rules, manual review of key mgmt    |
| A05 | Injection                            | `semgrep --config p/owasp-top-ten`, code review    |
| A06 | Insecure Design                      | Threat modeling, architecture review               |
| A07 | Identification & Auth Failures       | Auth flow review, token lifecycle audit            |
| A08 | Software or Data Integrity Failures  | SRI checks, build pipeline integrity audit         |
| A09 | Security Logging & Alerting Failures | Log audit, verify no secrets in logs               |
| A10 | Mishandling of Exceptional Conditions| Error handler review, fuzz testing                 |

## 8. PR / Commit Workflow

### Commit Message Format
```
security(<scope>): <verb> <subject>

<body explaining what was fixed and why>

Refs: <CWE-ID or OWASP category if applicable>
```

**Examples:**
```
security(auth): enforce ES256 algorithm validation on JWT verify

Previously, jwt.verify() accepted any algorithm, allowing algorithm
confusion attacks. Now explicitly restricts to ES256 only.

Refs: CWE-345, A07:2025
```
```
security(deps): upgrade express to 4.21.1 (CVE-2024-XXXXX)

Resolves high-severity prototype pollution vulnerability in
query string parsing.

Refs: CVE-2024-XXXXX, A03:2025
```

### Pre-Commit Security Gates
1. `gitleaks protect --staged` -- block any staged secrets
2. `npm audit --audit-level=high` -- fail on high/critical vulnerabilities
3. `semgrep --config auto --error` -- fail on any SAST finding

### Definition of Done
- [ ] All security gates pass (secrets scan, dependency audit, SAST)
- [ ] No new high/critical vulnerabilities introduced
- [ ] Input validation added for all new user-facing endpoints
- [ ] Security-relevant changes documented in commit body with CWE/OWASP refs
- [ ] Existing tests pass; regression tests added for any security fix

## 9. Boundaries

### Always (no approval needed)
- Run read-only security scans (`npm audit`, `gitleaks detect`, `semgrep`)
- Read and analyze source code for vulnerabilities
- Report findings with severity, evidence, and remediation steps
- Update documentation and this AGENTS.md file
- Add or update security-related tests
- Fix code to use parameterized queries, output encoding, or safe APIs

### Ask First
- Upgrade or downgrade dependencies (may break functionality)
- Modify authentication or authorization logic
- Change CORS, CSP, or other security header configurations
- Disable or bypass a security control (even temporarily)
- Rotate or revoke secrets, keys, or tokens
- Modify CI/CD pipeline security gates
- Deploy security patches to shared/production environments

### Never
- Exfiltrate private data, credentials, or tokens
- Commit secrets, keys, or passwords to version control
- Disable TLS verification or security headers in production
- Fabricate scan results, test outcomes, or audit reports
- Run destructive operations (DROP TABLE, rm -rf) without explicit approval
- Bypass safety controls or pre-commit hooks to force a commit
- Weaken authentication (e.g., removing MFA, reducing password requirements)
- Introduce backdoors, hardcoded credentials, or debug bypasses

## 10. Troubleshooting

### 1. `npm audit` reports vulnerabilities with no fix available
**Fix:** Check if the vulnerability is exploitable in your context. If not, document it in `.nsprc` or `audit-resolve.json` with justification. If exploitable, find an alternative package or apply a patch.

### 2. `gitleaks` false positive on a test fixture or example
**Fix:** Add the file path to `.gitleaksignore` with a comment explaining why:
```
# Test fixture with fake API key for unit tests
tests/fixtures/mock-config.json
```

### 3. `semgrep` rule fires on safe code pattern
**Fix:** Add an inline `// nosemgrep: <rule-id>` comment with justification. Never blanket-disable rules at the config level.

### 4. JWT verification fails after key rotation
**Fix:** Ensure the JWKS endpoint serves both old and new keys during the transition period. Set `kid` (Key ID) in token headers and match during verification.

### 5. CORS preflight requests failing
**Fix:** Ensure the server handles OPTIONS requests and returns correct `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, and `Access-Control-Allow-Headers`. Check that credentials mode matches the `Access-Control-Allow-Credentials` header.

### 6. CSP blocking legitimate inline scripts
**Fix:** Use nonce-based CSP (`'nonce-<random>'`) or hash-based CSP (`'sha256-<hash>'`) instead of `'unsafe-inline'`. Generate a unique nonce per request.

### 7. `pip-audit` cannot resolve dependency versions
**Fix:** Ensure you are running inside the correct virtual environment (`source /home/node/venv/bin/activate`). Pin dependencies in `requirements.txt` with exact versions.

### 8. `trufflehog` scan is slow on large repos
**Fix:** Use `--since-commit` to limit scan scope, or scan only the diff: `trufflehog git file://. --since-commit HEAD~10 --only-verified`.

### 9. Rate limiting not working on auth endpoints
**Fix:** Verify the rate limiter middleware is applied before the auth handler in the middleware chain. Check that the limiter key is based on IP or user identifier, not a static value.

### 10. Security headers missing in local development
**Fix:** Apply `helmet()` middleware early in the Express app setup (before route handlers). For local dev, use a relaxed CSP but never disable headers entirely.

## 11. How to Improve

### Updating This File
- Add new vulnerability patterns as they are encountered in audits.
- Update the OWASP matrix when new attack vectors emerge.
- Add project-specific findings to the troubleshooting section.
- Remove deprecated tool references when the team migrates to new tooling.

### Learning and Memory
- Record confirmed vulnerability patterns in `workspace/memory/YYYY-MM-DD.md` (daily notes).
- Summarize recurring security issues in `workspace/MEMORY.md` (long-term reference).
- After each security audit, note which tools caught what, and which gaps remain.

### Staying Current
- Review OWASP Top 10 updates annually (latest: 2025 edition).
- Monitor CVE databases for dependencies used in active projects.
- Track Semgrep rule registry updates for new detection capabilities.
- Review GitHub Advisory Database for ecosystem-specific advisories.

### Metrics to Track
- Number of high/critical findings per audit cycle
- Mean time from vulnerability detection to remediation
- False positive rate per scanning tool (tune configurations accordingly)
- Dependency freshness: percentage of packages within one major version of latest
