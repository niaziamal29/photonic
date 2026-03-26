import {
  type ComponentTemplate as ApiComponentTemplate,
  useListComponentTemplates,
} from '@workspace/api-client-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Activity, ChevronDown, GripVertical, BookOpen } from 'lucide-react';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ICON_MAP } from '@/constants/icons';

const CATEGORY_ORDER = ['Sources', 'Passive', 'Active', 'Structures', 'Detectors'];

type TemplateKnowledge = {
  overview?: string;
  keyPrinciples?: string[];
  typicalApplications?: string[];
  commonIssues?: string[];
  tips?: string;
};

type ParameterDescription = {
  label: string;
  unit?: string;
  description: string;
  typicalRange?: string;
};

type ComponentTemplate = ApiComponentTemplate & {
  category?: string;
  knowledge?: TemplateKnowledge;
  parameterDescriptions?: Record<string, ParameterDescription>;
};

export function ComponentLibrary() {
  const { data: templates, isLoading } = useListComponentTemplates();
  const [search, setSearch] = useState('');
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const onDragStart = (event: React.DragEvent, nodeType: string, label: string) => {
    event.dataTransfer.setData('application/reactflow', `${nodeType}|${label}`);
    event.dataTransfer.effectAllowed = 'move';
  };

  const filteredTemplates = templates?.filter((t: ComponentTemplate) =>
    t.label.toLowerCase().includes(search.toLowerCase()) ||
    t.type.toLowerCase().includes(search.toLowerCase()) ||
    (t.category || '').toLowerCase().includes(search.toLowerCase())
  );

  const grouped = CATEGORY_ORDER.map(cat => ({
    category: cat,
    items: (filteredTemplates || []).filter((t: ComponentTemplate) => t.category === cat),
  })).filter(g => g.items.length > 0);

  const ungrouped = (filteredTemplates || []).filter((t: any) => !CATEGORY_ORDER.includes(t.category));
  if (ungrouped.length > 0) {
    grouped.push({ category: 'Other', items: ungrouped });
  }

  return (
    <div className="w-72 flex flex-col h-full bg-card/50 backdrop-blur-xl border-r border-border z-20">
      <div className="p-4 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground mb-1">Components</h2>
        <p className="text-xs text-muted-foreground mb-3">Drag onto canvas to add</p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search components..."
            className="pl-9 bg-background/50 border-border text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-3 space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-16 bg-muted/20 animate-pulse rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="p-2">
            {grouped.map(({ category, items }) => (
              <div key={category} className="mb-1">
                <button
                  className="w-full px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between hover:text-foreground transition-colors"
                  onClick={() => setExpandedCategory(expandedCategory === category ? null : category)}
                >
                  {category}
                  <ChevronDown className={`w-3 h-3 transition-transform ${expandedCategory === category ? 'rotate-180' : ''}`} />
                </button>

                {expandedCategory !== category && (
                  <div className="space-y-1">
                    {items.map((template: ComponentTemplate) => {
                      const Icon = ICON_MAP[template.type] || Activity;
                      return (
                        <ComponentItem
                          key={template.type}
                          template={template}
                          Icon={Icon}
                          onDragStart={onDragStart}
                        />
                      );
                    })}
                  </div>
                )}

                {expandedCategory === category && (
                  <div className="space-y-1">
                    {items.map((template: ComponentTemplate) => {
                      const Icon = ICON_MAP[template.type] || Activity;
                      return (
                        <ComponentItem
                          key={template.type}
                          template={template}
                          Icon={Icon}
                          onDragStart={onDragStart}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            ))}

            {filteredTemplates?.length === 0 && (
              <div className="text-center p-6 text-sm text-muted-foreground">
                No components matching "{search}"
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function ComponentItem({ template, Icon, onDragStart }: { template: ComponentTemplate; Icon: React.ElementType; onDragStart: (e: React.DragEvent, type: string, label: string) => void }) {
  const knowledge = template.knowledge;
  const keyPrinciples = knowledge?.keyPrinciples ?? [];
  const typicalApplications = knowledge?.typicalApplications ?? [];
  const commonIssues = knowledge?.commonIssues ?? [];

  return (
    <div className="flex items-center gap-1">
      <div
        draggable
        onDragStart={(e) => onDragStart(e, template.type, template.label)}
        className="group flex-1 p-2.5 rounded-lg border border-transparent bg-background/30 hover:bg-primary/10 hover:border-primary/30 cursor-grab active:cursor-grabbing transition-all flex items-center gap-3"
      >
        <div className="p-1.5 rounded-md bg-muted/30 group-hover:bg-primary/20 transition-colors">
          <Icon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">
            {template.label}
          </div>
          <div className="text-[11px] text-muted-foreground line-clamp-1">
            {template.description}
          </div>
        </div>
        <GripVertical className="w-3 h-3 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors shrink-0" />
      </div>

      <Dialog>
        <DialogTrigger asChild>
          <button className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-primary transition-colors shrink-0" title="Learn more">
            <BookOpen className="w-3.5 h-3.5" />
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Icon className="w-6 h-6 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-lg">{template.label}</DialogTitle>
                {template.category && (
                  <Badge variant="outline" className="mt-1 text-xs">{template.category}</Badge>
                )}
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-5 mt-2">
            <p className="text-sm text-foreground leading-relaxed">{template.description}</p>

            {knowledge && (
              <>
                <div>
                  <h4 className="text-sm font-semibold mb-2">How It Works</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">{knowledge.overview}</p>
                </div>

                {keyPrinciples.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Key Principles</h4>
                    <ul className="space-y-1.5">
                      {keyPrinciples.map((p: string, i: number) => (
                        <li key={i} className="text-sm text-muted-foreground flex gap-2">
                          <span className="text-primary mt-0.5 shrink-0">•</span>
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {typicalApplications.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Common Applications</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {typicalApplications.map((app: string, i: number) => (
                        <Badge key={i} variant="secondary" className="text-xs font-normal">{app}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                <Separator />

                {commonIssues.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2 text-amber-500">Watch Out For</h4>
                    <ul className="space-y-1">
                      {commonIssues.map((issue: string, i: number) => (
                        <li key={i} className="text-sm text-muted-foreground flex gap-2">
                          <span className="text-amber-500 mt-0.5 shrink-0">!</span>
                          <span>{issue}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {knowledge.tips && (
                  <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                    <h4 className="text-sm font-semibold mb-1 text-primary">Pro Tip</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">{knowledge.tips}</p>
                  </div>
                )}
              </>
            )}

            {template.parameterDescriptions && (
              <div>
                <h4 className="text-sm font-semibold mb-3">Parameters</h4>
                <div className="space-y-3">
                  {Object.entries(template.parameterDescriptions).map(([key, desc]) => (
                    <div key={key} className="bg-muted/20 rounded-lg p-3 border border-border/50">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{desc.label}</span>
                        {desc.unit && <span className="text-xs text-muted-foreground bg-background px-2 py-0.5 rounded">{desc.unit}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mb-1.5">{desc.description}</p>
                      <div className="flex gap-4 text-xs">
                        {desc.typicalRange && (
                          <span className="text-muted-foreground">Typical: <span className="text-foreground">{desc.typicalRange}</span></span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
