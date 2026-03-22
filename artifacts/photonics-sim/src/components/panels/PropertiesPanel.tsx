import { useSimulatorStore } from '@/store/use-simulator-store';
import { useListComponentTemplates } from '@workspace/api-client-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Settings2, Cpu } from 'lucide-react';
import { useEffect, useState } from 'react';

// Maps parameter names to sensible slider ranges and units
const PARAM_CONFIG: Record<string, { min: number, max: number, step: number, unit: string }> = {
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
  const template = templates?.find(t => t.type === selectedNode?.data.type);

  // Initialize missing params from template defaults
  useEffect(() => {
    if (selectedNode && template) {
      const currentParams = selectedNode.data.params || {};
      const newParams = { ...template.defaultParams, ...currentParams };
      
      // Only update if there's actually a diff to avoid infinite loops
      if (JSON.stringify(currentParams) !== JSON.stringify(newParams)) {
        updateNodeData(selectedNode.id, { params: newParams });
      }
    }
  }, [selectedNode?.id, template]);

  if (!selectedNode || !template) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
        <Cpu className="w-12 h-12 mb-4 opacity-20" />
        <p className="font-mono text-sm">No component selected.</p>
        <p className="text-xs mt-2 opacity-60">Select a node on the canvas to configure properties.</p>
      </div>
    );
  }

  const params = selectedNode.data.params;

  return (
    <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="p-4 border-b border-white/5 bg-background/50">
        <div className="flex items-center gap-2 mb-2 text-primary">
          <Settings2 className="w-5 h-5" />
          <h3 className="font-bold text-sm tracking-widest">{selectedNode.data.label}</h3>
        </div>
        <p className="text-xs text-muted-foreground font-mono">{template.description}</p>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-6">
          {Object.entries(params).map(([key, value]) => {
            const config = PARAM_CONFIG[key] || { min: 0, max: 100, step: 1, unit: '' };
            const numValue = value as number;

            return (
              <div key={key} className="space-y-3">
                <div className="flex justify-between items-center">
                  <Label className="text-xs font-mono font-semibold text-foreground/80 uppercase tracking-wider">
                    {key}
                  </Label>
                  <div className="flex items-center gap-1 bg-background px-2 py-1 rounded border border-border">
                    <Input 
                      type="number"
                      value={numValue}
                      onChange={(e) => updateNodeData(selectedNode.id, { 
                        params: { ...params, [key]: parseFloat(e.target.value) || 0 } 
                      })}
                      className="w-16 h-6 p-0 text-right text-xs font-mono bg-transparent border-none focus-visible:ring-0"
                    />
                    <span className="text-xs text-muted-foreground font-mono">{config.unit}</span>
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
                  className="[&_[role=slider]]:bg-primary [&_[role=slider]]:border-primary [&_[role=slider]]:shadow-[0_0_10px_rgba(0,229,255,0.5)]"
                />
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
