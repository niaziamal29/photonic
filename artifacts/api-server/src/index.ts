import app from "./app";
import { loadModel } from "./lib/mlInference.js";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Optionally load ML model
const modelPath = process.env.ML_MODEL_PATH;
if (modelPath) {
  loadModel(modelPath, process.env.ML_MODEL_VERSION).catch((err) =>
    logger.warn({ err }, "ML model not available, running physics engine only"),
  );
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
