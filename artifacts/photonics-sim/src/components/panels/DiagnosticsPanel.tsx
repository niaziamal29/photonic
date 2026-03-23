import { useSimulatorStore } from '@/store/use-simulator-store';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, Info, XCircle, CheckCircle, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import { Badge } from '@/components/ui/badge';

export function DiagnosticsPanel() {
  const { activeSimulationResult, setSelectedNode } = useSimulatorStore();

  if (!activeSimulationResult) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
        <Info className="w-10 h-10 mb-3 opacity-20" />
        <p className="text-sm font-medium">No results yet</p>
        <p className="text-xs mt-1 opacity-60">Run a simulation to see diagnostics and suggestions.</p>
      </div>
    );
  }

  const issues = activeSimulationResult.issues || [];

  if (issues.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center mb-3">
          <CheckCircle className="w-8 h-8 text-green-500" />
        </div>
        <p className="text-sm font-medium">All checks passed</p>
        <p className="text-xs mt-1 text-muted-foreground">No issues detected. Your circuit is in good shape.</p>
      </div>
    );
  }

  const errors = issues.filter((i: any) => i.severity === 'error');
  const warnings = issues.filter((i: any) => i.severity === 'warning');
  const infos = issues.filter((i: any) => i.severity === 'info');

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border bg-background/50">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-sm">Issues Found</h3>
          <div className="flex gap-1.5">
            {errors.length > 0 && (
              <Badge variant="destructive" className="text-[10px] px-1.5">{errors.length} error{errors.length > 1 ? 's' : ''}</Badge>
            )}
            {warnings.length > 0 && (
              <Badge className="text-[10px] px-1.5 bg-amber-500/20 text-amber-500 border-amber-500/30">{warnings.length} warning{warnings.length > 1 ? 's' : ''}</Badge>
            )}
            {infos.length > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5">{infos.length} info</Badge>
            )}
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1 p-3">
        <div className="space-y-2">
          {issues.map((issue: any, idx: number) => {
            const isError = issue.severity === 'error';
            const isWarning = issue.severity === 'warning';

            const Icon = isError ? XCircle : isWarning ? AlertTriangle : Info;
            const colorClass = isError ? 'text-red-400' : isWarning ? 'text-amber-400' : 'text-blue-400';
            const bgClass = isError ? 'border-red-500/20 hover:bg-red-500/5' :
                            isWarning ? 'border-amber-500/20 hover:bg-amber-500/5' :
                            'border-blue-500/20 hover:bg-blue-500/5';

            return (
              <div
                key={idx}
                className={clsx(
                  "p-3 rounded-lg border transition-all cursor-pointer",
                  bgClass
                )}
                onClick={() => issue.componentId && setSelectedNode(issue.componentId)}
              >
                <div className="flex gap-2.5">
                  <Icon className={clsx("w-4 h-4 shrink-0 mt-0.5", colorClass)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm mb-1">{issue.message}</p>
                    {issue.suggestion && (
                      <div className="text-xs text-muted-foreground bg-background/50 rounded p-2 border border-border/50">
                        <span className="font-medium text-foreground/70">Fix: </span>
                        {issue.suggestion}
                      </div>
                    )}
                    {issue.componentId && (
                      <div className="flex items-center text-[10px] text-muted-foreground mt-1.5 hover:text-foreground transition-colors">
                        Click to select component <ChevronRight className="w-3 h-3 ml-0.5" />
                      </div>
                    )}
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
