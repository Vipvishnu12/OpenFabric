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

export interface FrontendConfig {
  apiBaseUrl: string;
  auth0Audience: string;
  auth0ClientId: string;
  auth0Domain: string;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const getRequiredEnv = (name: string): string => {
  const value = process.env[name];

  if (!value || value.trim() === "") {
    throw new AppError(`Server authentication configuration is missing: ${name}`, 500);
  }

  return value.trim();
};

const getOptionalEnv = (name: string): string => {
  const value = process.env[name];
  return value ? value.trim() : "";
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

const getNumberEnv = (name: string, fallback: number): number => {
  const rawValue = process.env[name];

  if (rawValue === undefined || rawValue.trim() === "") {
    return fallback;
  }

  const parsedValue = Number(rawValue);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
};

export const getRateLimitConfig = (): RateLimitConfig => ({
  windowMs: getNumberEnv("AUTH_RATE_LIMIT_WINDOW_MS", 60_000),
  maxRequests: getNumberEnv("AUTH_RATE_LIMIT_MAX_REQUESTS", 20),
});

export const getFrontendConfig = (): FrontendConfig => {
  const auth0Audience = getOptionalEnv("AUTH0_AUDIENCE");
  const auth0ClientId = getOptionalEnv("AUTH0_CLIENT_ID");
  const issuerUrl = getOptionalEnv("AUTH0_ISSUER_URL");

  return {
    apiBaseUrl: (process.env.PUBLIC_API_BASE_URL ?? "").trim(),
    auth0Audience,
    auth0ClientId,
    auth0Domain: issuerUrl ? getAuth0Domain(issuerUrl) : "",
  };
};
