import { Router, type IRouter } from "express";
import healthRouter from "./health";
import chaletsRouter from "./chalets";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/chalets", chaletsRouter);

export default router;
