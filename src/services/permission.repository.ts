import { AppError } from "../middleware/error-handler";
import { initializeDatabase, getDatabase } from "../db/sqlite";
import type { PermissionRecord } from "../types/permission";

const SELECT_PERMISSIONS_BY_USER_ID = `
  SELECT id, user_id, action, resource, effect
  FROM user_permissions
  WHERE user_id = ?
  ORDER BY id ASC
`;

export const getPermissionsByUserId = (userId: string, dbPath?: string): PermissionRecord[] => {
  if (typeof userId !== "string" || userId.trim() === "") {
    throw new AppError("Invalid user identity", 500);
  }

  try {
    // Read permissions through the shared database bootstrap.
    initializeDatabase(dbPath);
    const database = getDatabase(dbPath);
    const statement = database.prepare(SELECT_PERMISSIONS_BY_USER_ID);
    return statement.all(userId) as PermissionRecord[];
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError("Failed to retrieve permissions", 500);
  }
};
