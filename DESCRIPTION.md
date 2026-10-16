# Project Description

## 1. Project Overview

This service solves a common backend policy problem: once a user is authenticated, what is that user allowed to do on a given resource? Authentication proves identity. Authorization decides access. This repository keeps those responsibilities separate and returns a deterministic `ALLOW` or `DENY` decision for `POST /authorize`.

The implementation validates an OAuth2 access token, extracts the verified JWT `sub`, loads the matching permission rows from SQLite, evaluates the request method and path against the permission rules, and writes an audit record for the decision.

Important implementation note: the assignment brief uses sample identities such as `user123` and `admin789`, but the current seed data in `database/seed.sql` uses `user2@example.com`, `user3@gmail.com`, and `user4@gmail.com`. The authorization algorithm is implemented and tested, but some end-to-end examples in the brief do not match the current seeded identities.

## 2. Technology Stack

- Node.js, TypeScript, and Express provide the HTTP API and browser dashboard server.
- Auth0 provides the OAuth2 login flow and access tokens.
- `jose` verifies RS256 JWT signatures and reads JWKS keys from the Auth0 issuer.
- SQLite with `better-sqlite3` stores permission rules and audit records in a local database.
- Zod validates request payloads before authorization logic runs.
- Vitest and Supertest exercise JWT validation, authorization rules, API behavior, and SQLite integration.
- `express-rate-limit` protects the authorization endpoint from repeated requests.

## 3. Architecture

The main request flow is:

1. The browser dashboard in `public/app.js` signs the user in with Auth0.
2. The frontend obtains an access token for the configured API audience.
3. The browser sends `access_token`, `method`, and `path` to `POST /authorize`.
4. `src/controllers/authorize.controller.ts` validates the request with Zod.
5. `src/services/token.service.ts` verifies the JWT and extracts the trusted `sub`.
6. `src/services/permission.repository.ts` loads permission rows for that user from SQLite.
7. `src/services/authorization.service.ts` evaluates the method and path against the rules.
8. `src/services/audit-log.repository.ts` stores the decision in `authorization_audit_logs`.
9. The API returns the decision, reason, and matched permissions.

The browser UI is served from `public/`, while `src/app.ts` wires together the routes, static files, and error handling.

## 4. Authentication and JWT Validation

`src/services/token.service.ts` performs the trust boundary check. The service does not trust the frontend to tell it who the user is. It validates the token signature with JWKS, restricts the algorithm to RS256, checks the configured issuer and audience, and rejects expired or malformed tokens.

The `sub` claim is the verified identity used for permission lookup. That is important: the request body does not contain a user field that can be swapped to impersonate another user.

If JWT verification fails because the signature, issuer, audience, or expiry check fails, the service returns `401`. If the JWKS endpoint is unavailable or cannot be reached, the service returns `503`.

## 5. Database Design

The SQLite schema is defined in `database/schema.sql`.

### `user_permissions`

- `id`: primary key
- `user_id`: the identity string used for permission lookup
- `action`: `read`, `write`, or `delete`
- `resource`: resource pattern such as `transactions`, `wallets/*`, or `wallets/*/transactions/*`
- `effect`: `allow` or `deny`

### `authorization_audit_logs`

- Stores the authorization decision history
- Includes user ID, method, path, action, decision, reason, matched permissions JSON, and timestamp

The seed file currently inserts these demo permissions:

- `user2@example.com` can `read` `transactions`
- `user3@gmail.com` can `read` `wallets/wallet-789/transactions`
- `user4@gmail.com` can `write` `wallets/*/transactions/*`

The service uses the verified Auth0 `sub` as the permission lookup identity. There is no automatic mapping layer from arbitrary Auth0 users to the assignment sample identities. If the JWT subject does not exist in `user_permissions`, authorization falls back to `DENY`.

## 6. API Documentation

### `POST /authorize`

Request body:

```json
{
  "access_token": "<access-token>",
  "method": "GET",
  "path": "/transactions"
}
```

Response body:

```json
{
  "decision": "ALLOW",
  "user_id": "user2@example.com",
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

Representative curl command:

```bash
curl -X POST http://localhost:3000/authorize \
  -H "Content-Type: application/json" \
  -d '{
    "access_token": "<real_access_token>",
    "method": "GET",
    "path": "/transactions"
  }'
