import app from "./app";
import { getAuthConfig } from "./config/env";
import { initializeDatabase } from "./db/sqlite";

import { logger } from "./utils/logger";

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection", reason);
  process.exit(1);
});

const start = () => {
  try {
    initializeDatabase();

    const { port } = getAuthConfig();

    app.listen(port, () => {
      logger.info(`Auth service running on http://localhost:${port}`);
      logger.info(`Log file: ${logger.filePath}`);
    });
  } catch (error) {
    logger.error("Failed to start auth service", error);
    process.exit(1);
  }
};

start();
