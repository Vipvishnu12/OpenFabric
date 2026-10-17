import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import app from "../src/app";
import { closeDatabase, initializeDatabase } from "../src/db/sqlite";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "auth-service-permissions-"));
const databasePath = path.join(tempDir, "permissions.db");

beforeAll(async () => {
  process.env.AUTH0_ISSUER_URL = process.env.AUTH0_ISSUER_URL || "https://example.auth0.com/";
  process.env.AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE || "https://api.example.com";
  process.env.AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID || "frontend-client-id";
  process.env.SQLITE_DB_PATH = databasePath;
  await initializeDatabase(databasePath);
});

afterAll(async () => {
  await closeDatabase(databasePath);
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("Permission management API", () => {
  it("lists existing users", async () => {
    const response = await request(app).get("/permissions/users");

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.users)).toBe(true);
    expect(response.body.users).toEqual(
      expect.arrayContaining([
        "auth0|6acf0f80347c3a318a08e379",
        "auth0|6acf0fae620fbdf352e40234",
        "auth0|6acf11141830a1fdcf3c92a6",
      ]),
    );
  });

  it("creates, updates, and deletes a permission", async () => {
    const userId = "auth0|6acf0f80347c3a318a08e379";

    const createResponse = await request(app)
      .post(`/permissions/users/${userId}`)
      .send({ action: "read", resource: "permissions/test-resource", effect: "allow" });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.permission).toMatchObject({
      user_id: userId,
      action: "read",
      resource: "permissions/test-resource",
      effect: "allow",
    });

    const permissionId = createResponse.body.permission.id as number;

    const updateResponse = await request(app)
      .patch(`/permissions/${permissionId}`)
      .send({ effect: "deny", resource: "permissions/test-resource-updated" });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.permission).toMatchObject({
      id: permissionId,
      effect: "deny",
      resource: "permissions/test-resource-updated",
    });

    const readResponse = await request(app).get(`/permissions/users/${userId}`);
    expect(readResponse.status).toBe(200);
    expect(readResponse.body.permissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: permissionId,
          effect: "deny",
          resource: "permissions/test-resource-updated",
        }),
      ]),
    );

    const deleteResponse = await request(app).delete(`/permissions/${permissionId}`);
    expect(deleteResponse.status).toBe(204);

    const readAfterDeleteResponse = await request(app).get(`/permissions/users/${userId}`);
    expect(readAfterDeleteResponse.status).toBe(200);
    expect(readAfterDeleteResponse.body.permissions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: permissionId })]),
    );
  });
});
