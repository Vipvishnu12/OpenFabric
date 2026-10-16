# Auth Service

TypeScript and Express service for validating Auth0 access tokens and authorizing requests against SQLite-backed permissions.

See [DESCRIPTION.md](DESCRIPTION.md) for the complete technical documentation.

## Prerequisites

- Node.js LTS
- npm

## Install

```powershell
npm install
```

## Demo Login

Use the three demo accounts created for the application:

- user2@example.com
  Password: MvSTn7Uk!4n4rdi

- user3@gmail.com
  Password: G!jb!pSFM@47muX
  
- user4@gmail.com
  Password:P3NQ#GD!@A2hmBW

The passwords are managed outside the repository.

If you only need to inspect the UI locally, you can open http://localhost:3000/?preview for the dashboard preview mode.

## Run

```powershell
npm run dev
```

Open:

```text
http://localhost:3000/
```

## Test and Build

```powershell
npm test
npm run build
```

## Minimal API Check

```bash
curl -X POST http://localhost:3000/authorize \
  -H "Content-Type: application/json" \
  -d '{
    "access_token": "<real_access_token>",
    "method": "GET",
    "path": "/transactions"
  }'
```

## Troubleshooting

- If Auth0 login fails in a local setup, confirm the issuer, audience, client ID, and allowed callback/logout URLs match your Auth0 app. In production, these are expected to be preconfigured.
- If `/authorize` returns `401`, use a valid access token for the configured audience and issuer.
- If request validation fails, make sure `method` is one of `GET`, `POST`, `PUT`, `PATCH`, or `DELETE`, and that `path` starts with `/`.
- If tests fail on the assignment users, check `database/seed.sql`; the current seed data in this checkout uses different demo identities.
