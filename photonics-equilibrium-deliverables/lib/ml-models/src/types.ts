export interface GraphNode {
  id: string;
  type: string;
  params: Record<string, number | undefined>;
}

export interface GraphEdge {
  source: string;
  target: string;
  sourcePort: string;
  targetPort: string;
}

export interface GraphInput {
  nodeFeatures: number[][];
  edgeIndex: [number[], number[]];
  edgeFeatures?: number[][];
  nodeIds: string[];
}

export interface PerNodePrediction {
  componentId: string;
  outputPower: number;
  loss: number;
  phase: number;
  status: 'ok' | 'warning' | 'error';
}

export interface GlobalPrediction {
  equilibriumScore: number;
  systemLoss: number;
  totalOutputPower: number;
  snr: number;
}

export interface PredictionOutput {
  nodeOutputs: PerNodePrediction[];
  globalOutputs: GlobalPrediction;
  latencyMs: number;
}

export interface GenerateRequest {
  targetWavelength: number;
  targetPower: number;
  targetSNR: number;
  maxComponents: number;
  topologyHint?: string;
}

export interface GenerateCandidate {
  nodes: GraphNode[];
  edges: GraphEdge[];
  predictedScore: number;
}

export interface GenerateResponse {
  candidates: GenerateCandidate[];
  latencyMs: number;
}

export interface TrainingExample {
  graph: GraphInput;
  nodeTargets: number[][];
  globalTargets: number[];
  metadata: {
    topology: string;
    componentCount: number;
    source: 'synthetic' | 'user_verified';
  };
}
