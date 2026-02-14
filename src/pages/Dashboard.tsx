import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Navbar } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Video, Clock, CheckCircle2, Loader2 } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: 'Pending', variant: 'outline' },
  processing: { label: 'Processing', variant: 'secondary' },
  transcribing: { label: 'Transcribing', variant: 'secondary' },
  detecting: { label: 'Detecting', variant: 'secondary' },
  clipping: { label: 'Clipping', variant: 'secondary' },
  rendering: { label: 'Rendering', variant: 'secondary' },
  ready: { label: 'Ready', variant: 'default' },
  scheduled: { label: 'Scheduled', variant: 'outline' },
  posted: { label: 'Posted', variant: 'default' },
};

const Dashboard = () => {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Tables<'projects'>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchProjects = async () => {
      const { data } = await supabase
        .from('projects')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      setProjects(data || []);
      setLoading(false);
    };
    fetchProjects();

    const channel = supabase
      .channel('projects-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects', filter: `user_id=eq.${user.id}` }, () => {
        fetchProjects();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const isProcessing = (status: string | null) => ['processing', 'transcribing', 'detecting', 'clipping', 'rendering'].includes(status || '');

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container pt-24 pb-16">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Your Videos</h1>
            <p className="mt-1 text-muted-foreground">Manage and create viral clips</p>
          </div>
          <Button asChild>
            <Link to="/upload"><Plus className="mr-2 h-4 w-4" /> New Video</Link>
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : projects.length === 0 ? (
          <div className="glass rounded-2xl py-20 text-center">
            <Video className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold">No videos yet</h3>
            <p className="mb-6 text-muted-foreground">Upload your first video to generate viral clips</p>
            <Button asChild>
              <Link to="/upload"><Plus className="mr-2 h-4 w-4" /> Upload Video</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map(p => {
              const sc = statusConfig[p.status || 'pending'] || statusConfig.pending;
              return (
                <Link
                  key={p.id}
                  to={isProcessing(p.status) ? `/processing/${p.id}` : p.status === 'ready' ? `/preview/${p.id}` : `/processing/${p.id}`}
                  className="glass group rounded-xl p-5 transition-all hover:border-primary/40 hover:glow-cyan"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-semibold truncate">{p.title || 'Untitled'}</h3>
                    <Badge variant={sc.variant}>{sc.label}</Badge>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(p.created_at || '').toLocaleDateString()}
                    </span>
                    {p.status === 'ready' && (
                      <span className="flex items-center gap-1 text-primary">
                        <CheckCircle2 className="h-3 w-3" /> Ready
                      </span>
                    )}
                    {isProcessing(p.status) && (
                      <span className="flex items-center gap-1 text-primary">
                        <Loader2 className="h-3 w-3 animate-spin" /> Processing
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
