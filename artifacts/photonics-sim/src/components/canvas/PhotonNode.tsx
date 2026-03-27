import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { PhotonNode } from '@/store/use-simulator-store';
import { Activity } from 'lucide-react';
import { clsx } from 'clsx';
import { ICON_MAP } from '@/constants/icons';

export function PhotonNode({ data, selected }: NodeProps<PhotonNode>) {
  const Icon = ICON_MAP[data.type] || Activity;

  // Determine border color based on status
  let borderClass = "border-border";
  let glowClass = "";
  
  if (selected) {
    borderClass = "border-primary";
    glowClass = "shadow-[0_0_15px_rgba(0,229,255,0.4)]";
  }
  if (data.hasError) {
    borderClass = "border-destructive";
    glowClass = "shadow-[0_0_15px_rgba(255,0,127,0.4)]";
  } else if (data.hasWarning) {
    borderClass = "border-warning";
    glowClass = "shadow-[0_0_15px_rgba(245,158,11,0.4)]";
  }

  return (
    <div className={clsx(
      "bg-card text-card-foreground rounded-lg border-2 p-3 min-w-[140px] transition-all duration-200",
      borderClass,
      glowClass,
      "hover:border-primary/50"
    )}>
      {/* Input Handle (Left) - Exclude for sources */}
      {data.type !== 'laser_source' && (
        <Handle 
          type="target" 
          position={Position.Left} 
          className="w-3 h-3 bg-muted-foreground border-2 border-background left-[-7px]" 
        />
      )}

      <div className="flex items-center gap-3">
        <div className={clsx(
          "p-2 rounded-md",
          data.hasError ? "bg-destructive/20 text-destructive" :
          data.hasWarning ? "bg-warning/20 text-warning" :
          "bg-primary/20 text-primary"
        )}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
            {data.type.replace('_', ' ')}
          </div>
          <div className="font-semibold text-sm truncate max-w-[100px]">
            {data.label}
          </div>
        </div>
      </div>

      {/* Output Handle (Right) - Exclude for detectors */}
      {data.type !== 'photodetector' && (
        <Handle 
          type="source" 
          position={Position.Right} 
          className="w-3 h-3 bg-primary border-2 border-background right-[-7px]" 
        />
      )}
    </div>
  );
}
