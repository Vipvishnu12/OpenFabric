import { AppError } from "../middleware/error-handler";
import type { PermissionRecord } from "../types/permission";

export type PermissionAction = "read" | "write" | "delete";
export type AuthorizationDecision = "ALLOW" | "DENY";
export type AuthorizationDecisionReasonCode = "MATCHED_ALLOW" | "MATCHED_DENY" | "NO_MATCH";

export interface AuthorizationEvaluationInput {
  method: string;
  path: string;
  permissions: PermissionRecord[];
}

export interface AuthorizationEvaluationResult {
  decision: AuthorizationDecision;
  reason: string;
  reasonCode: AuthorizationDecisionReasonCode;
  action: PermissionAction;
  matchedPermissions: PermissionRecord[];
}

interface PermissionMatchCandidate {
  permission: PermissionRecord;
  literalSegments: number;
  totalSegments: number;
}

const METHOD_TO_ACTION: Record<string, PermissionAction> = {
  GET: "read",
  POST: "write",
  PUT: "write",
  PATCH: "write",
  DELETE: "delete",
};

const normalizePath = (value: string): string => value.trim().replace(/^\/+|\/+$/g, "");

const splitSegments = (value: string): string[] => {
  const normalized = normalizePath(value);

  if (normalized === "") {
    return [];
  }

  return normalized.split("/").filter((segment) => segment.length > 0);
};

const isCollectionResource = (segments: string[]): boolean => {
  if (segments.length === 0) {
    return false;
  }

  // In a REST-style path, odd segment counts represent collection resources.
  return segments.length % 2 === 1;
};

const normalizeEffect = (value: string): "allow" | "deny" => {
  const normalized = value.trim().toLowerCase();

  if (normalized !== "allow" && normalized !== "deny") {
    throw new AppError("Invalid permission effect", 500);
  }

  return normalized;
};

export const mapHttpMethodToAction = (method: string): PermissionAction => {
  const action = METHOD_TO_ACTION[method.toUpperCase()];

  if (!action) {
    throw new AppError(`Unsupported HTTP method: ${method}`, 400);
  }

  return action;
};

export const resourceMatches = (permissionResource: string, requestPath: string): boolean => {
  const permissionSegments = splitSegments(permissionResource);
  const requestSegments = splitSegments(requestPath);

  // A single wildcard resource matches every request path.
  if (permissionSegments.length === 1 && permissionSegments[0] === "*") {
    return true;
  }

  // Exact resource depth match, allowing segment wildcards.
  if (permissionSegments.length === requestSegments.length) {
    return permissionSegments.every((segment, index) => segment === "*" || segment === requestSegments[index]);
  }

  // Collection resources can match one nested child path.
  if (requestSegments.length === permissionSegments.length + 1 && isCollectionResource(permissionSegments)) {
    return permissionSegments.every((segment, index) => segment === "*" || segment === requestSegments[index]);
  }

  return false;
};

const calculateSpecificity = (permissionResource: string) => {
  const segments = splitSegments(permissionResource);

  return {
    literalSegments: segments.filter((segment) => segment !== "*").length,
    totalSegments: segments.length,
  };
};

const comparePermissionCandidates = (left: PermissionMatchCandidate, right: PermissionMatchCandidate): number => {
  // Rank by specificity first, then deny wins on a tie.
  if (left.literalSegments !== right.literalSegments) {
    return right.literalSegments - left.literalSegments;
  }

  if (left.totalSegments !== right.totalSegments) {
    return right.totalSegments - left.totalSegments;
  }

  const leftEffect = normalizeEffect(left.permission.effect);
  const rightEffect = normalizeEffect(right.permission.effect);

  if (leftEffect !== rightEffect) {
    return leftEffect === "deny" ? -1 : 1;
  }

  return left.permission.id - right.permission.id;
};

export const evaluateAuthorizationDecision = (
  input: AuthorizationEvaluationInput,
): AuthorizationEvaluationResult => {
  const action = mapHttpMethodToAction(input.method);
  const requestPath = normalizePath(input.path);

  // Filter matching permissions, then rank the most specific rule first.
  const matchingPermissions = input.permissions
    .filter((permission) => permission.action === action && resourceMatches(permission.resource, requestPath))
    .map((permission) => ({
      permission,
      ...calculateSpecificity(permission.resource),
    }))
    .sort(comparePermissionCandidates);

  if (matchingPermissions.length === 0) {
    return {
      // Default deny when no rule matches.
      decision: "DENY",
      reasonCode: "NO_MATCH",
      reason: `No matching permission for ${action} ${requestPath || "/"}`,
      action,
      matchedPermissions: [],
    };
  }

  const winningPermission = matchingPermissions[0].permission;
  const effect = normalizeEffect(winningPermission.effect);
  const decision = effect === "allow" ? "ALLOW" : "DENY";

  return {
    // The top-ranked rule decides the final outcome.
    decision,
    reasonCode: decision === "ALLOW" ? "MATCHED_ALLOW" : "MATCHED_DENY",
    reason:
      decision === "ALLOW"
        ? `User has ${action} permission for ${winningPermission.resource}`
        : `User is denied ${action} permission for ${winningPermission.resource}`,
    action,
    matchedPermissions: [winningPermission],
  };
};
