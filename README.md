# Auth Service

A TypeScript and Express service that validates Auth0 access tokens and evaluates resource permissions stored in SQLite. It includes a small browser dashboard for testing authorization decisions.

## 1. Installation and Run

**Prerequisites:** Node.js LTS and npm.

**Install dependencies**

```powershell
npm install
```

**Start the application**

```powershell
npm run dev
```

Open `http://localhost:3000/` in your browser.

**Run tests**

```powershell
npm test
```

**Build TypeScript**

```powershell
npm run build
```

The project includes its environment configuration. If Auth0 login fails, check that the configured issuer, API audience, SPA client, and allowed callback/logout/web origins match the Auth0 dashboard settings.

## 2. Specification

|        Item         |           Details            |
|---------------------|------------------------------|
| Runtime             | Node.js, TypeScript, Express |
| Identity provider   | Auth0                        |
| Token verification  | `jose`, JWKS, RS256          |
| Permission storage  | SQLite via `better-sqlite3`  |
| Request validation  | Zod                          |
| Tests               | Vitest and Supertest         |
| Main endpoint       | `POST /authorize`            | 
| Main database table | `user_permissions`           |
| Audit table         | `authorization_audit_logs`   |

## 3. What the Service Does

Authentication verifies the access token and establishes the caller's trusted identity. Authorization then checks whether that identity may perform a requested action on a resource. These are separate steps: a valid login does not automatically grant permission to every resource.

The dashboard signs in through Auth0, obtains an access token for the configured API audience, and sends the token, HTTP method, and resource path to the backend. The backend validates the token, loads permission records for the verified `sub`, evaluates the rules, and returns an `ALLOW` or `DENY` decision.

## 4. Request Flow

1. The user signs in through the Auth0 SPA flow in `public/app.js`.
2. The frontend sends `access_token`, `method`, and `path` to `POST /authorize`.
3. `src/controllers/authorize.controller.ts` validates the request using Zod.
4. `src/services/token.service.ts` verifies the JWT signature, RS256 algorithm, issuer, audience, expiry, and non-empty `sub`.
5. `src/services/permission.repository.ts` retrieves permission rows for the verified identity from SQLite.
6. `src/services/authorization.service.ts` maps the HTTP method, matches resource patterns, and resolves the winning rule.
7. The API returns the decision and relevant matched permission details.
8. `src/services/audit-log.repository.ts` records the authorization decision in SQLite.

## 5. Multiple Users and Identity

The seed data contains the assignment identities `user123`, `user456`, `user789`, and `admin789`. Their permission rules are stored in `user_permissions.user_id`.

The service uses the verified JWT `sub` as the lookup identity; it does not trust a user ID supplied in the request body. In automated tests, tokens use subjects that match the seeded identities. A real Auth0 account has its own `sub`, so that exact subject must have corresponding permission rows before the service can find its permissions. The current implementation does not automatically map arbitrary Auth0 users to the seeded demo identities.

## 6. Authorization Rules

The method-to-action mapping is:

- `GET` → `read`
- `POST`, `PUT`, `PATCH` → `write`
- `DELETE` → `delete`

Resource paths are trimmed of leading and trailing slashes and compared by path segments. In multi-segment patterns, `*` matches one segment; a standalone `*` matches resources at any depth. Partial-segment wildcard matches are not supported.

When multiple rules match, the service prefers the rule with more literal segments. If tied, the longer pattern wins. If specificity is still tied, `DENY` wins over `ALLOW`. Collection-style rules can match one deeper child resource, but an entity rule does not inherit into a nested collection. If no rule matches, the decision is `DENY`.

Examples:

- `transactions` can match `/transactions/txn-456`.
- `wallets/wallet-789` does not match `/wallets/wallet-789/transactions`.
- `wallets/*/transactions/*` can match `/wallets/wallet-456/transactions/txn-999`.
- A standalone `*` matches paths at different depths.

Implementation: `src/services/authorization.service.ts`  
Seeded rules: `database/seed.sql`  
Tests: `tests/authorization.service.test.ts`

## 7. API Reference

### `POST /authorize`

**Request**

```json
{
  "access_token": "<access-token>",
  "method": "GET",
  "path": "/transactions"
}
```

**Example success response**

```json
{
  "decision": "ALLOW",
  "user_id": "user123",
  "reason": "User has read permission for transactions",
  "matched_permissions": [
    {
      "action": "read",
      "resource": "transactions",
      "effect": "allow"
    }
  ]
}
```

**Common status codes**

- `200` — authorization decision returned.
- `400` — malformed JSON or invalid request fields.
- `401` — access token is invalid or its required claims fail validation.
- `429` — rate limit exceeded.
- `500` — unexpected internal or database error.
- `503` — JWKS or authentication dependency is unavailable.

Unsupported methods such as `OPTIONS` are rejected by request validation with `400`.

**Curl example**

