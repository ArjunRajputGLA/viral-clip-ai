import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Navbar } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, Video, Clock, CheckCircle2, Loader2, Trash2 } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

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
  const { toast } = useToast();
  const [projects, setProjects] = useState<Tables<'projects'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchProjects = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setProjects(data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    fetchProjects();

    const channel = supabase
      .channel('projects-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects', filter: `user_id=eq.${user.id}` }, () => {
        fetchProjects();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const handleDelete = async (projectId: string) => {
    setDeleting(projectId);
    try {
      // Delete related records first (order matters for FK constraints)
      // 1. Get generated video IDs for platform_exports FK
      const { data: genVideos } = await supabase
        .from('generated_videos')
        .select('id')
        .eq('project_id', projectId);

      if (genVideos && genVideos.length > 0) {
        const genIds = genVideos.map(g => g.id);
        await supabase.from('platform_exports').delete().in('generated_video_id', genIds);
      }

      // 2. Delete generated videos, processing logs, raw videos
      await supabase.from('generated_videos').delete().eq('project_id', projectId);
      await supabase.from('processing_logs').delete().eq('project_id', projectId);
      await supabase.from('raw_videos').delete().eq('project_id', projectId);

      // 3. Delete storage files
      const { data: files } = await supabase.storage
        .from('raw-videos')
        .list(`${user!.id}/${projectId}`);
      if (files && files.length > 0) {
        await supabase.storage
          .from('raw-videos')
          .remove(files.map(f => `${user!.id}/${projectId}/${f.name}`));
      }

      // 4. Delete the project
      const { error } = await supabase.from('projects').delete().eq('id', projectId);
      if (error) throw error;

      // Update local state immediately for better UX
      setProjects(prev => prev.filter(p => p.id !== projectId));

      toast({ title: 'Deleted', description: 'Project deleted successfully.' });
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err.message, variant: 'destructive' });
    } finally {
      setDeleting(null);
    }
  };

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
                <div key={p.id} className="glass group rounded-xl p-5 transition-all hover:border-primary/40 hover:glow-cyan relative">
                  <div className="absolute top-3 right-3 z-10">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={(e) => e.stopPropagation()}
                          disabled={deleting === p.id}
                        >
                          {deleting === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete "{p.title || 'Untitled'}"?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete the project, all generated clips, and processing data. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => handleDelete(p.id)}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                  <Link
                    to={isProcessing(p.status) ? `/processing/${p.id}` : p.status === 'ready' ? `/preview/${p.id}` : `/processing/${p.id}`}
                    className="block"
                  >
                    <div className="mb-3 flex items-center justify-between pr-8">
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
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