```

HTTP status codes used by the service:

- `200` for a successful authorization decision
- `400` for malformed JSON or invalid request fields
- `401` for invalid authentication or invalid token claims
- `429` for rate limiting
- `500` for unexpected internal or database failures
- `503` for JWKS or authentication dependency unavailability

## 7. Authorization Logic

The action mapping is fixed:

- `GET` → `read`
- `POST`, `PUT`, `PATCH` → `write`
- `DELETE` → `delete`

Path matching is handled by `resourceMatches()` in `src/services/authorization.service.ts`.

Rules implemented by the current code:

- Exact path depth matches are allowed.
- A `*` segment matches exactly one path segment.
- A standalone `*` matches any path depth.
- Collection-style resources can match one level of child path, such as `transactions` matching `/transactions/txn-456`.
- Entity-level resources do not automatically grant access to nested child collections.

Precedence rules:

1. More literal segments win over more wildcard-heavy patterns.
2. If literal segment count is equal, the longer pattern wins.
3. If specificity is still tied, `DENY` wins over `ALLOW`.
4. If no rule matches, the service returns `DENY`.

The implementation deliberately avoids partial wildcard matching inside a segment. For example, `wallets/*/transactions/*` is supported, but `wallets/wallet-*` is not.

## 8. Assignment Test Scenarios

The assignment brief expects these outcomes:

| Scenario | Expected decision | Reason |
|---|---|---|
| `user123` - `GET /transactions` | `ALLOW` | read access exists for the `transactions` collection |
| `user123` - `DELETE /transactions/txn-456` | `DENY` | delete is explicitly denied for `transactions` |
| `user456` - `GET /wallets/wallet-789/transactions` | `ALLOW` | a nested collection read rule exists |
| `user789` - `POST /wallets/wallet-456/transactions/txn-999` | `ALLOW` | wildcard write rule matches wallet and transaction segments |
| `user456` - `POST /wallets/wallet-789/transactions` | `DENY` | entity-level access does not inherit to that child collection in this implementation |
| `admin789` - `DELETE /accounts/acc-123/settings` | `ALLOW` | the global `*` delete rule matches any path |

Current repo reality: the seeded identities do not match those exact sample users, so these are the assignment scenarios, not live confirmations from the current seed file. The policy engine itself is still the same one the tests exercise.

## 9. Security and Error Handling

- Request bodies are validated with Zod before auth or database access.
- The backend validates the JWT signature and required claims before permission lookup.
- The verified `sub` is the only identity used for authorization decisions.
- The access token is not returned in the API response or written to the audit table.
- Malformed JSON is converted into a structured `400` response.
- Rate limiting is applied to `POST /authorize` per IP.
- Unexpected errors are handled by the shared Express error handler without leaking stack traces to clients.

## 10. Logging and Audit Records

Operational logs are written by `src/utils/logger.ts` to the console and, by default, `logs/auth-service.log`. `LOG_FILE_PATH` can override the file location.

Authorization audit records are written by `src/services/audit-log.repository.ts` into `authorization_audit_logs`. Each row captures the user ID, method, path, action, decision, reason, matched permissions JSON, and timestamp.

This gives the service a queryable decision trail, which is useful in a security-sensitive or financial workflow. The current implementation does not add tamper-proof storage, retention management, or external log shipping.

## 11. Performance Considerations

Implemented optimizations:

- `src/db/sqlite.ts` caches database connections by resolved path.
- Permission and audit queries use prepared statements.
- `database/schema.sql` creates `idx_user_permissions_user_lookup` for permission lookups.
- `src/services/token.service.ts` caches JWKS resolvers per issuer.
- `POST /authorize` is rate-limited to reduce repeated request bursts.

These are practical implementation choices, not benchmark-backed performance claims. The repository does not include measured throughput or latency results.

## 12. Testing and Verification

Commands:

```powershell
npm test
npm run build
```

Verified results in the current checkout:

- `npm run build` passes.
- `npm test` currently fails because the seed data and the assignment fixture identities do not line up.
- `tests/token-validation.test.ts` covers JWT validity, issuer, audience, expiry, invalid signature, tampering, missing `sub`, API 401 behavior, and audit insertion.
- `tests/authorization.service.test.ts` covers method mapping, wildcard handling, nested resources, precedence, and default deny.
- `tests/app.test.ts` covers request validation and malformed JSON handling.
- `tests/database.test.ts` covers SQLite setup, indexed lookup, and safe query behavior.
- `tests/permissions-management.test.ts` covers permission CRUD endpoints.

## 13. Design Decisions and Trade-offs

- The service uses the verified JWT `sub` as the lookup identity because that is the trustable identity claim after signature verification.
- The authorization engine uses a deterministic segment-based matcher instead of a general-purpose glob engine so that precedence rules remain explainable.
- Audit records are stored in SQLite for simplicity and local reproducibility, which is appropriate for a take-home assignment but not a production-scale audit pipeline.
- The frontend includes a preview mode so the UI can be demonstrated even when a live Auth0 session is unavailable.

## 14. Limitations and Future Improvements

- The current seed data does not match the assignment sample identities.
- Live Auth0 end-to-end verification still depends on the configured tenant and cannot be fully reproduced by unit tests alone.
- `express-rate-limit` uses the default in-memory strategy, so multi-instance deployment would need shared rate limiting.
- The audit trail is queryable but not tamper-resistant.
- The repository does not include a secret vault, centralized log shipping, or retention automation.
- A future version could add a mapping layer if real Auth0 subjects need to be associated with separate internal permission identities.

## 15. Project Structure

| File or folder | Responsibility |
|---|---|
| `src/app.ts` | Express app composition, static assets, and route mounting |
| `src/server.ts` | Process startup and database initialization |
| `src/config/env.ts` | Environment variable parsing and configuration helpers |
| `src/controllers/authorize.controller.ts` | `POST /authorize` request validation and orchestration |
| `src/routes/authorize.routes.ts` | Authorization route wiring and rate limiting |
| `src/services/token.service.ts` | JWT verification and identity extraction |
| `src/services/authorization.service.ts` | Method mapping, matching, and decision logic |
| `src/services/permission.repository.ts` | SQLite permission queries and CRUD helpers |
| `src/services/audit-log.repository.ts` | Authorization audit insertion |
| `src/db/sqlite.ts` | Database initialization, connection caching, and cleanup |
| `src/middleware/error-handler.ts` | Shared API error responses and logging |
| `src/middleware/rate-limit.ts` | Authorization endpoint rate limiting |
| `public/index.html` | Browser dashboard layout |
| `public/app.js` | Auth0 login flow and dashboard behavior |
| `database/schema.sql` | SQLite schema and index definitions |
| `database/seed.sql` | Seed permission data |
| `tests/` | Vitest and Supertest coverage |

## 16. Assignment Requirement Mapping

| Assignment requirement | Implementation | Relevant files |
|-------------------------------|---|---|
| Validate OAuth2 access tokens | RS256 JWT verification with JWKS, issuer, audience, expiry, and `sub` checks | `src/services/token.service.ts`, `tests/token-validation.test.ts` |
| Extract user identity from token | Verified `sub` becomes the permission lookup identity | `src/services/token.service.ts`, `src/controllers/authorize.controller.ts` |
| Query SQLite for permissions | Permission rows are read from `user_permissions` | `src/db/sqlite.ts`, `src/services/permission.repository.ts`, `database/schema.sql` |
| Map methods to actions | `GET/read`, `POST|PUT|PATCH/write`, `DELETE/delete` | `src/services/authorization.service.ts` |
| Support nested and wildcard resource matching | Segment-based matching with one-level collection inheritance and `*` support | `src/services/authorization.service.ts`, `tests/authorization.service.test.ts` |
| Apply precedence rules | More specific rules win, then `DENY` on ties, then default deny | `src/services/authorization.service.ts` |
| Expose authorization API | `POST /authorize` endpoint with JSON response | `src/routes/authorize.routes.ts`, `src/controllers/authorize.controller.ts` |
| Validate input and handle errors | Zod validation plus shared API error handling | `src/controllers/authorize.controller.ts`, `src/middleware/error-handler.ts`, `tests/app.test.ts` |
| Rate limit requests | Per-IP rate limiting on `POST /authorize` | `src/middleware/rate-limit.ts` |
| Log decisions and keep audit records | Console/file logs and SQLite audit table | `src/utils/logger.ts`, `src/services/audit-log.repository.ts`, `database/schema.sql` |
| Provide tests and build script | Vitest, Supertest, and TypeScript build | `package.json`, `tests/` |
| Provide frontend demo | Auth0 dashboard and request builder | `public/index.html`, `public/app.js`, `src/routes/public.routes.ts` |