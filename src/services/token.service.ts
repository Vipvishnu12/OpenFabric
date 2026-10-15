import fs from "node:fs";
import path from "node:path";

import { createRemoteJWKSet, importJWK, jwtVerify, type JWTPayload, type JWTVerifyOptions, type JWK } from "jose";

import { getAuthConfig } from "../config/env";
import { AppError } from "../middleware/error-handler";

export interface ValidatedTokenResult {
  user_id: string;
  claims: JWTPayload & {
    sub: string;
    aud?: string | string[];
    iss?: string;
    exp?: number;
    nbf?: number;
  };
}

const ALLOWED_ALGORITHMS = ["RS256"] as const;
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
type ImportedLocalKey = Awaited<ReturnType<typeof importJWK>>;

const getJwksResolver = (issuerUrl: string) => {
  // Cache the JWKS resolver per issuer to avoid repeated network setup.
  const existing = jwksCache.get(issuerUrl);
  if (existing) {
    return existing;
  }

  const resolver = createRemoteJWKSet(new URL("/.well-known/jwks.json", issuerUrl));
  jwksCache.set(issuerUrl, resolver);
  return resolver;
};

export const validateAccessToken = async (token: string): Promise<ValidatedTokenResult> => {
  if (!token || typeof token !== "string" || token.trim() === "") {
    throw new AppError("Authentication failed", 401);
  }
  try {
    // Verify the token signature and standard claims against the configured issuer.
    const config = getAuthConfig();
    const jwks = getJwksResolver(config.auth0IssuerUrl);
    const verifyOptions: JWTVerifyOptions = {
      issuer: config.auth0IssuerUrl,
      audience: config.auth0Audience,
      algorithms: [...ALLOWED_ALGORITHMS],
    };

    const { payload } = await jwtVerify(token, jwks, verifyOptions);

    if (!payload || typeof payload !== "object") {
      throw new AppError("Authentication failed", 401);
    }

    const claims = payload as JWTPayload & {
      sub: string;
      aud?: string | string[];
      iss?: string;
      exp?: number;
      nbf?: number;
    };

    if (typeof claims.sub !== "string" || claims.sub.trim() === "") {
      throw new AppError("Authentication failed", 401);
    }

    // Reject tokens with a mismatched issuer or invalid not-before claim.
    if (typeof claims.iss !== "string" || claims.iss !== config.auth0IssuerUrl) {
      throw new AppError("Authentication failed", 401);
    }

    if (claims.nbf !== undefined && (typeof claims.nbf !== "number" || Number.isNaN(claims.nbf))) {
      throw new AppError("Authentication failed", 401);
    }

    return {
      user_id: claims.sub,
      claims,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    // Treat key and verification failures as authentication or availability errors.
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: string }).code)
        : "";
    const message = error instanceof Error ? error.message : "";

    if (code === "ERR_JWKS_NO_MATCHING_KEY" || code === "ERR_JWKS_TIMEOUT" || code === "ERR_JWKS_INVALID_RESPONSE" || code === "ERR_JWKS_FETCH_ERROR") {
      throw new AppError("Authentication service temporarily unavailable", 503);
    }

    if (
      code === "ERR_JWT_EXPIRED" ||
      code === "ERR_JWT_CLAIM_INVALID" ||
      code === "ERR_JWT_INVALID" ||
      /expired|invalid|issuer|audience|signature|claim/i.test(message)
    ) {
      throw new AppError("Authentication failed", 401);
    }

    throw new AppError("Authentication service temporarily unavailable", 503);
  }
};
