import { Router } from "express";

import {
  createUserPermission,
  deletePermission,
  getUserPermissions,
  listUsers,
  updatePermission,
} from "../controllers/permissions.controller";

const router = Router();

router.get("/permissions/users", listUsers);
router.get("/permissions/users/:userId", getUserPermissions);
router.post("/permissions/users/:userId", createUserPermission);
router.patch("/permissions/:permissionId", updatePermission);
router.delete("/permissions/:permissionId", deletePermission);

export default router;
