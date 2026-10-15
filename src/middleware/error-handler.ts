import { NextFunction, Request, Response } from "express";

import { logger } from "../utils/logger";

export class AppError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
  }
}

export const errorHandler = (
  error: Error & { statusCode?: number },
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  const statusCode = error.statusCode ?? 500;
  const message = error.message || "Internal Server Error";

  const logPayload = {
    method: req.method,
    path: req.originalUrl,
    statusCode,
    message,
    errorName: error.name,
  };

  if (statusCode >= 500) {
    logger.error("Request failed", logPayload, error.stack);
  } else {
    logger.warn("Request failed", logPayload);
  }

  res.status(statusCode).json({
    error: {
      message,
      status: statusCode,
    },
  });
};
