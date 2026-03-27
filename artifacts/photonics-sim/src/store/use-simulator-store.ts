import { create } from 'zustand';
import { Node, Edge, Connection as FlowConnection } from '@xyflow/react';
import { ComponentParams, ComponentType, SimulationResult } from '@workspace/api-client-react';

export type PhotonNodeData = {
  label: string;
  type: ComponentType;
  params: ComponentParams;
  hasError?: boolean;
  hasWarning?: boolean;
};

export type PhotonNode = Node<PhotonNodeData>;

const normalizeHandle = (handle: string | null | undefined, fallback: string): string =>
  handle ?? fallback;

const getEdgeIdBase = (connection: FlowConnection): string => {
  const sourceHandle = normalizeHandle(connection.sourceHandle, 'out');
  const targetHandle = normalizeHandle(connection.targetHandle, 'in');
  return `e-${connection.source}-${sourceHandle}-${connection.target}-${targetHandle}`;
};

const getUniqueEdgeId = (connection: FlowConnection, edges: Edge[]): string => {
  const baseId = getEdgeIdBase(connection);

  if (!edges.some((edge) => edge.id === baseId)) {
    return baseId;
  }

  const suffixPattern = new RegExp(`^${baseId}-(\\d+)$`);
  let maxSuffix = 1;

  edges.forEach((edge) => {
    const match = edge.id.match(suffixPattern);
    if (match) {
      maxSuffix = Math.max(maxSuffix, Number(match[1]));
    }
  });

  return `${baseId}-${maxSuffix + 1}`;
};

// ML prediction types (local definitions to avoid cross-package build issues)
interface MLNodePrediction {
  componentId: string;
  outputPower: number;
  loss: number;
  phase: number;
  status: 'ok' | 'warning' | 'error';
}

interface MLGlobalPrediction {
  equilibriumScore: number;
  systemLoss: number;
  totalOutputPower: number;
  snr: number;
  coherenceLength?: number | null;
}

export interface PredictionOutput {
  nodeOutputs: MLNodePrediction[];
  globalOutputs: MLGlobalPrediction;
  latencyMs: number;
}

type NodeStatus = 'ok' | 'warning' | 'error';

function applyNodeStatuses(
  nodes: PhotonNode[],
  statuses: ReadonlyMap<string, NodeStatus> = new Map(),
): PhotonNode[] {
  return nodes.map((node) => {
    const status = statuses.get(node.id);
    return {
      ...node,
      data: {
        ...node.data,
        hasError: status === 'error',
        hasWarning: status === 'warning',
      },
    };
  });
}

interface SimulatorState {
  // Canvas State
  nodes: PhotonNode[];
  edges: Edge[];
  selectedNodeId: string | null;
  
  // App State
  activeBuildId: number | null;
  isSimulating: boolean;
  activeSimulationResult: SimulationResult | null;
  activePanelTab: 'properties' | 'diagnostics' | 'inverse-design';

  // ML Prediction State
  mlPredictions: PredictionOutput | null;
  mlMode: 'off' | 'instant' | 'physics';
  mlModelLoaded: boolean;
  mlModelVersion: string | null;
  mlLatencyMs: number | null;

  // Actions
  setNodes: (nodes: PhotonNode[] | ((nodes: PhotonNode[]) => PhotonNode[])) => void;
  setEdges: (edges: Edge[] | ((edges: Edge[]) => Edge[])) => void;
  addNode: (node: PhotonNode) => void;
  updateNodeData: (id: string, data: Partial<PhotonNodeData>) => void;
  onConnect: (connection: FlowConnection) => void;
  setSelectedNode: (id: string | null) => void;
  setActiveBuild: (id: number | null) => void;
  setSimulating: (isSimulating: boolean) => void;
  setSimulationResult: (result: SimulationResult | null) => void;
  setActivePanelTab: (tab: 'properties' | 'diagnostics' | 'inverse-design') => void;
  clearWorkspace: () => void;

