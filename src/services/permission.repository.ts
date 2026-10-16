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

const getInitializedDatabase = async (dbPath?: string) => {
  await initializeDatabase(dbPath);
  return getDatabase(dbPath);
};

export const getPermissionsByUserId = async (userId: string, dbPath?: string): Promise<PermissionRecord[]> => {
  if (typeof userId !== "string" || userId.trim() === "") {
    throw new AppError("Invalid user identity", 500);
  }

  try {
    // Read permissions through the shared database bootstrap.
    const database = await getInitializedDatabase(dbPath);
    return (await database.all(SELECT_PERMISSIONS_BY_USER_ID, [userId])) as PermissionRecord[];
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError("Failed to retrieve permissions", 500);
  }
};

export const listUserIds = async (dbPath?: string): Promise<string[]> => {
  try {
    const database = await getInitializedDatabase(dbPath);
    const rows = (await database.all(SELECT_DISTINCT_USERS)) as Array<{ user_id: string }>;
    return rows.map((row) => row.user_id);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError("Failed to retrieve users", 500);
  }
};

export const getPermissionById = async (permissionId: number, dbPath?: string): Promise<PermissionRecord | null> => {
  try {
    const database = await getInitializedDatabase(dbPath);
    const row = (await database.get(SELECT_PERMISSION_BY_ID, [permissionId])) as PermissionRecord | undefined;
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
): Promise<PermissionRecord> => {
  return (async () => {
    try {
      const database = await getInitializedDatabase(dbPath);
      const result = await database.run(INSERT_PERMISSION, [userId, input.action, input.resource, input.effect]);
      const created = await getPermissionById(Number(result.lastID), dbPath);

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
  })();
};

export const updatePermissionById = (
  permissionId: number,
  input: PermissionMutationInput,
  dbPath?: string,
): Promise<PermissionRecord | null> => {
  return (async () => {
    try {
      const database = await getInitializedDatabase(dbPath);
      const result = await database.run(UPDATE_PERMISSION_BY_ID, [input.action, input.resource, input.effect, permissionId]);

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
  })();
};

export const deletePermissionById = async (permissionId: number, dbPath?: string): Promise<boolean> => {
  try {
    const database = await getInitializedDatabase(dbPath);
    const result = await database.run(DELETE_PERMISSION_BY_ID, [permissionId]);
    return (result.changes ?? 0) > 0;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError("Failed to delete permission", 500);
  }
};
