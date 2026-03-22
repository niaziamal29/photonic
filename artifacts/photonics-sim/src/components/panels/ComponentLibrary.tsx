import { useListComponentTemplates } from '@workspace/api-client-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Activity, Box } from 'lucide-react';
import { useState } from 'react';

export function ComponentLibrary() {
  const { data: templates, isLoading } = useListComponentTemplates();
  const [search, setSearch] = useState('');

  const onDragStart = (event: React.DragEvent, nodeType: string, label: string) => {
    event.dataTransfer.setData('application/reactflow', `${nodeType}|${label}`);
    event.dataTransfer.effectAllowed = 'move';
  };

  const filteredTemplates = templates?.filter(t => 
    t.label.toLowerCase().includes(search.toLowerCase()) || 
    t.type.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="w-72 flex flex-col h-full bg-card/50 backdrop-blur-xl border-r border-border tech-border z-20">
      <div className="p-4 border-b border-border">
        <h2 className="text-sm font-mono text-primary font-bold tracking-widest flex items-center gap-2 mb-4">
          <Box className="w-4 h-4" /> COMPONENT LIBRARY
        </h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search optics..." 
            className="pl-9 bg-background/50 border-white/10 font-mono text-sm focus-visible:ring-primary/50"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <ScrollArea className="flex-1 p-3">
        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="h-16 bg-muted/20 animate-pulse rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTemplates?.map((template) => (
              <div
                key={template.type}
                draggable
                onDragStart={(e) => onDragStart(e, template.type, template.label)}
                className="group p-3 rounded-lg border border-white/5 bg-background/40 hover:bg-primary/10 hover:border-primary/50 cursor-grab active:cursor-grabbing transition-all hover:shadow-[0_0_15px_rgba(0,229,255,0.15)] flex flex-col gap-1"
              >
                <div className="flex items-center gap-2 font-medium text-sm text-foreground group-hover:text-primary transition-colors">
                  <Activity className="w-4 h-4" />
                  {template.label}
                </div>
                <div className="text-xs text-muted-foreground font-mono truncate">
                  {template.description}
                </div>
              </div>
            ))}
            
            {filteredTemplates?.length === 0 && (
              <div className="text-center p-6 text-sm text-muted-foreground font-mono">
                No components found matching "{search}"
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