  // ML Actions
  setMlPredictions: (predictions: PredictionOutput | null) => void;
  setMlMode: (mode: 'off' | 'instant' | 'physics') => void;
  setMlModelStatus: (loaded: boolean, version: string | null) => void;
}

export const useSimulatorStore = create<SimulatorState>((set) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  activeBuildId: null,
  isSimulating: false,
  activeSimulationResult: null,
  activePanelTab: 'properties',
  mlPredictions: null,
  mlMode: 'physics',
  mlModelLoaded: false,
  mlModelVersion: null,
  mlLatencyMs: null,

  setNodes: (nodes) => set((state) => ({ 
    nodes: typeof nodes === 'function' ? nodes(state.nodes) : nodes 
  })),
  setEdges: (edges) => set((state) => ({ 
    edges: typeof edges === 'function' ? edges(state.edges) : edges 
  })),
  
  addNode: (node) => set((state) => ({ nodes: [...state.nodes, node] })),
  
  updateNodeData: (id, data) => set((state) => ({
    nodes: state.nodes.map((node) => 
      node.id === id ? { ...node, data: { ...node.data, ...data } } : node
    )
  })),

  onConnect: (connection) => set((state) => ({
    edges: [...state.edges, { 
      id: getUniqueEdgeId(connection, state.edges),
      ...connection,
      animated: true, // Make connections pulse by default
      style: { strokeWidth: 2 }
    }]
  })),

  setSelectedNode: (id) => set({ selectedNodeId: id }),
  setActiveBuild: (id) => set({ activeBuildId: id }),
  setSimulating: (isSimulating) => set({ isSimulating }),
  setSimulationResult: (result) => set((state) => {
    // When we get results, we might want to highlight nodes with errors
    if (!result) return { activeSimulationResult: null };
    
    const nodeUpdates = new Map<string, NodeStatus>();
    result.componentResults.forEach((cr: any) => {
      nodeUpdates.set(cr.componentId, cr.status);
    });

    return { 
      activeSimulationResult: result,
      activePanelTab: result.issues.length > 0 ? 'diagnostics' : 'properties',
      nodes: state.mlMode === 'instant' && state.mlPredictions
        ? state.nodes
        : applyNodeStatuses(state.nodes, nodeUpdates),
    };
  }),
  setActivePanelTab: (tab) => set({ activePanelTab: tab }),
  clearWorkspace: () => set({
    nodes: [], edges: [], selectedNodeId: null, activeSimulationResult: null,
    mlPredictions: null, mlLatencyMs: null,
  }),

  // ML Actions
  setMlPredictions: (predictions) => set((state) => {
    const nodeUpdates = new Map<string, NodeStatus>();
    predictions?.nodeOutputs.forEach((prediction) => {
      nodeUpdates.set(prediction.componentId, prediction.status);
    });

    return {
      mlPredictions: predictions,
      mlLatencyMs: predictions?.latencyMs ?? null,
      nodes: state.mlMode === 'instant'
        ? applyNodeStatuses(state.nodes, nodeUpdates)
        : state.nodes,
    };
  }),
  setMlMode: (mode) => set((state) => {
    const mlStatuses = new Map<string, NodeStatus>();
    state.mlPredictions?.nodeOutputs.forEach((prediction) => {
      mlStatuses.set(prediction.componentId, prediction.status);
    });

    const physicsStatuses = new Map<string, NodeStatus>();
    state.activeSimulationResult?.componentResults.forEach((component: any) => {
      physicsStatuses.set(component.componentId, component.status);
    });

    return {
      mlMode: mode,
      nodes: mode === 'instant'
        ? applyNodeStatuses(state.nodes, mlStatuses)
        : applyNodeStatuses(state.nodes, physicsStatuses),
    };
  }),
  setMlModelStatus: (loaded, version) => set({ mlModelLoaded: loaded, mlModelVersion: version }),
}));
