import { Router } from "express";
import { loginWithRoles, selectLoginRole, roleLoginGuard } from "../lib/role-login";
const router = Router();
router.post("/auth/role-login", roleLoginGuard, loginWithRoles);
router.post("/auth/select-role", roleLoginGuard, selectLoginRole);
// Existing callers must not silently prefer owners over photographers.
router.post("/owner-login", roleLoginGuard, loginWithRoles);
export default router;
