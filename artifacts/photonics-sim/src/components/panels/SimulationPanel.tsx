import { useSimulatorStore } from '@/store/use-simulator-store';
import { useRunSimulation, useUpdateBuild } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Play, Loader2, Target, Zap, Activity, Waves } from 'lucide-react';
import { clsx } from 'clsx';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

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
  const mlMode = useSimulatorStore(s => s.mlMode);
  const setMlMode = useSimulatorStore(s => s.setMlMode);
  const mlModelLoaded = useSimulatorStore(s => s.mlModelLoaded);
  const mlLatencyMs = useSimulatorStore(s => s.mlLatencyMs);
  const mlPredictions = useSimulatorStore(s => s.mlPredictions);
  const { toast } = useToast();

  const runSimulationMutation = useRunSimulation();
  const updateBuildMutation = useUpdateBuild();

  const handleSimulate = async () => {
    if (!activeBuildId) return;

    setSimulating(true);

    try {
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

      const result = await runSimulationMutation.mutateAsync({ buildId: activeBuildId });

      setSimulationResult(result);

      if (result.converged) {
        toast({
          title: "Simulation converged",
          description: "Your circuit has reached equilibrium.",
          className: "border-green-500 bg-green-500/10",
        });
      } else if (result.issues.length > 0) {
        toast({
          title: "Simulation complete",
          description: `Found ${result.issues.length} issue${result.issues.length > 1 ? 's' : ''} — check the Diagnostics tab for details.`,
          variant: "destructive"
        });
      }

    } catch (error: any) {
      toast({
        title: "Simulation failed",
        description: error.message || "Something went wrong running the simulation.",
        variant: "destructive"
      });
    } finally {
      setSimulating(false);
    }
  };

  const showingMlPreview = mlMode === 'instant' && mlPredictions !== null;
  const res = activeSimulationResult;
  const previewMetrics = mlPredictions?.globalOutputs;
  const score = showingMlPreview
    ? (previewMetrics?.equilibriumScore ?? 0)
    : (res?.equilibriumScore || 0);

  const getScoreLabel = (s: number) => {
    if (s >= 90) return { text: 'Excellent', color: 'text-green-400' };
    if (s >= 70) return { text: 'Good', color: 'text-green-400' };
    if (s >= 50) return { text: 'Fair', color: 'text-amber-400' };
    if (s >= 25) return { text: 'Poor', color: 'text-orange-400' };
    return { text: 'Critical', color: 'text-red-400' };
  };

  const scoreLabel = (showingMlPreview || res) ? getScoreLabel(score) : null;
  const scoreColor = score > 90 ? 'bg-green-500' : score > 50 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="h-44 border-t border-border bg-card/80 backdrop-blur-xl flex z-20">
      <div className="w-64 border-r border-border flex flex-col justify-center items-center bg-background/50">
        {/* ML Mode Toggle */}
        <div className="flex items-center gap-2 p-3 border-b border-border w-full">
              <span className="text-xs font-medium text-muted-foreground">Mode:</span>
          <button
            className={clsx(
              "text-xs px-2 py-1 rounded transition-colors",
              mlMode === 'instant' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            )}
            onClick={() => setMlMode('instant')}
            disabled={!mlModelLoaded}
            title={!mlModelLoaded ? 'ML model not loaded' : 'Switch to ML instant predictions'}
          >
            ⚡ ML Instant
          </button>
          <button
            className={clsx(
              "text-xs px-2 py-1 rounded transition-colors",
              mlMode === 'physics' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            )}
            onClick={() => setMlMode('physics')}
          >
            🔬 Physics
          </button>
          {mlMode === 'instant' && mlLatencyMs != null && (
            <span className="text-xs text-muted-foreground">{mlLatencyMs.toFixed(1)}ms</span>
          )}
        </div>
        <div className="flex-1 flex flex-col justify-center items-center gap-3 p-4 w-full">
        <Button
          size="lg"
          onClick={handleSimulate}
          disabled={isSimulating || nodes.length === 0 || !activeBuildId}
          className={clsx(
            "w-full h-14 text-base font-semibold relative overflow-hidden",
            isSimulating ? "bg-muted text-muted-foreground" :
            "bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-primary/30"
          )}
        >
          {isSimulating ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Running...
            </>
          ) : (
            <>
              <Play className="w-5 h-5 mr-2 fill-current" />
              Run Simulation
            </>
          )}
        </Button>

        <div className="text-xs text-muted-foreground flex items-center justify-between w-full px-1">
          <span>{nodes.length} component{nodes.length !== 1 ? 's' : ''}</span>
          <span>{edges.length} connection{edges.length !== 1 ? 's' : ''}</span>
        </div>
        </div>
      </div>

      <div className="flex-1 p-5 flex items-center gap-8">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex flex-col items-center gap-2 min-w-[160px] cursor-help">
              <span className="text-xs font-medium text-muted-foreground">Equilibrium Score</span>
              <div className="flex items-baseline gap-1">
              <span className={clsx("text-4xl font-bold tabular-nums", scoreLabel?.color || 'text-muted-foreground')}>
                  {(showingMlPreview || res) ? score.toFixed(0) : '--'}
                </span>
                <span className="text-lg text-muted-foreground">/100</span>
              </div>
              {scoreLabel && <span className={clsx("text-xs font-medium", scoreLabel.color)}>{scoreLabel.text}</span>}
              {showingMlPreview && (
                <span className="text-[10px] uppercase tracking-wider text-primary/80">ML Preview</span>
              )}
              <Progress
                value={score}
                className="w-full h-1.5 bg-background border border-border"
                indicatorClassName={scoreColor}
              />
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p className="text-xs">Measures how close your circuit is to optimal performance. 100 = perfect equilibrium with no issues. Score drops for high loss, noise, unconnected components, and other problems.</p>
          </TooltipContent>
        </Tooltip>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 flex-1">
          <MetricBox
            label="System Loss"
            value={
              showingMlPreview
                ? previewMetrics!.systemLoss.toFixed(1)
                : res ? res.systemLoss.toFixed(1) : '--'
            }
            unit="dB"
            icon={Activity}
            isWarning={
              showingMlPreview
                ? previewMetrics!.systemLoss > 10
                : Boolean(res && res.systemLoss > 10)
            }
            tooltip="Total optical power lost across all components. Lower is better. Above 10 dB may cause signal issues."
          />
          <MetricBox
            label="Output Power"
            value={
              showingMlPreview
                ? previewMetrics!.totalOutputPower.toFixed(1)
                : res ? res.totalOutputPower.toFixed(1) : '--'
            }
            unit="dBm"
            icon={Zap}
            tooltip="Optical power arriving at the detector(s). 0 dBm = 1 mW. Negative values mean less than 1 mW."
          />
          <MetricBox
            label="Coherence"
            value={
              showingMlPreview
                ? typeof previewMetrics?.coherenceLength === 'number'
                  ? previewMetrics.coherenceLength.toFixed(1)
                  : '--'
                : res ? res.coherenceLength.toFixed(1) : '--'
            }
            unit="mm"
            icon={Waves}
            tooltip="The distance over which the light maintains phase coherence. Longer coherence enables interference-based devices like MZIs and ring resonators."
          />
          <MetricBox
            label="Signal/Noise"
            value={
              showingMlPreview
                ? previewMetrics!.snr.toFixed(1)
                : res ? res.snr.toFixed(1) : '--'
            }
            unit="dB"
            icon={Target}
            isWarning={
              showingMlPreview
                ? previewMetrics!.snr < 20
                : Boolean(res && res.snr < 20)
            }
            tooltip="Signal-to-noise ratio. Higher is better. Below 20 dB, signal quality may be too poor for reliable detection."
          />
        </div>
      </div>
    </div>
  );
}

function MetricBox({ label, value, unit, icon: Icon, isWarning = false, tooltip }: any) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={clsx(
          "flex flex-col gap-1 p-3 rounded-lg border cursor-help transition-colors",
          isWarning ? "border-amber-500/30 bg-amber-500/5" : "border-border bg-background/30 hover:bg-background/50"
        )}>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Icon className="w-3.5 h-3.5" />
            <span className="text-[11px] font-medium">{label}</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className={clsx("text-xl font-semibold tabular-nums", isWarning ? "text-amber-400" : "text-foreground")}>
              {value}
            </span>
            <span className="text-[10px] text-muted-foreground">{unit}</span>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <p className="text-xs">{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}
