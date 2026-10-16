import { NextFunction, Request, Response } from "express";
import { z, ZodError } from "zod";

import { AppError } from "../middleware/error-handler";
import {
  createPermissionForUser,
  deletePermissionById,
  getPermissionById,
  getPermissionsByUserId,
  listUserIds,
  updatePermissionById,
} from "../services/permission.repository";

const ACTIONS = ["read", "write", "delete"] as const;
const EFFECTS = ["allow", "deny"] as const;

const userIdSchema = z
  .string({ required_error: "userId is required", invalid_type_error: "userId must be a string" })
  .trim()
  .min(1, "userId must be a non-empty string");

const permissionIdSchema = z.coerce
  .number({ invalid_type_error: "permissionId must be a number" })
  .int("permissionId must be an integer")
  .positive("permissionId must be greater than zero");

const createPermissionSchema = z.object({
  action: z.enum(ACTIONS),
  resource: z
    .string({ required_error: "resource is required", invalid_type_error: "resource must be a string" })
    .trim()
    .min(1, "resource must be a non-empty string"),
  effect: z.enum(EFFECTS),
});

const updatePermissionSchema = z
  .object({
    action: z.enum(ACTIONS).optional(),
    resource: z.string().trim().min(1, "resource must be a non-empty string").optional(),
    effect: z.enum(EFFECTS).optional(),
  })
  .refine((value) => value.action !== undefined || value.resource !== undefined || value.effect !== undefined, {
    message: "At least one field is required",
  });

const buildValidationErrorResponse = (error: ZodError) => ({
  error: {
    message: "Invalid request",
    details: error.issues.map((issue) => ({
      field: issue.path[0]?.toString() ?? "body",
      message: issue.message,
    })),
  },
});

export const listUsers = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const users = await listUserIds();
    res.status(200).json({ users });
  } catch (error) {
    next(error);
  }
};

export const getUserPermissions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = userIdSchema.parse(req.params.userId);
    const permissions = await getPermissionsByUserId(userId);
    res.status(200).json({ user_id: userId, permissions });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json(buildValidationErrorResponse(error));
      return;
    }

    next(error);
  }
};

export const createUserPermission = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = userIdSchema.parse(req.params.userId);
    const input = createPermissionSchema.parse(req.body);
    const created = await createPermissionForUser(userId, input);

    res.status(201).json({
      permission: {
        id: created.id,
        user_id: created.user_id,
        action: created.action,
        resource: created.resource,
        effect: created.effect,
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json(buildValidationErrorResponse(error));
      return;
    }

    next(error);
  }
};

export const updatePermission = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const permissionId = permissionIdSchema.parse(req.params.permissionId);
    const input = updatePermissionSchema.parse(req.body);
    const existing = await getPermissionById(permissionId);

    if (!existing) {
      throw new AppError("Permission not found", 404);
    }

    const updated = await updatePermissionById(permissionId, {
      action: input.action ?? (existing.action as "read" | "write" | "delete"),
      resource: input.resource ?? existing.resource,
      effect: input.effect ?? (existing.effect as "allow" | "deny"),
    });

    if (!updated) {
      throw new AppError("Permission not found", 404);
    }

    res.status(200).json({ permission: updated });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json(buildValidationErrorResponse(error));
      return;
    }

    next(error);
  }
};

export const deletePermission = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const permissionId = permissionIdSchema.parse(req.params.permissionId);
    const deleted = await deletePermissionById(permissionId);

    if (!deleted) {
      throw new AppError("Permission not found", 404);
    }

    res.status(204).send();
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json(buildValidationErrorResponse(error));
      return;
    }

    next(error);
  }
};
