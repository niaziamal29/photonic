/**
 * ML Inference stub.
 * Will be replaced with real ONNX Runtime inference in a later task.
 */

let _modelLoaded = false;
let _modelVersion = "none";

export function isModelLoaded(): boolean {
  return _modelLoaded;
}

export function getModelVersion(): string {
  return _modelVersion;
}

export async function predict(
  _components: unknown[],
  _connections: unknown[],
): Promise<null> {
  // Stub: always returns null so the caller falls back to physics engine.
  return null;
}

/**
 * Load a model from disk. Stub — does nothing yet.
 */
export async function loadModel(_path: string): Promise<void> {
  // Will integrate ONNX Runtime in a later task.
  _modelLoaded = false;
  _modelVersion = "none";
}
