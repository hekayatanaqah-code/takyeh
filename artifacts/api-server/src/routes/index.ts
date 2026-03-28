import { Router, type IRouter } from "express";
import healthRouter from "./health";
import chaletsRouter from "./chalets";
import submissionsRouter from "./submissions";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/chalets", chaletsRouter);
router.use("/submissions", submissionsRouter);

export default router;
