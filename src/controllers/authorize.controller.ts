import { NextFunction, Request, Response } from "express";
import { z, ZodError } from "zod";

import { evaluateAuthorizationDecision } from "../services/authorization.service";
import { getPermissionsByUserId } from "../services/permission.repository";
import { AppError } from "../middleware/error-handler";
import { validateAccessToken } from "../services/token.service";
import { insertAuthorizationAuditLog } from "../services/audit-log.repository";
import { AuthorizationRequest, HTTP_METHODS } from "../types/authorization";
import { logger } from "../utils/logger";

const authorizeRequestSchema = z.object({
  access_token: z
    .string({ required_error: "access_token is required", invalid_type_error: "access_token must be a string" })
    .trim()
    .min(1, "access_token must be a non-empty string"),
  method: z.enum(HTTP_METHODS, {
    required_error: "method is required",
    invalid_type_error: "method must be a string",
  }),
  path: z
    .string({ required_error: "path is required", invalid_type_error: "path must be a string" })
    .trim()
    .min(1, "path must be a non-empty string")
    .refine((value) => value.startsWith("/"), {
      message: "path must start with /",
    }),
});

const buildValidationErrorResponse = (error: ZodError) => ({
  error: {
    message: "Invalid request body",
    details: error.issues.map((issue) => ({
      field: issue.path[0]?.toString() ?? "body",
      message: issue.message,
    })),
  },
});

export const authorize = async (
  req: Request<{}, {}, AuthorizationRequest>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // Validate the incoming request before touching auth or database state.
    const validated = authorizeRequestSchema.parse(req.body);

    // Verify the access token and load the caller's permissions.
    const authenticatedUser = await validateAccessToken(validated.access_token);
    const permissions = await getPermissionsByUserId(authenticatedUser.user_id);

    // Evaluate the request against the permission rules.
    const decision = evaluateAuthorizationDecision({
      method: validated.method,
      path: validated.path,
      permissions,
    });

    const matchedPermissions = decision.matchedPermissions.map((permission) => ({
      action: permission.action,
      resource: permission.resource,
      effect: permission.effect,
    }));

    // Persist an audit trail for every authorization decision.
    await insertAuthorizationAuditLog({
      userId: authenticatedUser.user_id,
      method: validated.method,
      path: validated.path,
      action: decision.action,
      decision: decision.decision,
      reason: decision.reason,
      matchedPermissions,
    });

    logger.info("Authorization decision", {
      userId: authenticatedUser.user_id,
      method: validated.method,
      path: validated.path,
      action: decision.action,
      decision: decision.decision,
      reason: decision.reason,
      matchedPermissions,
    });

    res.status(200).json({
      decision: decision.decision,
      user_id: authenticatedUser.user_id,
      reason: decision.reason,
      matched_permissions: decision.matchedPermissions.map((permission) => ({
        action: permission.action,
        resource: permission.resource,
        effect: permission.effect,
      })),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json(buildValidationErrorResponse(error));
      return;
    }

    if (error instanceof AppError) {
      next(error);
      return;
    }

    next(new AppError("Internal Server Error", 500));
  }
};
