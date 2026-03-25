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

interface SimulatorState {
  // Canvas State
  nodes: PhotonNode[];
  edges: Edge[];
  selectedNodeId: string | null;
  
  // App State
  activeBuildId: number | null;
  isSimulating: boolean;
  activeSimulationResult: SimulationResult | null;
  activePanelTab: 'properties' | 'diagnostics';

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
  setActivePanelTab: (tab: 'properties' | 'diagnostics') => void;
  clearWorkspace: () => void;
}

export const useSimulatorStore = create<SimulatorState>((set) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  activeBuildId: null,
  isSimulating: false,
  activeSimulationResult: null,
  activePanelTab: 'properties',

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
      id: `e-${connection.source}-${connection.target}`, 
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
    
    const nodeUpdates = new Map();
    result.componentResults.forEach(cr => {
      nodeUpdates.set(cr.componentId, cr.status);
    });

    const updatedNodes = state.nodes.map(n => ({
      ...n,
      data: {
        ...n.data,
        hasError: nodeUpdates.get(n.id) === 'error',
        hasWarning: nodeUpdates.get(n.id) === 'warning'
      }
    }));

    return { 
      activeSimulationResult: result,
      activePanelTab: result.issues.length > 0 ? 'diagnostics' : 'properties',
      nodes: updatedNodes
    };
  }),
  setActivePanelTab: (tab) => set({ activePanelTab: tab }),
  clearWorkspace: () => set({ nodes: [], edges: [], selectedNodeId: null, activeSimulationResult: null })
}));
