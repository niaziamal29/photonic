import { Router, type IRouter } from "express";
import healthRouter from "./health";
import buildsRouter from "./builds";
import componentsRouter from "./components";
import predictRouter from "./predict";
import generateRouter from "./generate";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/builds", buildsRouter);
router.use("/components", componentsRouter);
router.use("/predict", predictRouter);
router.use("/generate", generateRouter);

export default router;
