import rateLimit, { ipKeyGenerator } from "express-rate-limit";

import { getRateLimitConfig } from "../config/env";
import { logger } from "../utils/logger";

export const createAuthorizeRateLimiter = () => {
  const { windowMs, maxRequests } = getRateLimitConfig();

  return rateLimit({
    windowMs,
    max: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req.ip || "unknown"),
    handler: (req, res) => {
      logger.warn("Authorization rate limit exceeded", {
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
        windowMs,
        maxRequests,
      });

      res.status(429).json({
        error: {
          message: "Too many requests",
          status: 429,
        },
      });
    },
  });
};
