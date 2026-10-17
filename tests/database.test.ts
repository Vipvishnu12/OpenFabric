import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDatabase, getDatabase, initializeDatabase } from "../src/db/sqlite";
import { AppError } from "../src/middleware/error-handler";
import { getPermissionsByUserId } from "../src/services/permission.repository";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "auth-service-sqlite-"));
const databasePath = path.join(tempDir, "permissions.db");

beforeAll(async () => {
  // Use a throwaway database for repeatable integration checks.
  process.env.SQLITE_DB_PATH = databasePath;
  await initializeDatabase(databasePath);
});

afterAll(async () => {
  await closeDatabase(databasePath);
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("SQLite integration", () => {
  it("opens a reusable database connection", async () => {
    const database = await getDatabase(databasePath);
    const result = (await database.get("SELECT 1 AS value")) as { value: number };

    expect(result.value).toBe(1);
  });

  it("creates the user_permissions table", async () => {
    const database = await getDatabase(databasePath);
    const table = (await database.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'user_permissions'")) as
      | { name?: string }
      | undefined;

    expect(table?.name).toBe("user_permissions");
  });

  it("creates the authorization_audit_logs table", async () => {
    const database = await getDatabase(databasePath);
    const table = (await database.get(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'authorization_audit_logs'",
    )) as { name?: string } | undefined;

    expect(table?.name).toBe("authorization_audit_logs");
  });

  it("fetches permissions for an existing user", async () => {
    const permissions = await getPermissionsByUserId("auth0|6acf0f80347c3a318a08e379", databasePath);

    expect(permissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          user_id: "auth0|6acf0f80347c3a318a08e379",
          action: "read",
          resource: "transactions",
          effect: "allow",
        }),
      ]),
    );
  });

  it("returns an empty array for an unknown user", async () => {
    await expect(getPermissionsByUserId("unknown-user", databasePath)).resolves.toEqual([]);
  });

  it("keeps sample data duplicate-safe on repeated initialization", async () => {
    // Re-run the bootstrap path to confirm seed inserts stay idempotent.
    await Promise.all([initializeDatabase(databasePath), initializeDatabase(databasePath), initializeDatabase(databasePath)]);

    const database = await getDatabase(databasePath);
    const result = (await database.get("SELECT COUNT(*) AS count FROM user_permissions")) as { count: number };

    expect(result.count).toBe(3);
  });

  it("creates the lookup index used by permission queries", async () => {
    const database = await getDatabase(databasePath);
    const index = (await database.get(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_user_permissions_user_lookup'",
    )) as { name?: string } | undefined;

    expect(index?.name).toBe("idx_user_permissions_user_lookup");
  });

  it("uses parameterized queries for permission lookup", async () => {
    const maliciousUserId = "user123' OR 1=1 --";

    await expect(getPermissionsByUserId(maliciousUserId, databasePath)).resolves.toEqual([]);
  });

  it("surfaces database errors safely", async () => {
    const badPath = path.join(tempDir, "blocked-directory");
    fs.mkdirSync(badPath);

    await expect(getPermissionsByUserId("user123", badPath)).rejects.toBeInstanceOf(AppError);
    await expect(getPermissionsByUserId("user2@example.com", badPath)).rejects.toThrow("Database connection failed");
  });
});
