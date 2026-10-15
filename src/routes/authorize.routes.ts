import { Router } from "express";

import { authorize } from "../controllers/authorize.controller";
import { createAuthorizeRateLimiter } from "../middleware/rate-limit";

const router = Router();

// Expose a single authorization entry point with a per-IP request cap.
router.post("/authorize", createAuthorizeRateLimiter(), authorize);

export default router;
