import { NextFunction, Request, Response, Router } from "express";

import { authorize } from "../controllers/authorize.controller";
import { createAuthorizeRateLimiter } from "../middleware/rate-limit";

const router = Router();

// Expose a single authorization entry point with a per-IP request cap.
router.post("/authorize", createAuthorizeRateLimiter(), (req: Request, res: Response, next: NextFunction) => {
	void authorize(req, res, next).catch(next);
});

export default router;
