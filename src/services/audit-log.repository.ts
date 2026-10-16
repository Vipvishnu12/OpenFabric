import { AppError } from "../middleware/error-handler";
import { getDatabase, initializeDatabase } from "../db/sqlite";

export interface AuthorizationAuditLogInput {
  userId: string;
  method: string;
  path: string;
  action: string;
  decision: "ALLOW" | "DENY";
  reason: string;
  matchedPermissions: Array<{ action: string; resource: string; effect: string }>;
}

const INSERT_AUDIT_LOG = `
  INSERT INTO authorization_audit_logs (
    user_id,
    method,
    path,
    action,
    decision,
    reason,
    matched_permissions_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`;

export const insertAuthorizationAuditLog = async (input: AuthorizationAuditLogInput, dbPath?: string): Promise<void> => {
  if (!input.userId || !input.method || !input.path || !input.action || !input.decision || !input.reason) {
    throw new AppError("Invalid authorization audit payload", 500);
  }

  try {
    // Persist the decision snapshot for later review.
    await initializeDatabase(dbPath);
    const database = await getDatabase(dbPath);
    await database.run(INSERT_AUDIT_LOG, [
      input.userId,
      input.method.toUpperCase(),
      input.path,
      input.action,
      input.decision,
      input.reason,
      JSON.stringify(input.matchedPermissions),
    ]);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError("Failed to persist authorization audit log", 500);
  }
};
