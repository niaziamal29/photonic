import { useSimulatorStore } from '@/store/use-simulator-store';
import { useRunSimulation, useUpdateBuild } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Play, Loader2, Target, Zap, Activity } from 'lucide-react';
import { clsx } from 'clsx';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';

export function SimulationPanel() {
  const { 
    activeBuildId, 
    nodes, 
    edges, 
    isSimulating, 
    setSimulating, 
    setSimulationResult,
    activeSimulationResult
  } = useSimulatorStore();
  const { toast } = useToast();

  const runSimulationMutation = useRunSimulation();
  const updateBuildMutation = useUpdateBuild();

  const handleSimulate = async () => {
    if (!activeBuildId) return;

    setSimulating(true);

    try {
      // 1. First save current layout to DB so sim runs on latest
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

      await updateBuildMutation.mutateAsync({
        buildId: activeBuildId,
        data: { layout }
      });

      // 2. Run simulation
      const result = await runSimulationMutation.mutateAsync({ buildId: activeBuildId });
      
      setSimulationResult(result);
      
      if (result.converged) {
        toast({
          title: "Simulation Converged",
          description: "Equilibrium achieved successfully.",
          className: "border-success bg-success/10",
        });
      } else if (result.issues.length > 0) {
        toast({
          title: "Simulation Complete",
          description: `Found ${result.issues.length} issues requiring attention.`,
          variant: "destructive"
        });
      }

    } catch (error: any) {
      toast({
        title: "Simulation Failed",
        description: error.message || "Engine encountered a critical fault.",
        variant: "destructive"
      });
    } finally {
      setSimulating(false);
    }
  };

  const res = activeSimulationResult;
  const score = res?.equilibriumScore || 0;
  
  // Score color logic
  const scoreColor = score > 90 ? 'bg-success' : score > 50 ? 'bg-warning' : 'bg-destructive';
  const scoreTextColor = score > 90 ? 'text-success' : score > 50 ? 'text-warning' : 'text-destructive';

  return (
    <div className="h-48 border-t border-border bg-card/80 backdrop-blur-xl tech-border flex z-20">
      
      {/* Primary Action Zone */}
      <div className="w-72 border-r border-border p-6 flex flex-col justify-center items-center gap-4 bg-background/50 relative overflow-hidden group">
        <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
        
        <Button 
          size="lg" 
          onClick={handleSimulate}
          disabled={isSimulating || nodes.length === 0 || !activeBuildId}
          className={clsx(
            "w-full h-16 text-lg font-bold font-mono tracking-widest relative overflow-hidden",
            isSimulating ? "bg-muted text-muted-foreground border-transparent" : 
            "bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_30px_rgba(0,229,255,0.3)] hover:shadow-[0_0_50px_rgba(0,229,255,0.5)] border border-primary/50"
          )}
        >
          {isSimulating ? (
            <>
              <Loader2 className="w-6 h-6 mr-3 animate-spin" />
              COMPUTING...
            </>
          ) : (
            <>
              <Play className="w-6 h-6 mr-3 fill-current" />
              ENGAGE
            </>
          )}
          
          {/* Scanning line effect */}
          {isSimulating && (
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/30 to-transparent h-full w-full animate-pulse-slow pointer-events-none" />
          )}
        </Button>

        <div className="text-xs text-muted-foreground font-mono flex items-center justify-between w-full px-2">
          <span>NODES: {nodes.length}</span>
          <span>LINKS: {edges.length}</span>
        </div>
      </div>

      {/* Main Stats Zone */}
      <div className="flex-1 p-6 flex items-center gap-12">
        {/* Equilibrium Score Gauge */}
        <div className="flex flex-col items-center gap-3 min-w-[200px]">
          <span className="text-xs font-bold text-muted-foreground font-mono tracking-widest">EQUILIBRIUM</span>
          <div className="relative flex items-center justify-center w-full">
            <span className={clsx("text-5xl font-bold font-mono drop-shadow-md", scoreTextColor)}>
              {res ? score.toFixed(1) : '--'}
            </span>
            <span className="text-xl text-muted-foreground ml-1 mb-3">%</span>
          </div>
          <Progress 
            value={score} 
            className="w-full h-2 bg-background border border-white/10"
            indicatorClassName={scoreColor} 
          />
        </div>

        {/* Detailed Metrics Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 flex-1">
          <MetricBox 
            label="SYSTEM LOSS" 
            value={res ? res.systemLoss.toFixed(2) : '--'} 
            unit="dB" 
            icon={Activity} 
            isWarning={res && res.systemLoss > 10}
          />
          <MetricBox 
            label="OUTPUT PWR" 
            value={res ? res.totalOutputPower.toFixed(2) : '--'} 
            unit="dBm" 
            icon={Zap} 
          />
          <MetricBox 
            label="COHERENCE" 
            value={res ? res.coherenceLength.toFixed(1) : '--'} 
            unit="mm" 
            icon={Target} 
          />
          <MetricBox 
            label="SIGNAL/NOISE" 
            value={res ? res.snr.toFixed(1) : '--'} 
            unit="dB" 
            icon={Activity} 
            isWarning={res && res.snr < 20}
          />
        </div>
      </div>
    </div>
  );
}

function MetricBox({ label, value, unit, icon: Icon, isWarning = false }: any) {
  return (
    <div className={clsx(
      "flex flex-col gap-1 p-3 rounded-lg border bg-background/40",
      isWarning ? "border-warning/50 shadow-[0_0_15px_rgba(245,158,11,0.15)]" : "border-white/5"
    )}>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="w-4 h-4" />
        <span className="text-[10px] font-bold uppercase tracking-wider font-mono">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={clsx("text-2xl font-semibold font-mono", isWarning ? "text-warning" : "text-foreground")}>
          {value}
        </span>
        <span className="text-xs text-muted-foreground font-mono">{unit}</span>
      </div>
    </div>
  );
}
