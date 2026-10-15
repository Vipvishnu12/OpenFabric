import { Router } from "express";

import { getFrontendConfig } from "../config/env";

const router = Router();

router.get("/config", (_req, res) => {
  res.status(200).json(getFrontendConfig());
});

export default router;