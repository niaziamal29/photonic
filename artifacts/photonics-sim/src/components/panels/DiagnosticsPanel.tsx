import { useSimulatorStore } from '@/store/use-simulator-store';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, Info, XCircle, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import { Badge } from '@/components/ui/badge';

export function DiagnosticsPanel() {
  const { activeSimulationResult, setSelectedNode } = useSimulatorStore();

  if (!activeSimulationResult) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
        <Info className="w-12 h-12 mb-4 opacity-20" />
        <p className="font-mono text-sm">No simulation data.</p>
        <p className="text-xs mt-2 opacity-60">Run a simulation to view diagnostics.</p>
      </div>
    );
  }

  const issues = activeSimulationResult.issues || [];

  if (issues.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-success">
        <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mb-4">
          <div className="w-12 h-12 rounded-full bg-success/40 flex items-center justify-center shadow-[0_0_30px_rgba(0,255,0,0.4)]">
            <span className="text-2xl font-bold font-mono">OK</span>
          </div>
        </div>
        <p className="font-mono text-sm text-foreground">System is harmonized.</p>
        <p className="text-xs mt-2 text-success/80">0 issues detected across all components.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="p-4 border-b border-white/5 bg-background/50 flex justify-between items-center">
        <h3 className="font-bold text-sm tracking-widest font-mono flex items-center gap-2">
          SYSTEM ALERTS
        </h3>
        <Badge variant="outline" className="bg-background font-mono border-muted-foreground text-xs">
          {issues.length} FOUND
        </Badge>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-3">
          {issues.map((issue, idx) => {
            const isError = issue.severity === 'error';
            const isWarning = issue.severity === 'warning';
            
            const Icon = isError ? XCircle : isWarning ? AlertTriangle : Info;
            const colorClass = isError ? 'text-destructive' : isWarning ? 'text-warning' : 'text-primary';
            const bgClass = isError ? 'bg-destructive/10 border-destructive/30' : 
                            isWarning ? 'bg-warning/10 border-warning/30' : 
                            'bg-primary/10 border-primary/30';

            return (
              <div 
                key={idx} 
                className={clsx(
                  "p-3 rounded-lg border transition-all cursor-pointer hover:bg-white/5",
                  bgClass
                )}
                onClick={() => issue.componentId && setSelectedNode(issue.componentId)}
              >
                <div className="flex gap-3">
                  <Icon className={clsx("w-5 h-5 shrink-0 mt-0.5", colorClass)} />
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className={clsx("text-xs font-bold uppercase tracking-wider font-mono", colorClass)}>
                        {issue.code}
                      </span>
                      {issue.componentId && (
                        <div className="flex items-center text-[10px] text-muted-foreground hover:text-foreground transition-colors font-mono">
                          ID: {issue.componentId.split('-')[1] || issue.componentId}
                          <ChevronRight className="w-3 h-3 ml-0.5" />
                        </div>
                      )}
                    </div>
                    <p className="text-sm font-medium mb-1.5">{issue.message}</p>
                    <div className="bg-background/50 rounded p-2 border border-white/5">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold mr-2">Suggestion</span>
                      <span className="text-xs font-mono">{issue.suggestion}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
