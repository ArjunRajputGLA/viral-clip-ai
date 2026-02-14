import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Navbar } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Calendar, Sparkles, Clock, Captions } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';

const Preview = () => {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Tables<'projects'> | null>(null);
  const [generatedVideo, setGeneratedVideo] = useState<Tables<'generated_videos'> | null>(null);
  const [rawVideo, setRawVideo] = useState<Tables<'raw_videos'> | null>(null);

  useEffect(() => {
    if (!id) return;
    const fetch = async () => {
      const { data: p } = await supabase.from('projects').select('*').eq('id', id).single();
      setProject(p);
      const { data: gv } = await supabase.from('generated_videos').select('*').eq('project_id', id).order('created_at', { ascending: false }).limit(1).single();
      setGeneratedVideo(gv);
      const { data: rv } = await supabase.from('raw_videos').select('*').eq('project_id', id).limit(1).single();
      setRawVideo(rv);
    };
    fetch();
  }, [id]);

  const handleDownload = () => {
    if (generatedVideo?.video_url) {
      window.open(generatedVideo.video_url, '_blank');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container max-w-4xl pt-24 pb-16">
        <div className="mb-8">
          <Badge variant="default" className="mb-3">Ready</Badge>
          <h1 className="text-3xl font-bold">{project?.title || 'Your Viral Clip'}</h1>
        </div>

        <div className="grid gap-8 lg:grid-cols-5">
          {/* Video Player */}
          <div className="lg:col-span-3">
            <div className="glass overflow-hidden rounded-2xl">
              {generatedVideo?.video_url ? (
                <video
                  src={generatedVideo.video_url}
                  controls
                  className="aspect-[9/16] w-full max-h-[500px] object-contain bg-black"
                />
              ) : (
                <div className="flex aspect-[9/16] max-h-[500px] items-center justify-center bg-muted">
                  <p className="text-muted-foreground">Video preview</p>
                </div>
              )}
            </div>
          </div>

          {/* Info Panel */}
          <div className="space-y-6 lg:col-span-2">
            {/* Hook Text */}
            {generatedVideo?.hook_text && (
              <div className="glass rounded-xl p-5">
                <div className="mb-3 flex items-center gap-2 text-primary">
                  <Sparkles className="h-4 w-4" />
                  <span className="text-sm font-semibold uppercase tracking-wider">Viral Hook</span>
                </div>
                <p className="text-lg font-semibold leading-snug">{generatedVideo.hook_text}</p>
              </div>
            )}

            {/* Clip Info */}
            {generatedVideo && (
              <div className="glass rounded-xl p-5">
                <div className="mb-3 flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span className="text-sm font-semibold uppercase tracking-wider">Clip Details</span>
                </div>
                <div className="space-y-2 text-sm">
                  <p>Start: <span className="font-mono text-primary">{generatedVideo.start_time?.toFixed(1)}s</span></p>
                  <p>End: <span className="font-mono text-primary">{generatedVideo.end_time?.toFixed(1)}s</span></p>
                  <p>Duration: <span className="font-mono text-primary">{((generatedVideo.end_time || 0) - (generatedVideo.start_time || 0)).toFixed(1)}s</span></p>
                </div>
              </div>
            )}

            {/* Captions */}
            {generatedVideo?.captions && (
              <div className="glass rounded-xl p-5">
                <div className="mb-3 flex items-center gap-2 text-muted-foreground">
                  <Captions className="h-4 w-4" />
                  <span className="text-sm font-semibold uppercase tracking-wider">Captions</span>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">{generatedVideo.captions}</p>
              </div>
            )}

            {/* Actions */}
            <div className="space-y-3">
              <Button className="w-full" size="lg" onClick={handleDownload}>
                <Download className="mr-2 h-4 w-4" /> Download Clip
              </Button>
              <Button variant="outline" className="w-full" size="lg" asChild>
                <Link to={`/schedule/${id}`}>
                  <Calendar className="mr-2 h-4 w-4" /> Schedule Post
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Preview;
