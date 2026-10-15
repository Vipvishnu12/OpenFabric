# Auth Service

TypeScript + Express service that validates Auth0 access tokens and returns authorization decisions based on SQLite permission records.

## Stack

- Node.js
- TypeScript
- Express
- jose (JWT + JWKS verification)
- better-sqlite3
- Zod
- Vitest + Supertest

## Default behavior

By default, the service uses Auth0 issuer and audience validation from these environment variables:

- `AUTH0_ISSUER_URL`
- `AUTH0_AUDIENCE`

That path remains the default for normal development and production-like runs.

## Required environment variables

This service requires configuration for an Auth0 tenant issuer and the API audience.

Set these environment variables for normal operation (Auth0-only):

- `AUTH0_ISSUER_URL` — your Auth0 issuer URL (exact string returned by your tenant, including trailing slash when present).
- `AUTH0_AUDIENCE` — the API identifier/audience configured in your Auth0 API.

Optional:

- `PORT` defaults to `3000`
- `SQLITE_DB_PATH` defaults to `data/permissions.db`

## JWT validation flow

POST /authorize performs authentication first:

1. Validate request body structure with Zod.
2. Verify access token signature and claims with `jose.jwtVerify`.
3. Require RS256, issuer, audience, and non-empty `sub`.
4. Use only the verified `sub` as the user identity for permission lookup.

Authentication outcomes:

- Invalid/expired/tampered/wrong-issuer/wrong-audience token -> `401 Authentication failed`
- JWKS fetch/verification dependency failure -> `503 Authentication service temporarily unavailable`
- Local test issuer configuration in production -> `500 Local test issuer configuration is not allowed in production`

## Authorization decision algorithm

Input:

- Request method and resource path from body
- User permissions fetched from SQLite for the verified JWT `sub`

Decision process:

1. Map HTTP method to action:
   - GET -> read
   - POST -> write
   - PUT -> write
   - PATCH -> write
   - DELETE -> delete
2. Filter permissions by action.
3. Filter permissions by segment-based resource matching rules.
4. Rank matches by specificity:
   - More literal segments wins
   - If tied, longer segment count wins
   - If still tied, DENY beats ALLOW
5. Return the winning rule effect as ALLOW or DENY.
6. If no rule matches, default DENY.

## Resource matching rules

Paths are normalized by trimming leading and trailing slashes, then matched by path segments.

Rules:

- Wildcard `*` matches exactly one segment.
- Partial segment matches are not allowed.
- `*` as a standalone resource matches any path depth.
- Exact-length segment matches are allowed.
- Controlled nested inheritance is supported for collection resources only.
- Collection-style resources may match exactly one deeper child resource.
- Example: `transactions` matches `/transactions/txn-456`.
- Counter-example: `wallets/wallet-789` does not match `/wallets/wallet-789/transactions`.

This inheritance rule satisfies the assignment examples while preventing parent entity permissions from unintentionally granting child collection access.

## SQLite schema and seed

Table:

```sql
CREATE TABLE IF NOT EXISTS user_permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    resource TEXT NOT NULL,
    effect TEXT NOT NULL
);
```

The service seeds these example identities:

- `user123`
- `user456`
- `user789`
- `admin789`

## API contract

Endpoint:

- `POST /authorize`

Request body:

```json
{
  "access_token": "<jwt>",
  "method": "GET",
  "path": "/transactions"
}
```

Success response:

```json
{
  "decision": "ALLOW",
  "user_id": "user123",
  "reason": "Matched allow permission on transactions"
  ,"matched_permissions": [
    {
      "action": "read",
      "resource": "transactions",
      "effect": "allow"
    }
  ]
}
```

Security notes:

- Response never includes the access token.
- Response does not echo the full request payload.
- Request `user_id` is never accepted; identity comes only from the verified JWT `sub`.
- Test issuer support is disabled in production.

Unsupported method behavior:

- At the API boundary, unsupported methods such as `OPTIONS` are rejected by schema validation with HTTP 400.

## Run tests

```powershell
npm test
npm run build
```

## Manual API testing

REST Client example file:

- `requests/authorize.http`

Example curl:

```bash
curl -X POST http://localhost:3000/authorize \
  -H "Content-Type: application/json" \
  -d '{
    "access_token": "<real-auth0-access-token>",
    "method": "GET",
    "path": "/transactions"
  }'
```

Manual checks that require real Auth0 tokens:

- End-to-end verification against your Auth0 tenant JWKS
- Real audience and issuer mismatch behavior with production settings
