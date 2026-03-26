import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Security headers
app.use(helmet());

// CORS — configurable origin
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") ?? [
  "http://localhost:5173",
];
app.use(cors({ origin: allowedOrigins }));

// Body parsing with size limit
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting — 100 req/min general
const generalLimiter = rateLimit({
  windowMs: 60_000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api", generalLimiter);

app.use("/api", router);

export default app;
