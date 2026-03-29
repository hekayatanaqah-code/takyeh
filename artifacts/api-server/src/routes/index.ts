import { Router, type IRouter } from "express";
import healthRouter from "./health";
import chaletsRouter from "./chalets";
import submissionsRouter from "./submissions";
import authRouter from "./auth";
import storageRouter from "./storage";
import adminRouter from "./admin";
import catalogRouter from "./catalog";
import servicesRouter from "./services";
import ownerRouter from "./owner";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(storageRouter);
router.use("/chalets", chaletsRouter);
router.use("/submissions", submissionsRouter);
router.use("/admin", adminRouter);
router.use(catalogRouter);
router.use("/services", servicesRouter);
router.use("/owner", ownerRouter);

export default router;