```bash
curl -X POST http://localhost:3000/authorize \
  -H "Content-Type: application/json" \
  -d '{
    "access_token": "<access-token>",
    "method": "GET",
    "path": "/transactions"
  }'
```

REST Client examples: `requests/authorize.http`

## 8. Assignment Scenarios

| User      |                  Method and path                | Expected|                     result                       |
|-----------|-------------------------------------------------|---------|--------------------------------------------------|
| `user123` | `GET /transactions`                             | `ALLOW` | A read rule matches the collection.              |
| `user123` | `DELETE /transactions/txn-456`                  | `DENY`  | The applicable delete rule denies the action.    |
| `user456` | `GET /wallets/wallet-789/transactions`          | `ALLOW` | A rule matches the nested collection.            |
| `user789` | `POST /wallets/wallet-456/transactions/txn-999` | `ALLOW` | `wallets/*/transactions/*` matches the path.     |
| `user456` | `POST /wallets/wallet-789/transactions`         | `DENY`  | The entity-level rule does not grant access      | to                                                            |         |                            its child collection. |
| `admin789`| `DELETE /accounts/acc-123/settings`             | `ALLOW` | The standalone `*` delete rule matches the path. |

## 9. Security and Error Handling

- `jose` verifies the token signature and required claims before permission lookup.
- Only the verified `sub` is used as the permission identity.
- Zod validates the request body before the authorization logic runs.
- Error responses avoid returning internal stack traces to clients.
- The access token is not included in the API response or authorization audit record.
- Rate limiting is applied to `POST /authorize` per IP.

The service is configured for Auth0 and is not provider-agnostic. Automated token tests use a local JWKS test server; live Auth0 behavior should be verified separately. The repository does not provide a secret vault, log-retention policy, tamper-proof audit storage, or distributed rate limiting.

## 10. Logging and Audit Records

Operational logs are handled by `src/utils/logger.ts`. They are written to the console and, by default, `logs/auth-service.log`; `LOG_FILE_PATH` can change the file location.

Authorization audit records are stored in the `authorization_audit_logs` table through `src/services/audit-log.repository.ts`. Records include the user, method, path, mapped action, decision, reason, matched permissions, and timestamp. This provides a queryable history for reviewing decisions. The current implementation does not make these records tamper-proof or manage their retention.

## 11. Performance Considerations

- `src/db/sqlite.ts` caches database connections by resolved database path.
- Permission and audit queries use prepared statements.
- `idx_user_permissions_user_lookup` indexes permission lookup columns.
- `src/services/token.service.ts` caches JWKS resolvers by issuer.
- Rate limiting helps control repeated requests to the authorization endpoint.

These are implementation-level optimizations; the repository does not include performance benchmark results. A multi-instance deployment would need a shared rate-limit strategy and further review of database scaling and cache invalidation.

## 12. Main Files

|        Purpose            |       Location                             |
|---------------------------|--------------------------------------------|
| Express application       | `src/app.ts`                               |
| Server startup            | `src/server.ts`                            |
| Environment configuration | `src/config/env.ts`                        |
| Authorization endpoint    | `src/controllers/authorize.controller.ts`  |
| JWT validation            | `src/services/token.service.ts`            |
| Authorization rules       | `src/services/authorization.service.ts`    |
| Permission queries        | `src/services/permission.repository.ts`    |
| SQLite setup              | `src/db/sqlite.ts`                         |
| Audit records             | `src/services/audit-log.repository.ts`     |
| Rate limiting             | `src/middleware/rate-limit.ts`             |
| Error handling            | `src/middleware/error-handler.ts`          |
| Database schema and seed  | `database/schema.sql`, `database/seed.sql` |
| Browser dashboard         | `public/`                                  |
| Tests                     | `tests/`                                   |
| API examples              | `requests/authorize.http`                  |
| Auth flow notes           | `docs/auth-sequence.md`                    |

## 13. Verification

Run the automated tests and TypeScript build:

```powershell
npm test
npm run build
```

The tests cover token validation using a local JWKS server, authorization matching and precedence, SQLite initialization, request validation, API behavior, and audit insertion. A real Auth0 login and verification against the configured tenant's JWKS still require manual testing.

## 14. Production Considerations

Before a production deployment, review HTTPS termination, network access controls, secret rotation, log export and retention, database scaling, availability of the JWKS dependency, and rate limiting across multiple instances. Add caching only with a defined invalidation strategy. These are future deployment considerations, not claims that the demo already provides them.

## 15. Assignment Checklist

- [x] Auth0 access-token validation and verified identity extraction.
- [x] SQLite permission lookup.
- [x] Method mapping, resource matching, specificity, DENY precedence, and default DENY.
- [x] Request validation and structured error handling.
- [x] Automated tests and build command.
- [x] Rate limiting, query/index optimizations, and audit records implemented in the repository.
- [x] Publish the Git repository and include its link in the submission.
- [x] Record and submit the required 2–3 minute demo video.
