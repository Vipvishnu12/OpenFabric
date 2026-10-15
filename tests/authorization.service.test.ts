import { describe, expect, it } from "vitest";

import { AppError } from "../src/middleware/error-handler";
import { evaluateAuthorizationDecision, mapHttpMethodToAction, resourceMatches } from "../src/services/authorization.service";
import type { PermissionRecord } from "../src/types/permission";

const createPermission = (
  id: number,
  user_id: string,
  action: PermissionRecord["action"],
  resource: string,
  effect: PermissionRecord["effect"],
): PermissionRecord => ({
  id,
  user_id,
  action,
  resource,
  effect,
});

describe("authorization service", () => {
  // Method-to-action mapping should stay explicit.
  it.each([
    ["GET", "read"],
    ["POST", "write"],
    ["PUT", "write"],
    ["PATCH", "write"],
    ["DELETE", "delete"],
  ] as const)("maps %s to %s", (method, expectedAction) => {
    expect(mapHttpMethodToAction(method)).toBe(expectedAction);
  });

  it("rejects unsupported HTTP methods", () => {
    expect(() => mapHttpMethodToAction("OPTIONS")).toThrow(AppError);
    expect(() => mapHttpMethodToAction("OPTIONS")).toThrow("Unsupported HTTP method");
  });

  it("matches exact resources", () => {
    expect(resourceMatches("transactions", "/transactions")).toBe(true);
  });

  it("matches wildcard segments", () => {
    expect(resourceMatches("wallets/*/transactions/*", "/wallets/wallet-456/transactions/txn-999")).toBe(true);
  });

  it("does not let wildcard consume multiple segments", () => {
    expect(resourceMatches("wallets/*/transactions/*", "/wallets/wallet-456/transactions/txn-999/extra")).toBe(false);
  });

  it("rejects different path lengths when inheritance does not apply", () => {
    expect(resourceMatches("wallets/wallet-789", "/wallets/wallet-789/transactions")).toBe(false);
  });

  it("does not allow partial segment matches", () => {
    expect(resourceMatches("accounts", "/accounts-extra")).toBe(false);
  });

  it("supports nested resource inheritance", () => {
    expect(resourceMatches("transactions", "/transactions/txn-456")).toBe(true);
  });

  // These cases exercise the precedence rules, not just path matching.
  it("does not inherit entity-level permissions into child collections", () => {
    const result = evaluateAuthorizationDecision({
      method: "POST",
      path: "/wallets/wallet-789/transactions",
      permissions: [createPermission(1, "user456", "write", "wallets/wallet-789", "allow")],
    });

    expect(result.decision).toBe("DENY");
    expect(result.reasonCode).toBe("NO_MATCH");
    expect(result.matchedPermissions).toEqual([]);
  });

  it("returns deny when no permission matches", () => {
    const result = evaluateAuthorizationDecision({
      method: "GET",
      path: "/unknown/resource",
      permissions: [createPermission(1, "user123", "read", "transactions", "allow")],
    });

    expect(result.decision).toBe("DENY");
    expect(result.reasonCode).toBe("NO_MATCH");
  });

  it("prefers a more specific allow over a less specific deny", () => {
    const result = evaluateAuthorizationDecision({
      method: "GET",
      path: "/wallets/wallet-789/transactions/txn-999",
      permissions: [
        createPermission(1, "user456", "read", "wallets/*", "deny"),
        createPermission(2, "user456", "read", "wallets/wallet-789/transactions", "allow"),
      ],
    });

    expect(result.decision).toBe("ALLOW");
    expect(result.reasonCode).toBe("MATCHED_ALLOW");
    expect(result.matchedPermissions).toHaveLength(1);
  });

  it("prefers deny when specificity is equal", () => {
    const result = evaluateAuthorizationDecision({
      method: "GET",
      path: "/transactions",
      permissions: [
        createPermission(1, "user123", "read", "transactions", "allow"),
        createPermission(2, "user123", "read", "transactions", "deny"),
      ],
    });

    expect(result.decision).toBe("DENY");
    expect(result.reasonCode).toBe("MATCHED_DENY");
    expect(result.matchedPermissions).toHaveLength(1);
  });

  it("applies wildcard rules across nested descendants", () => {
    const result = evaluateAuthorizationDecision({
      method: "POST",
      path: "/wallets/wallet-456/transactions/txn-999",
      permissions: [createPermission(1, "user789", "write", "wallets/*/transactions/*", "allow")],
    });

    expect(result.decision).toBe("ALLOW");
    expect(result.matchedPermissions).toHaveLength(1);
  });
});
