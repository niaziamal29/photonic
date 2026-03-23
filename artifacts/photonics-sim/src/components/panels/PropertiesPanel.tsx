import { useSimulatorStore } from '@/store/use-simulator-store';
import { useListComponentTemplates } from '@workspace/api-client-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Settings2, Cpu, HelpCircle, Lightbulb } from 'lucide-react';
import { useEffect } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';

const PARAM_CONFIG: Record<string, { min: number; max: number; step: number; unit: string }> = {
  wavelength: { min: 1300, max: 1600, step: 1, unit: 'nm' },
  power: { min: -20, max: 20, step: 0.1, unit: 'dBm' },
  loss: { min: 0, max: 10, step: 0.1, unit: 'dB' },
  splitRatio: { min: 0, max: 1, step: 0.01, unit: '' },
  couplingCoeff: { min: 0, max: 1, step: 0.01, unit: '' },
  length: { min: 10, max: 10000, step: 10, unit: 'μm' },
  neff: { min: 1, max: 4, step: 0.001, unit: '' },
  alpha: { min: 0, max: 5, step: 0.1, unit: 'dB/cm' },
  gain: { min: 0, max: 30, step: 0.5, unit: 'dB' },
  responsivity: { min: 0.1, max: 1.5, step: 0.01, unit: 'A/W' },
  phaseShift: { min: 0, max: 6.28, step: 0.01, unit: 'rad' },
  bandwidth: { min: 1, max: 100, step: 1, unit: 'GHz' },
  extinctionRatio: { min: 5, max: 40, step: 1, unit: 'dB' },
  reflectivity: { min: 0, max: 1, step: 0.01, unit: '' },
};

export function PropertiesPanel() {
  const { nodes, selectedNodeId, updateNodeData } = useSimulatorStore();
  const { data: templates } = useListComponentTemplates();

  const selectedNode = nodes.find(n => n.id === selectedNodeId);
  const template = templates?.find((t: any) => t.type === selectedNode?.data.type) as any;

  useEffect(() => {
    if (selectedNode && template) {
      const currentParams = selectedNode.data.params || {};
      const newParams = { ...template.defaultParams, ...currentParams };
      if (JSON.stringify(currentParams) !== JSON.stringify(newParams)) {
        updateNodeData(selectedNode.id, { params: newParams });
      }
    }
  }, [selectedNode?.id, template]);

  if (!selectedNode || !template) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
        <Cpu className="w-10 h-10 mb-3 opacity-20" />
        <p className="text-sm font-medium">No component selected</p>
        <p className="text-xs mt-1 opacity-60">Click on a component in the canvas to see its properties.</p>
      </div>
    );
  }

  const params = selectedNode.data.params;
  const paramDescriptions = template.parameterDescriptions || {};

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border bg-background/50">
        <div className="flex items-center gap-2 mb-2">
          <Settings2 className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">{selectedNode.data.label}</h3>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{template.description}</p>

        {template.knowledge?.tips && (
          <div className="mt-3 bg-primary/5 border border-primary/20 rounded-md p-2.5 flex gap-2">
            <Lightbulb className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">{template.knowledge.tips}</p>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-5">
          {Object.entries(params).map(([key, value]) => {
            const config = PARAM_CONFIG[key] || { min: 0, max: 100, step: 1, unit: '' };
            const numValue = value as number;
            const desc = paramDescriptions[key];

            return (
              <div key={key} className="space-y-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs font-medium text-foreground capitalize">
                      {desc?.label || key.replace(/([A-Z])/g, ' $1').trim()}
                    </Label>
                    {desc && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-3 h-3 text-muted-foreground/50 hover:text-primary cursor-help transition-colors" />
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-xs">
                          <p className="text-xs mb-1">{desc.description}</p>
                          {desc.typicalRange && (
                            <p className="text-xs text-muted-foreground">Typical range: {desc.typicalRange}</p>
                          )}
                          {desc.impact && (
                            <p className="text-xs text-muted-foreground mt-1">{desc.impact}</p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  <div className="flex items-center gap-1 bg-background px-2 py-1 rounded border border-border">
                    <Input
                      type="number"
                      value={numValue}
                      onChange={(e) => updateNodeData(selectedNode.id, {
                        params: { ...params, [key]: parseFloat(e.target.value) || 0 }
                      })}
                      className="w-16 h-5 p-0 text-right text-xs bg-transparent border-none focus-visible:ring-0"
                    />
                    {config.unit && <span className="text-[10px] text-muted-foreground">{config.unit}</span>}
                  </div>
                </div>
                <Slider
                  min={config.min}
                  max={config.max}
                  step={config.step}
                  value={[numValue]}
                  onValueChange={([val]) => updateNodeData(selectedNode.id, {
                    params: { ...params, [key]: val }
                  })}
                />
                {desc?.typicalRange && (
                  <p className="text-[10px] text-muted-foreground">Typical: {desc.typicalRange}</p>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
