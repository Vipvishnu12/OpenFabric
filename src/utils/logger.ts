import fs from "node:fs";
import path from "node:path";

type LogLevel = "INFO" | "WARN" | "ERROR";

const logFilePath = (() => {
  const configuredPath = process.env.LOG_FILE_PATH?.trim();

  return configuredPath && configuredPath.length > 0
    ? path.resolve(configuredPath)
    : path.resolve(process.cwd(), "logs", "auth-service.log");
})();

const ensureLogDirectory = (): void => {
  fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
};

const formatValue = (value: unknown): string => {
  if (value instanceof Error) {
    return value.stack ?? `${value.name}: ${value.message}`;
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const writeLine = (level: LogLevel, message: string, details: unknown[] = []): void => {
  const timestamp = new Date().toISOString();
  const suffix = details.length > 0 ? ` ${details.map(formatValue).join(" ")}` : "";
  const line = `[${timestamp}] ${level} ${message}${suffix}`;

  if (level === "ERROR") {
    console.error(line);
  } else if (level === "WARN") {
    console.warn(line);
  } else {
    console.log(line);
  }

  try {
    ensureLogDirectory();
    fs.appendFileSync(logFilePath, `${line}\n`);
  } catch (error) {
    console.error(`[${timestamp}] ERROR Failed to write log file`, formatValue(error));
  }
};

export const logger = {
  info: (message: string, ...details: unknown[]): void => writeLine("INFO", message, details),
  warn: (message: string, ...details: unknown[]): void => writeLine("WARN", message, details),
  error: (message: string, ...details: unknown[]): void => writeLine("ERROR", message, details),
  filePath: logFilePath,
};