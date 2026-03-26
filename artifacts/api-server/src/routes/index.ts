import { Router, type IRouter } from "express";
import healthRouter from "./health";
import buildsRouter from "./builds";
import componentsRouter from "./components";
import predictRouter from "./predict";
import generateRouter from "./generate";
import mlStatusRouter from "./mlStatus.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/builds", buildsRouter);
router.use("/components", componentsRouter);
router.use("/predict", predictRouter);
router.use("/generate", generateRouter);
router.use("/ml", mlStatusRouter);

export default router;
