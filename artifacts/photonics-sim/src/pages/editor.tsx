import { useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { useGetBuild, useUpdateBuild } from '@workspace/api-client-react';
import { useSimulatorStore } from '@/store/use-simulator-store';
import type { PhotonNode } from '@/store/use-simulator-store';
import { CircuitCanvas } from '@/components/canvas/CircuitCanvas';
import { ComponentLibrary } from '@/components/panels/ComponentLibrary';
import { PropertiesPanel } from '@/components/panels/PropertiesPanel';
import { DiagnosticsPanel } from '@/components/panels/DiagnosticsPanel';
import { SimulationPanel } from '@/components/panels/SimulationPanel';
import { InverseDesignPanel } from '@/components/panels/InverseDesignPanel';
import { Activity, Save, ArrowLeft, Loader2, Gauge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useMlPredictions } from '@/hooks/use-ml-predictions';
import { Edge } from '@xyflow/react';

export default function Editor() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const buildId = parseInt(params.id || '0');
  const { toast } = useToast();

  // Wire up ML prediction hook (debounced, runs when mlMode === 'instant')
  useMlPredictions();

  const { data: build, isLoading } = useGetBuild(buildId);
  const updateBuildMutation = useUpdateBuild();
  
  const { 
    setActiveBuild, 
    setNodes, 
    setEdges, 
    clearWorkspace,
    activePanelTab,
    setActivePanelTab,
    nodes,
    edges,
    activeSimulationResult
  } = useSimulatorStore();

  // Load build into workspace
  useEffect(() => {
    if (build) {
      setActiveBuild(build.id);
      
      // Convert DB layout to React Flow format
      const flowNodes: PhotonNode[] = build.layout.components.map(c => ({
        id: c.id,
        type: 'photonNode',
        position: { x: c.x, y: c.y },
        data: {
          label: c.label,
          type: c.type,
          params: c.params
        }
      }));

      const flowEdges: Edge[] = build.layout.connections.map(c => ({
        id: c.id,
        source: c.fromComponentId,
        target: c.toComponentId,
        sourceHandle: c.fromPort,
        targetHandle: c.toPort,
        animated: true,
        style: { strokeWidth: 2, stroke: 'hsl(var(--primary))' }
      }));

      setNodes(flowNodes);
      setEdges(flowEdges);
    }
    
    return () => clearWorkspace();
  }, [build?.id]);

  const handleSave = async () => {
    if (!buildId) return;

    const layout = {
      components: nodes.map(n => ({
        id: n.id,
        type: n.data.type,
        label: n.data.label,
        x: n.position.x,
        y: n.position.y,
        params: n.data.params
      })),
      connections: edges.map(e => ({
        id: e.id,
        fromComponentId: e.source,
        fromPort: e.sourceHandle || 'out',
        toComponentId: e.target,
        toPort: e.targetHandle || 'in'
      }))
    };

    try {
      await updateBuildMutation.mutateAsync({
        buildId,
        data: { layout }
      });
      toast({
        title: "Saved",
        description: "Your circuit has been saved.",
        className: "bg-background border-primary",
      });
    } catch (e) {
      toast({
        title: "Save Failed",
        variant: "destructive"
      });
    }
  };

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-primary">
          <Loader2 className="w-12 h-12 animate-spin" />
          <p className="text-sm text-muted-foreground">Loading circuit...</p>
        </div>
      </div>
    );
  }

  if (!build) return null;

  const issueCount = activeSimulationResult?.issues?.length || 0;

  return (
    <div className="h-screen w-full flex flex-col bg-background overflow-hidden selection:bg-primary/30">
      {/* Top Navbar */}
      <header className="h-14 bg-card/80 backdrop-blur-md border-b border-white/5 flex items-center justify-between px-4 z-30 relative tech-border">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation('/')} className="hover:bg-white/5">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="w-px h-6 bg-border" />
          <div className="flex items-center gap-2 text-primary">
            <Activity className="w-5 h-5" />
            <h1 className="font-bold font-mono tracking-widest truncate max-w-[200px]">{build.name}</h1>
          </div>
          <Badge variant="outline" className="font-mono text-[10px] ml-2 border-primary/30 text-primary/80 bg-primary/5 uppercase">
            {build.status.replace('_', ' ')}
          </Badge>
        </div>

        <div className="flex items-center gap-3">
          <Button 
            onClick={handleSave} 
            disabled={updateBuildMutation.isPending}
            variant="outline"
            className="font-mono text-xs border-white/10 hover:bg-white/5 hover:border-white/20 transition-all"
          >
            {updateBuildMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save
          </Button>
        </div>
      </header>

      {/* Main Layout Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Library */}
        <ComponentLibrary />

        {/* Center - Canvas */}
        <div className="flex-1 flex flex-col relative z-0">
          <CircuitCanvas />
          
          {/* Overlay Grid lines */}
          <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center opacity-5">
             <div className="w-[1px] h-full bg-primary" />
             <div className="h-[1px] w-full bg-primary absolute" />
             <div className="w-32 h-32 border border-primary rounded-full absolute" />
          </div>
        </div>

        {/* Right Panel - Properties & Diagnostics */}
        <div className="w-80 bg-card/50 backdrop-blur-xl border-l border-border flex flex-col tech-border z-20">
          <Tabs value={activePanelTab} onValueChange={(v: any) => setActivePanelTab(v)} className="flex-1 flex flex-col h-full">
            <div className="p-2 border-b border-border bg-background/50">
              <TabsList className="w-full grid grid-cols-3 bg-black/40 p-1 border border-white/5">
                <TabsTrigger value="properties" className="text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                  Properties
                </TabsTrigger>
                <TabsTrigger value="diagnostics" className="text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary relative">
                  Diagnostics
                  {issueCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-destructive rounded-full border-2 border-background animate-pulse" />
                  )}
                </TabsTrigger>
                <TabsTrigger value="inverse-design" className="text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                  Design
                </TabsTrigger>
              </TabsList>
            </div>
            
            <div className="flex-1 overflow-hidden">
              <TabsContent value="properties" className="m-0 h-full data-[state=active]:flex flex-col">
                <PropertiesPanel />
              </TabsContent>
              <TabsContent value="diagnostics" className="m-0 h-full data-[state=active]:flex flex-col">
                <DiagnosticsPanel />
              </TabsContent>
              <TabsContent value="inverse-design" className="m-0 h-full data-[state=active]:flex flex-col overflow-y-auto">
                <InverseDesignPanel />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>

      {/* Bottom Panel - Simulation */}
      <SimulationPanel />
    </div>
  );
}
