import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDatabase, getDatabase, initializeDatabase } from "../src/db/sqlite";
import { AppError } from "../src/middleware/error-handler";
import { getPermissionsByUserId } from "../src/services/permission.repository";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "auth-service-sqlite-"));
const databasePath = path.join(tempDir, "permissions.db");

beforeAll(() => {
  // Use a throwaway database for repeatable integration checks.
  process.env.SQLITE_DB_PATH = databasePath;
  initializeDatabase(databasePath);
});

afterAll(() => {
  closeDatabase(databasePath);
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("SQLite integration", () => {
  it("opens a reusable database connection", () => {
    const database = getDatabase(databasePath);
    const result = database.prepare("SELECT 1 AS value").get() as { value: number };

    expect(result.value).toBe(1);
  });

  it("creates the user_permissions table", () => {
    const database = getDatabase(databasePath);
    const table = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'user_permissions'")
      .get() as { name?: string } | undefined;

    expect(table?.name).toBe("user_permissions");
  });

  it("creates the authorization_audit_logs table", () => {
    const database = getDatabase(databasePath);
    const table = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'authorization_audit_logs'")
      .get() as { name?: string } | undefined;

    expect(table?.name).toBe("authorization_audit_logs");
  });

  it("fetches permissions for an existing user", () => {
    const permissions = getPermissionsByUserId("user2@example.com", databasePath);

    expect(permissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          user_id: "user2@example.com",
          action: "read",
          resource: "transactions",
          effect: "allow",
        }),
      ]),
    );
  });

  it("returns an empty array for an unknown user", () => {
    expect(getPermissionsByUserId("unknown-user", databasePath)).toEqual([]);
  });

  it("keeps sample data duplicate-safe on repeated initialization", () => {
    // Re-run the bootstrap path to confirm seed inserts stay idempotent.
    initializeDatabase(databasePath);
    initializeDatabase(databasePath);

    const database = getDatabase(databasePath);
    const result = database.prepare("SELECT COUNT(*) AS count FROM user_permissions").get() as { count: number };

    expect(result.count).toBe(3);
  });

  it("creates the lookup index used by permission queries", () => {
    const database = getDatabase(databasePath);
    const index = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_user_permissions_user_lookup'")
      .get() as { name?: string } | undefined;

    expect(index?.name).toBe("idx_user_permissions_user_lookup");
  });

  it("uses parameterized queries for permission lookup", () => {
    const maliciousUserId = "user123' OR 1=1 --";

    expect(getPermissionsByUserId(maliciousUserId, databasePath)).toEqual([]);
  });

  it("surfaces database errors safely", () => {
    const badPath = path.join(tempDir, "blocked-directory");
    fs.mkdirSync(badPath);

    expect(() => getPermissionsByUserId("user123", badPath)).toThrow(AppError);
    expect(() => getPermissionsByUserId("user2@example.com", badPath)).toThrow("Database connection failed");
  });
});
