import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

import app from "../src/app";
import { closeDatabase, getDatabase, initializeDatabase } from "../src/db/sqlite";
import * as permissionRepository from "../src/services/permission.repository";
import { createPermissionForUser } from "../src/services/permission.repository";
import { validateAccessToken } from "../src/services/token.service";

describe("JWT access token validation", () => {
  let jwksServer: Server;
  let issuerUrl: string;
  let audience: string;
  let privateKey: CryptoKey;
  let validToken: string;
  let databasePath: string;
  let tempDirectory: string;

  beforeAll(async () => {
    // Stand up a local JWKS endpoint so token validation stays self-contained.
    tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "auth-service-jwt-"));
    databasePath = path.join(tempDirectory, "permissions.db");

    const keyPair = await generateKeyPair("RS256");
    privateKey = keyPair.privateKey;
    const publicJwk = await exportJWK(keyPair.publicKey);
    publicJwk.kid = "test-key-1";
    publicJwk.use = "sig";
    publicJwk.alg = "RS256";

    jwksServer = createServer((req, res) => {
      if (req.url === "/.well-known/jwks.json") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ keys: [publicJwk] }));
        return;
      }

      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => {
      jwksServer.listen(0, "127.0.0.1", () => resolve());
    });

    const address = jwksServer.address() as AddressInfo;
    issuerUrl = `http://127.0.0.1:${address.port}/`;
    audience = "https://api.example.com";

    process.env.AUTH0_ISSUER_URL = issuerUrl;
    process.env.AUTH0_AUDIENCE = audience;
    process.env.PORT = "3000";
    process.env.SQLITE_DB_PATH = databasePath;

    await initializeDatabase(databasePath);

    await Promise.all([
      createPermissionForUser(
        "user123",
        { action: "read", resource: "transactions", effect: "allow" },
        databasePath,
      ),
      createPermissionForUser(
        "user123",
        { action: "delete", resource: "transactions", effect: "deny" },
        databasePath,
      ),
      createPermissionForUser(
        "user456",
        { action: "read", resource: "wallets/wallet-789/transactions", effect: "allow" },
        databasePath,
      ),
      createPermissionForUser(
        "user789",
        { action: "write", resource: "wallets/*/transactions/*", effect: "allow" },
        databasePath,
      ),
      createPermissionForUser(
        "admin789",
        { action: "delete", resource: "*", effect: "allow" },
        databasePath,
      ),
    ]);
  });

  afterAll(async () => {
    await closeDatabase(databasePath);

    await new Promise<void>((resolve, reject) => {
      jwksServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    fs.rmSync(tempDirectory, { recursive: true, force: true });
  });

  beforeEach(async () => {
    validToken = await createAccessToken("user2@example.com");
  });

  const createAccessToken = async (subject: string): Promise<string> =>
    new SignJWT({ sub: subject, scope: "read:transactions" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key-1" })
      .setIssuedAt()
      .setIssuer(issuerUrl)
      .setAudience(audience)
      .setExpirationTime("2h")
      .sign(privateKey);

  it("validates a signed JWT with the expected issuer and audience", async () => {
    const result = await validateAccessToken(validToken);

    expect(result.user_id).toBe("user2@example.com");
    expect(result.claims.sub).toBe("user2@example.com");
  });

  it("rejects an expired token", async () => {
    const expiredToken = await new SignJWT({ sub: "auth0|user-expired" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key-1" })
      .setIssuedAt()
      .setIssuer(issuerUrl)
      .setAudience(audience)
      .setExpirationTime("-1s")
      .sign(privateKey);

    await expect(validateAccessToken(expiredToken)).rejects.toMatchObject({ statusCode: 401 });
  });

  it("rejects an invalid signature", async () => {
    const otherKeyPair = await generateKeyPair("RS256");
    const invalidSignatureToken = await new SignJWT({ sub: "auth0|user-invalid-signature" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key-1" })
      .setIssuedAt()
      .setIssuer(issuerUrl)
      .setAudience(audience)
      .setExpirationTime("2h")
      .sign(otherKeyPair.privateKey);

    await expect(validateAccessToken(invalidSignatureToken)).rejects.toMatchObject({ statusCode: 401 });
  });

  it("rejects a tampered token", async () => {
    const [header, payload, signature] = validToken.split(".");
    const parsedPayload = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    parsedPayload.sub = "tampered-user";
    const tamperedPayload = Buffer.from(JSON.stringify(parsedPayload)).toString("base64url");
    const tamperedToken = `${header}.${tamperedPayload}.${signature}`;

    await expect(validateAccessToken(tamperedToken)).rejects.toMatchObject({ statusCode: 401 });
  });

  it("rejects an incorrect issuer", async () => {
    const wrongIssuerToken = await new SignJWT({ sub: "auth0|user-wrong-issuer" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key-1" })
      .setIssuedAt()
      .setIssuer("https://example.com/")
      .setAudience(audience)
      .setExpirationTime("2h")
      .sign(privateKey);

    await expect(validateAccessToken(wrongIssuerToken)).rejects.toMatchObject({ statusCode: 401 });
  });

  it("rejects an incorrect audience", async () => {
    const wrongAudienceToken = await new SignJWT({ sub: "auth0|user-wrong-audience" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key-1" })
      .setIssuedAt()
      .setIssuer(issuerUrl)
      .setAudience("https://wrong-api.example.com")
      .setExpirationTime("2h")
      .sign(privateKey);

    await expect(validateAccessToken(wrongAudienceToken)).rejects.toMatchObject({ statusCode: 401 });
  });

  it("rejects a malformed JWT", async () => {
    await expect(validateAccessToken("not-a-jwt")).rejects.toMatchObject({ statusCode: 401 });
  });

  it("rejects a token without a usable sub claim", async () => {
    const tokenWithoutSub = await new SignJWT({ scope: "read:transactions" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key-1" })
      .setIssuedAt()
      .setIssuer(issuerUrl)
      .setAudience(audience)
      .setExpirationTime("2h")
      .sign(privateKey);

    await expect(validateAccessToken(tokenWithoutSub)).rejects.toMatchObject({ statusCode: 401 });
  });

  it.each([
    ["user2@example.com", "GET", "/transactions", "ALLOW"],
    ["user2@example.com", "DELETE", "/transactions/txn-456", "DENY"],
    ["user3@gmail.com", "GET", "/wallets/wallet-789/transactions", "ALLOW"],
    ["user4@gmail.com", "POST", "/wallets/wallet-456/transactions/txn-999", "ALLOW"],
    ["user3@gmail.com", "POST", "/wallets/wallet-789/transactions", "DENY"],
    ["user4@gmail.com", "DELETE", "/accounts/acc-123/settings", "DENY"],
    ["user2@example.com", "GET", "/unmatched/resource", "DENY"],
  ] as const)("authorizes %s %s %s as %s", async (subject, method, path, expectedDecision) => {
    // Cover the authorization matrix with real requests.
    const token = await createAccessToken(subject);

    const response = await request(app)
      .post("/authorize")
      .send({
        access_token: token,
        method,
        path,
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      decision: expectedDecision,
      user_id: subject,
      reason: expect.any(String),
    });
    expect(response.body).toHaveProperty("matched_permissions");
    expect(Array.isArray(response.body.matched_permissions)).toBe(true);
    expect(response.body).not.toHaveProperty("access_token");
    expect(response.body).not.toHaveProperty("method");
    expect(response.body).not.toHaveProperty("path");
  });

  it("returns 401 for an invalid token on /authorize", async () => {
    const lookupSpy = vi.spyOn(permissionRepository, "getPermissionsByUserId");

    const response = await request(app)
      .post("/authorize")
      .send({
        access_token: "this.is.not.valid",
        method: "GET",
        path: "/transactions",
      });

    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe("Authentication failed");
    expect(lookupSpy).not.toHaveBeenCalled();
    expect(response.body).not.toHaveProperty("access_token");
  });

  it("writes an authorization audit log for permission decisions", async () => {
    const token = await createAccessToken("user2@example.com");

    const response = await request(app)
      .post("/authorize")
      .send({
        access_token: token,
        method: "GET",
        path: "/transactions",
      });

    expect(response.status).toBe(200);

    const database = await getDatabase(databasePath);
    const row = (await database.get(
      `SELECT user_id, method, path, action, decision, reason, matched_permissions_json
       FROM authorization_audit_logs
       ORDER BY id DESC
       LIMIT 1`,
    )) as
      | {
          user_id: string;
          method: string;
          path: string;
          action: string;
          decision: string;
          reason: string;
          matched_permissions_json: string;
        }
      | undefined;

    expect(row).toBeDefined();
    expect(row?.user_id).toBe("user2@example.com");
    expect(row?.method).toBe("GET");
    expect(row?.path).toBe("/transactions");
    expect(row?.decision).toBe("ALLOW");
    expect(row?.action).toBe("read");
    expect(JSON.parse(row?.matched_permissions_json ?? "[]")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "read", resource: "transactions", effect: "allow" }),
      ]),
    );
  });

  it.each([
    ["user123", "GET", "/transactions", "ALLOW"],
    ["user123", "DELETE", "/transactions/txn-456", "DENY"],
    ["user456", "GET", "/wallets/wallet-789/transactions", "ALLOW"],
    ["user789", "POST", "/wallets/wallet-456/transactions/txn-999", "ALLOW"],
    ["user456", "POST", "/wallets/wallet-789/transactions", "DENY"],
    ["admin789", "DELETE", "/accounts/acc-123/settings", "ALLOW"],
  ] as const)("authorizes %s %s %s as %s", async (subject, method, path, expectedDecision) => {
    const token = await createAccessToken(subject);

    const response = await request(app)
      .post("/authorize")
      .send({
        access_token: token,
        method,
        path,
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      decision: expectedDecision,
      user_id: subject,
      reason: expect.any(String),
    });
  });

  it("returns 503 when JWKS verification is unavailable", async () => {
    const oldIssuer = process.env.AUTH0_ISSUER_URL;

    const brokenServer = createServer((_req, res) => {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "jwks unavailable" }));
    });

    await new Promise<void>((resolve) => {
      brokenServer.listen(0, "127.0.0.1", () => resolve());
    });

    const brokenPort = (brokenServer.address() as AddressInfo).port;
    process.env.AUTH0_ISSUER_URL = `http://127.0.0.1:${brokenPort}/`;

    await expect(validateAccessToken(validToken)).rejects.toMatchObject({ statusCode: 503 });

    await new Promise<void>((resolve, reject) => {
      brokenServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    process.env.AUTH0_ISSUER_URL = oldIssuer;
  });
});
