import fs from "node:fs/promises";
import path from "node:path";

import sqlite3 from "sqlite3";
import { open } from "sqlite";

import { getDatabaseConfig } from "../config/env";
import { AppError } from "../middleware/error-handler";

const schemaSqlPath = path.resolve(process.cwd(), "database", "schema.sql");
const seedSqlPath = path.resolve(process.cwd(), "database", "seed.sql");

type SqliteDatabase = Awaited<ReturnType<typeof open>>;

const databaseCache = new Map<string, SqliteDatabase>();
const databaseConnectionPromises = new Map<string, Promise<SqliteDatabase>>();
const initializationPromises = new Map<string, Promise<void>>();
const initializedPaths = new Set<string>();

const readSqlFile = async (filePath: string): Promise<string> => {
  try {
    return await fs.readFile(filePath, "utf8");
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

const openDatabase = async (resolvedPath: string): Promise<SqliteDatabase> => {
  const cached = databaseCache.get(resolvedPath);

  if (cached) {
    return cached;
  }

  const pending = databaseConnectionPromises.get(resolvedPath);

  if (pending) {
    return pending;
  }

  const connectionPromise = (async () => {
    try {
      if (resolvedPath !== ":memory:") {
        await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
      }

      const database = await open({
        filename: resolvedPath,
        driver: sqlite3.Database,
      });

      await database.exec("PRAGMA foreign_keys = ON;");
      databaseCache.set(resolvedPath, database);
      return database;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError("Database connection failed", 500);
    } finally {
      databaseConnectionPromises.delete(resolvedPath);
    }
  })();

  databaseConnectionPromises.set(resolvedPath, connectionPromise);
  return connectionPromise;
};

export const getDatabase = async (dbPath?: string): Promise<SqliteDatabase> => {
  const resolvedPath = resolveDatabasePath(dbPath);
  return openDatabase(resolvedPath);
};

export const initializeDatabase = async (dbPath?: string): Promise<void> => {
  const resolvedPath = resolveDatabasePath(dbPath);

  if (initializedPaths.has(resolvedPath)) {
    return;
  }

  const pending = initializationPromises.get(resolvedPath);

  if (pending) {
    return pending;
  }

  const initializationPromise = (async () => {
    try {
      const database = await getDatabase(resolvedPath);

      // Bootstrap schema and seed data only once per resolved database path.
      await database.exec(await readSqlFile(schemaSqlPath));
      await database.exec(await readSqlFile(seedSqlPath));
      initializedPaths.add(resolvedPath);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError("Database initialization failed", 500);
    } finally {
      initializationPromises.delete(resolvedPath);
    }
  })();

  initializationPromises.set(resolvedPath, initializationPromise);
  return initializationPromise;
};

export const closeDatabase = async (dbPath?: string): Promise<void> => {
  const resolvedPath = resolveDatabasePath(dbPath);
  const database = databaseCache.get(resolvedPath);

  if (database) {
    await database.close();
    databaseCache.delete(resolvedPath);
  }

  initializedPaths.delete(resolvedPath);
};

export const closeAllDatabases = async (): Promise<void> => {
  const databases = [...databaseCache.entries()];

  databaseCache.clear();
  databaseConnectionPromises.clear();
  initializationPromises.clear();
  initializedPaths.clear();

  await Promise.all(databases.map(([, database]) => database.close()));
};
