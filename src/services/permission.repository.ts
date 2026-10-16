import { AppError } from "../middleware/error-handler";
import { initializeDatabase, getDatabase } from "../db/sqlite";
import type { PermissionRecord } from "../types/permission";

export interface PermissionMutationInput {
  action: "read" | "write" | "delete";
  resource: string;
  effect: "allow" | "deny";
}

const SELECT_PERMISSIONS_BY_USER_ID = `
  SELECT id, user_id, action, resource, effect
  FROM user_permissions
  WHERE user_id = ?
  ORDER BY id ASC
`;

const SELECT_DISTINCT_USERS = `
  SELECT DISTINCT user_id
  FROM user_permissions
  ORDER BY user_id COLLATE NOCASE ASC
`;

const SELECT_PERMISSION_BY_ID = `
  SELECT id, user_id, action, resource, effect
  FROM user_permissions
  WHERE id = ?
`;

const INSERT_PERMISSION = `
  INSERT INTO user_permissions (user_id, action, resource, effect)
  VALUES (?, ?, ?, ?)
`;

const UPDATE_PERMISSION_BY_ID = `
  UPDATE user_permissions
  SET action = ?, resource = ?, effect = ?
  WHERE id = ?
`;

const DELETE_PERMISSION_BY_ID = `
  DELETE FROM user_permissions
  WHERE id = ?
`;

const getInitializedDatabase = (dbPath?: string) => {
  initializeDatabase(dbPath);
  return getDatabase(dbPath);
};

export const getPermissionsByUserId = (userId: string, dbPath?: string): PermissionRecord[] => {
  if (typeof userId !== "string" || userId.trim() === "") {
    throw new AppError("Invalid user identity", 500);
  }

  try {
    // Read permissions through the shared database bootstrap.
    const database = getInitializedDatabase(dbPath);
    const statement = database.prepare(SELECT_PERMISSIONS_BY_USER_ID);
    return statement.all(userId) as PermissionRecord[];
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError("Failed to retrieve permissions", 500);
  }
};

export const listUserIds = (dbPath?: string): string[] => {
  try {
    const database = getInitializedDatabase(dbPath);
    const statement = database.prepare(SELECT_DISTINCT_USERS);
    const rows = statement.all() as Array<{ user_id: string }>;
    return rows.map((row) => row.user_id);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError("Failed to retrieve users", 500);
  }
};

export const getPermissionById = (permissionId: number, dbPath?: string): PermissionRecord | null => {
  try {
    const database = getInitializedDatabase(dbPath);
    const statement = database.prepare(SELECT_PERMISSION_BY_ID);
    const row = statement.get(permissionId) as PermissionRecord | undefined;
    return row ?? null;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError("Failed to retrieve permission", 500);
  }
};

export const createPermissionForUser = (
  userId: string,
  input: PermissionMutationInput,
  dbPath?: string,
): PermissionRecord => {
  try {
    const database = getInitializedDatabase(dbPath);
    const statement = database.prepare(INSERT_PERMISSION);
    const result = statement.run(userId, input.action, input.resource, input.effect);
    const created = getPermissionById(Number(result.lastInsertRowid), dbPath);

    if (!created) {
      throw new AppError("Failed to create permission", 500);
    }

    return created;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError("Failed to create permission", 500);
  }
};

export const updatePermissionById = (
  permissionId: number,
  input: PermissionMutationInput,
  dbPath?: string,
): PermissionRecord | null => {
  try {
    const database = getInitializedDatabase(dbPath);
    const statement = database.prepare(UPDATE_PERMISSION_BY_ID);
    const result = statement.run(input.action, input.resource, input.effect, permissionId);

    if (result.changes === 0) {
      return null;
    }

    return getPermissionById(permissionId, dbPath);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError("Failed to update permission", 500);
  }
};

export const deletePermissionById = (permissionId: number, dbPath?: string): boolean => {
  try {
    const database = getInitializedDatabase(dbPath);
    const statement = database.prepare(DELETE_PERMISSION_BY_ID);
    const result = statement.run(permissionId);
    return result.changes > 0;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError("Failed to delete permission", 500);
  }
};
