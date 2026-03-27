import { useCallback, useRef, useState, DragEvent } from 'react';
import { 
  ReactFlow, 
  Background, 
  Controls, 
  applyNodeChanges, 
  applyEdgeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type NodeTypes,
  type OnSelectionChangeFunc,
  ReactFlowProvider,
  BackgroundVariant
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useSimulatorStore } from '@/store/use-simulator-store';
import type { PhotonNode } from '@/store/use-simulator-store';
import { PhotonNode as PhotonNodeComponent } from './PhotonNode';
import { ComponentType } from '@workspace/api-client-react';

const nodeTypes = {
  photonNode: PhotonNodeComponent,
} satisfies NodeTypes;

function FlowCanvas() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  
  const { nodes, edges, setNodes, setEdges, setSelectedNode } = useSimulatorStore();

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds) as PhotonNode[]),
    [setNodes]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [setEdges]
  );

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => {
      if (!params.source || !params.target) {
        return eds;
      }

      return eds.concat({
        id: crypto.randomUUID(),
        source: params.source,
        target: params.target,
        sourceHandle: params.sourceHandle ?? null,
        targetHandle: params.targetHandle ?? null,
        animated: true,
        style: { strokeWidth: 2, stroke: 'hsl(var(--primary))' },
      });
    }),
    [setEdges]
  );

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();

      if (!reactFlowInstance) return;

      const typeStr = event.dataTransfer.getData('application/reactflow');
      if (!typeStr) return;

      const [type, label] = typeStr.split('|');
      
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: PhotonNode = {
        id: crypto.randomUUID(),
        type: 'photonNode',
        position,
        data: { 
          label: `${label} ${nodes.length + 1}`, 
          type: type as ComponentType,
          params: {} // Defaults will be loaded when selected
        },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, nodes.length, setNodes]
  );

  const onSelectionChange = useCallback<OnSelectionChangeFunc>(({ nodes }) => {
    setSelectedNode(nodes.length === 1 ? nodes[0]?.id ?? null : null);
  }, [setSelectedNode]);

  return (
    <div className="flex-1 h-full w-full relative bg-[#060913]" ref={reactFlowWrapper}>
      <ReactFlow<PhotonNode, Edge>
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={setReactFlowInstance}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onSelectionChange={onSelectionChange}
        nodeTypes={nodeTypes}
        fitView
        className="touch-none"
      >
        <Background 
          variant={BackgroundVariant.Dots} 
          gap={24} 
          size={2} 
          color="hsl(var(--muted-foreground)/0.2)" 
        />
        <Controls 
          className="bg-card border-border shadow-lg"
          showInteractive={false}
        />
      </ReactFlow>
      
      {/* Canvas Overlay Gradients for Depth */}
      <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_100px_rgba(0,0,0,0.8)] z-10" />
    </div>
  );
}

export function CircuitCanvas() {
  return (
    <ReactFlowProvider>
      <FlowCanvas />
    </ReactFlowProvider>
  );
}
