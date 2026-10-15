import express, { NextFunction, Request, Response } from "express";
import path from "node:path";
import dotenv from "dotenv";

import authorizeRoutes from "./routes/authorize.routes";
import publicRoutes from "./routes/public.routes";
import { errorHandler } from "./middleware/error-handler";
import { logger } from "./utils/logger";

dotenv.config();

export const createApp = () => {
  const app = express();
  const publicDirectory = path.resolve(process.cwd(), "public");
  const auth0SdkDirectory = path.resolve(process.cwd(), "node_modules/@auth0/auth0-spa-js/dist");

  // Parse JSON once at the edge so handlers can assume a request body object.
  app.use(express.json({ strict: true }));

  // Publish the browser app configuration and static assets.
  app.use(publicRoutes);
  app.use("/vendor", express.static(auth0SdkDirectory));
  app.use(express.static(publicDirectory));

  // Keep the health check simple and fast for readiness checks.
  app.get("/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      service: "auth-service",
      timestamp: new Date().toISOString(),
    });
  });

  // Mount the authorization endpoint group.
  app.use(authorizeRoutes);

  // Convert malformed JSON into a clean client response.
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof SyntaxError && "body" in err) {
      logger.warn("Malformed JSON request body", {
        method: _req.method,
        path: _req.originalUrl,
      });

      res.status(400).json({
        error: {
          message: "Invalid request body",
          details: [{ field: "body", message: "Malformed JSON" }],
        },
      });
      return;
    }

    errorHandler(err, _req, res, _next);
  });

  return app;
};

export default createApp();
