import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { getDatabaseConfig } from "../config/env";
import { AppError } from "../middleware/error-handler";

const schemaSqlPath = path.resolve(process.cwd(), "database", "schema.sql");
const seedSqlPath = path.resolve(process.cwd(), "database", "seed.sql");

function createDatabaseConnection(resolvedPath: string) {
  const database = new Database(resolvedPath);
  database.pragma("foreign_keys = ON");
  return database;
}

type SqliteDatabase = ReturnType<typeof createDatabaseConnection>;

const databaseCache = new Map<string, SqliteDatabase>();
const initializedPaths = new Set<string>();

const readSqlFile = (filePath: string): string => {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    throw new AppError(`Failed to read SQLite SQL file: ${path.basename(filePath)}`, 500);
  }
};

export const resolveDatabasePath = (dbPath?: string): string => {
  // Resolve relative paths against the project root, but keep in-memory DBs as-is.
  const configuredPath = (dbPath ?? getDatabaseConfig().sqliteDbPath).trim();

  if (configuredPath === ":memory:") {
    return configuredPath;
  }

  return path.isAbsolute(configuredPath) ? configuredPath : path.resolve(process.cwd(), configuredPath);
};

export const getDatabase = (dbPath?: string): SqliteDatabase => {
  const resolvedPath = resolveDatabasePath(dbPath);
  const existing = databaseCache.get(resolvedPath);

  if (existing) {
    return existing;
  }

  try {
    // Create the directory once and reuse the cached connection afterward.
    if (resolvedPath !== ":memory:") {
      fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    }

    const database = createDatabaseConnection(resolvedPath);
    databaseCache.set(resolvedPath, database);
    return database;
  } catch (error) {
    throw new AppError("Database connection failed", 500);
  }
};

export const initializeDatabase = (dbPath?: string): void => {
  const resolvedPath = resolveDatabasePath(dbPath);

  if (initializedPaths.has(resolvedPath)) {
    return;
  }

  try {
    // Bootstrap schema and seed data only once per resolved database path.
    const database = getDatabase(resolvedPath);
    database.exec(readSqlFile(schemaSqlPath));
    database.exec(readSqlFile(seedSqlPath));
    initializedPaths.add(resolvedPath);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError("Database initialization failed", 500);
  }
};

export const closeDatabase = (dbPath?: string): void => {
  const resolvedPath = resolveDatabasePath(dbPath);
  const database = databaseCache.get(resolvedPath);

  if (database) {
    database.close();
    databaseCache.delete(resolvedPath);
  }

  initializedPaths.delete(resolvedPath);
};

export const closeAllDatabases = (): void => {
  for (const [resolvedPath, database] of databaseCache.entries()) {
    database.close();
    databaseCache.delete(resolvedPath);
    initializedPaths.delete(resolvedPath);
  }
};
