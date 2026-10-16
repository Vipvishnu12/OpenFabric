import { NextFunction, Request, Response, Router } from "express";

import {
  createUserPermission,
  deletePermission,
  getUserPermissions,
  listUsers,
  updatePermission,
} from "../controllers/permissions.controller";

const router = Router();

router.get("/permissions/users", (req: Request, res: Response, next: NextFunction) => {
  void listUsers(req, res, next).catch(next);
});
router.get("/permissions/users/:userId", (req: Request, res: Response, next: NextFunction) => {
  void getUserPermissions(req, res, next).catch(next);
});
router.post("/permissions/users/:userId", (req: Request, res: Response, next: NextFunction) => {
  void createUserPermission(req, res, next).catch(next);
});
router.patch("/permissions/:permissionId", (req: Request, res: Response, next: NextFunction) => {
  void updatePermission(req, res, next).catch(next);
});
router.delete("/permissions/:permissionId", (req: Request, res: Response, next: NextFunction) => {
  void deletePermission(req, res, next).catch(next);
});

export default router;
