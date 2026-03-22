import { useListBuilds, useCreateBuild } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Activity, Plus, FileCode2, Clock, Trash2, ArrowRight } from 'lucide-react';
import { useLocation } from 'wouter';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { data: builds, isLoading } = useListBuilds();
  const createBuildMutation = useCreateBuild();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newBuildName, setNewBuildName] = useState('');

  const handleCreate = async () => {
    if (!newBuildName.trim()) return;
    
    try {
      const build = await createBuildMutation.mutateAsync({
        data: {
          name: newBuildName,
          targetWavelength: 1550,
          targetPower: 0,
          layout: { components: [], connections: [] }
        }
      });
      setIsDialogOpen(false);
      setLocation(`/builds/${build.id}`);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex flex-col">
      {/* Background Graphic */}
      <div 
        className="absolute inset-0 z-0 opacity-40 mix-blend-screen pointer-events-none"
        style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/tech-bg.png)`, backgroundSize: 'cover', backgroundPosition: 'center' }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background z-0" />

      {/* Header */}
      <header className="h-16 border-b border-border/50 bg-background/80 backdrop-blur-md z-10 flex items-center px-8 justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-primary/20 flex items-center justify-center border border-primary/50 shadow-[0_0_15px_rgba(0,229,255,0.4)]">
            <Activity className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold font-mono tracking-widest text-foreground leading-none">PHOTONICS</h1>
            <p className="text-[10px] font-mono text-primary tracking-[0.3em] uppercase opacity-80">Engine Simulator</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 z-10 p-8 max-w-7xl mx-auto w-full">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-3xl font-light mb-2">Workspace <span className="font-bold">Initialization</span></h2>
            <p className="text-muted-foreground font-mono text-sm">Select an existing optical circuit build or initialize a new sequence.</p>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="font-mono tracking-wider shadow-[0_0_15px_rgba(0,229,255,0.2)] hover:shadow-[0_0_25px_rgba(0,229,255,0.4)] transition-shadow">
                <Plus className="w-4 h-4 mr-2" /> NEW BUILD
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-panel border-primary/20">
              <DialogHeader>
                <DialogTitle className="font-mono tracking-widest text-primary flex items-center gap-2">
                  <Activity className="w-5 h-5" /> INITIALIZE SEQUENCE
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label className="font-mono text-xs text-muted-foreground uppercase">Designation</Label>
                  <Input 
                    value={newBuildName}
                    onChange={(e) => setNewBuildName(e.target.value)}
                    placeholder="e.g. MZI Modulator Test V1"
                    className="font-mono bg-background/50 border-white/10"
                    autoFocus
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setIsDialogOpen(false)} className="font-mono">CANCEL</Button>
                <Button 
                  onClick={handleCreate} 
                  disabled={!newBuildName.trim() || createBuildMutation.isPending}
                  className="font-mono"
                >
                  {createBuildMutation.isPending ? 'PROCESSING...' : 'INITIALIZE'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1,2,3].map(i => (
              <Card key={i} className="h-48 bg-card/40 border-white/5 animate-pulse" />
            ))}
          </div>
        ) : builds?.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-card/20 rounded-2xl border border-white/5 backdrop-blur-sm">
            <img 
              src={`${import.meta.env.BASE_URL}images/empty-state.png`} 
              alt="Empty lab" 
              className="w-64 h-48 object-cover rounded-xl mb-6 opacity-80 mix-blend-screen"
            />
            <h3 className="text-xl font-mono mb-2">DATABANK EMPTY</h3>
            <p className="text-muted-foreground text-sm max-w-md text-center mb-6">
              No simulation configurations found in local storage. Initialize a new build to access the engineering interface.
            </p>
            <Button onClick={() => setIsDialogOpen(true)} variant="outline" className="font-mono border-primary/50 text-primary hover:bg-primary/10">
              INITIALIZE BUILD
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {builds?.map((build) => (
              <Card 
                key={build.id}
                className="group cursor-pointer bg-card/60 backdrop-blur-sm border-white/5 hover:border-primary/50 hover:bg-card/80 transition-all hover:-translate-y-1 hover:shadow-[0_10px_30px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col"
                onClick={() => setLocation(`/builds/${build.id}`)}
              >
                <div className="h-2 w-full bg-background relative">
                  <div 
                    className="absolute top-0 left-0 h-full bg-primary transition-all duration-1000" 
                    style={{ width: `${build.equilibriumScore}%` }}
                  />
                </div>
                <div className="p-6 flex-1 flex flex-col">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-2 text-primary">
                      <FileCode2 className="w-5 h-5" />
                      <h3 className="font-bold font-mono tracking-wider truncate" title={build.name}>{build.name}</h3>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mb-6 mt-auto">
                    <div>
                      <p className="text-[10px] text-muted-foreground font-mono uppercase">Score</p>
                      <p className="font-mono font-bold text-lg">{build.equilibriumScore.toFixed(0)}%</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground font-mono uppercase">Status</p>
                      <p className="font-mono text-sm capitalize mt-1 text-foreground/80">{build.status.replace('_', ' ')}</p>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-4 border-t border-white/5 text-muted-foreground">
                    <div className="flex items-center gap-1.5 text-xs font-mono">
                      <Clock className="w-3.5 h-3.5" />
                      {format(new Date(build.updatedAt), 'MMM d, yyyy HH:mm')}
                    </div>
                    <ArrowRight className="w-4 h-4 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
