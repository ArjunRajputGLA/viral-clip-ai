import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Navbar } from '@/components/Navbar';
import { CheckCircle2, Loader2, Circle } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';

const STEPS = [
  { key: 'processing', label: 'Uploading & Preparing' },
  { key: 'transcribing', label: 'Transcribing Audio' },
  { key: 'detecting', label: 'Detecting Viral Moment' },
  { key: 'clipping', label: 'Clipping Video' },
  { key: 'rendering', label: 'Rendering Final Video' },
];

const Processing = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Tables<'projects'> | null>(null);
  const [logs, setLogs] = useState<Tables<'processing_logs'>[]>([]);

  useEffect(() => {
    if (!id) return;

    const fetchData = async () => {
      const { data: p } = await supabase.from('projects').select('*').eq('id', id).single();
      if (p) {
        setProject(p);
        if (p.status === 'ready') navigate(`/preview/${id}`, { replace: true });
      }
      const { data: l } = await supabase.from('processing_logs').select('*').eq('project_id', id).order('created_at', { ascending: true });
      setLogs(l || []);
    };

    fetchData();
    const interval = setInterval(fetchData, 3000);

    const channel = supabase
      .channel(`project-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'projects', filter: `id=eq.${id}` }, (payload) => {
        const updated = payload.new as Tables<'projects'>;
        setProject(updated);
        if (updated.status === 'ready') navigate(`/preview/${id}`, { replace: true });
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [id, navigate]);

  const currentStepIndex = STEPS.findIndex(s => s.key === project?.status);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container max-w-lg pt-24 pb-16">
        <div className="mb-10 text-center">
          <h1 className="mb-2 text-3xl font-bold">Processing Your Video</h1>
          <p className="text-muted-foreground">AI is analyzing and creating your viral clip...</p>
        </div>

        <div className="glass rounded-2xl p-8">
          <div className="space-y-6">
            {STEPS.map((step, i) => {
              const isDone = i < currentStepIndex || project?.status === 'ready';
              const isCurrent = i === currentStepIndex && project?.status !== 'ready';
              const isPending = i > currentStepIndex && project?.status !== 'ready';

              return (
                <div key={step.key} className="flex items-start gap-4">
                  <div className="mt-0.5">
                    {isDone ? (
                      <CheckCircle2 className="h-6 w-6 text-primary" />
                    ) : isCurrent ? (
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    ) : (
                      <Circle className="h-6 w-6 text-muted-foreground/40" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className={`font-medium ${isDone ? 'text-primary' : isCurrent ? 'text-foreground' : 'text-muted-foreground/50'}`}>
                      {step.label}
                    </p>
                    {isCurrent && (
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full animate-progress-fill rounded-full bg-primary" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {logs.length > 0 && (
            <div className="mt-8 border-t border-border pt-6">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Processing Log</p>
              <div className="max-h-40 space-y-1.5 overflow-y-auto font-mono text-xs text-muted-foreground">
                {logs.map(log => (
                  <p key={log.id}>
                    <span className="text-primary">[{log.step}]</span> {log.message}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Processing;
