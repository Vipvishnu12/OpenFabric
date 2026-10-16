import dotenv from "dotenv";

import { AppError } from "../middleware/error-handler";

dotenv.config();

export interface AuthConfig {
  auth0IssuerUrl: string;
  auth0Audience: string;
  port: number;
}

export interface DatabaseConfig {
  sqliteDbPath: string;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export interface FrontendConfig {
  apiBaseUrl: string;
  auth0Audience: string;
  auth0ClientId: string;
  auth0Domain: string;
}

const getRequiredEnv = (name: string): string => {
  const value = process.env[name];

  if (!value || value.trim() === "") {
    throw new AppError(`Server authentication configuration is missing: ${name}`, 500);
  }

  return value.trim();
};

const isTruthyEnvValue = (value: string | undefined): boolean => {
  if (!value) {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
};

const isProductionEnvironment = (): boolean => (process.env.NODE_ENV ?? "").trim().toLowerCase() === "production";

const getAuth0Domain = (issuerUrl: string): string => {
  try {
    return new URL(issuerUrl).host;
  } catch {
    throw new AppError("Server authentication configuration is invalid: AUTH0_ISSUER_URL", 500);
  }
};

export const getAuthConfig = (): AuthConfig => ({
  // Keep runtime configuration in one place.
  auth0IssuerUrl: getRequiredEnv("AUTH0_ISSUER_URL"),
  auth0Audience: getRequiredEnv("AUTH0_AUDIENCE"),
  port: Number(process.env.PORT ?? "3000"),
});

export const getDatabaseConfig = (): DatabaseConfig => ({
  // Default to the repo-local database unless overridden.
  sqliteDbPath: (process.env.SQLITE_DB_PATH ?? "data/permissions.db").trim() || "data/permissions.db",
});

export const getRateLimitConfig = (): RateLimitConfig => {
  const windowMs = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS ?? "60000");
  const maxRequests = Number(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS ?? "60");

  return {
    windowMs: Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 60000,
    maxRequests: Number.isFinite(maxRequests) && maxRequests > 0 ? maxRequests : 60,
  };
};

export const getFrontendConfig = (): FrontendConfig => ({
  apiBaseUrl: (process.env.PUBLIC_API_BASE_URL ?? "").trim(),
  auth0Audience: getRequiredEnv("AUTH0_AUDIENCE"),
  auth0ClientId: getRequiredEnv("AUTH0_CLIENT_ID"),
  auth0Domain: getAuth0Domain(getRequiredEnv("AUTH0_ISSUER_URL")),
});
