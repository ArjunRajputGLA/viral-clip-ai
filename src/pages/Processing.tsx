import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Navbar } from '@/components/Navbar';
import { CheckCircle2, Loader2, Circle, AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { Tables } from '@/integrations/supabase/types';

const STEPS = [
  { key: 'processing', label: 'Uploading & Preparing' },
  { key: 'transcribing', label: 'Transcribing Audio (Deepgram)' },
  { key: 'transcribed', label: 'Transcription Complete' },
  { key: 'detecting', label: 'Detecting Viral Moment' },
  { key: 'segment_selected', label: 'Viral Segment Selected' },
  { key: 'clipping', label: 'Clipping Video' },
  { key: 'rendering', label: 'Rendering Final Video' },
];

const Processing = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [project, setProject] = useState<Tables<'projects'> | null>(null);
  const [logs, setLogs] = useState<Tables<'processing_logs'>[]>([]);
  const [retrying, setRetrying] = useState(false);

  const isError = project?.status === 'error';

  useEffect(() => {
    if (!id) return;

    const fetchData = async () => {
      const { data: p } = await supabase.from('projects').select('*').eq('id', id).maybeSingle();
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
        // If status changed to error, fetch logs immediately
        if (updated.status === 'error') fetchData();
        if (updated.status === 'ready') navigate(`/preview/${id}`, { replace: true });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'processing_logs', filter: `project_id=eq.${id}` }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [id, navigate]);

  const handleRetry = async () => {
    if (!id) return;
    setRetrying(true);
    try {
      // Reset status and clear old logs
      await supabase.from('projects').update({ status: 'processing', updated_at: new Date().toISOString() }).eq('id', id);
      await supabase.from('processing_logs').delete().eq('project_id', id);
      setLogs([]);

      // Re-invoke pipeline
      const { error } = await supabase.functions.invoke('generate-clip', { body: { project_id: id } });
      if (error) throw error;

      toast({ title: 'Retrying', description: 'Pipeline restarted.' });
    } catch (err: any) {
      toast({ title: 'Retry failed', description: err.message, variant: 'destructive' });
    } finally {
      setRetrying(false);
    }
  };

  const currentStepIndex = STEPS.findIndex(s => s.key === project?.status);

  // Find which step failed (last logged step when status is error)
  const lastLogStep = logs.length > 0 ? logs[logs.length - 1].step : null;
  const errorStepIndex = isError ? STEPS.findIndex(s => s.key === lastLogStep) : -1;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container max-w-lg pt-24 pb-16">
        <div className="mb-10 text-center">
          <h1 className="mb-2 text-3xl font-bold">
            {isError ? 'Processing Failed' : 'Processing Your Video'}
          </h1>
          <p className="text-muted-foreground">
            {isError
              ? 'Something went wrong during processing. You can retry below.'
              : 'AI is analyzing and creating your viral clip...'}
          </p>
        </div>

        <div className="glass rounded-2xl p-8">
          <div className="space-y-6">
            {STEPS.map((step, i) => {
              const isDone = (!isError && (i < currentStepIndex || project?.status === 'ready'));
              const isCurrent = !isError && i === currentStepIndex && project?.status !== 'ready';
              const isFailed = isError && i === errorStepIndex;
              const isCompletedBeforeError = isError && i < errorStepIndex;

              return (
                <div key={step.key} className="flex items-start gap-4">
                  <div className="mt-0.5">
                    {isDone || isCompletedBeforeError ? (
                      <CheckCircle2 className="h-6 w-6 text-primary" />
                    ) : isFailed ? (
                      <AlertCircle className="h-6 w-6 text-destructive" />
                    ) : isCurrent ? (
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    ) : (
                      <Circle className="h-6 w-6 text-muted-foreground/40" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className={`font-medium ${
                      isDone || isCompletedBeforeError ? 'text-primary' 
                      : isFailed ? 'text-destructive' 
                      : isCurrent ? 'text-foreground' 
                      : 'text-muted-foreground/50'
                    }`}>
                      {step.label}
                      {isFailed && ' — Failed'}
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

          {isError && (
            <div className="mt-8 border-t border-border pt-6 text-center">
              <p className="mb-4 text-sm text-destructive">
                {logs.length > 0 ? logs[logs.length - 1].message : 'An unknown error occurred.'}
              </p>
              <Button onClick={handleRetry} disabled={retrying} variant="default" size="lg">
                {retrying ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Retrying...</> : <><RotateCcw className="mr-2 h-4 w-4" /> Retry Processing</>}
              </Button>
            </div>
          )}

          {logs.length > 0 && (
            <div className="mt-8 border-t border-border pt-6">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Processing Log</p>
              <div className="max-h-40 space-y-1.5 overflow-y-auto font-mono text-xs text-muted-foreground">
                {logs.map(log => (
                  <p key={log.id}>
                    <span className={log.step === 'error' ? 'text-destructive' : 'text-primary'}>[{log.step}]</span> {log.message}
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
