import { Router, type IRouter } from "express";
import healthRouter from "./health";
import buildsRouter from "./builds";
import componentsRouter from "./components";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/builds", buildsRouter);
router.use("/components", componentsRouter);

export default router;
