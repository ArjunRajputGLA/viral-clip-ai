import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Navbar } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Calendar, Youtube, Instagram, CheckCircle2 } from 'lucide-react';

const platforms = [
  { id: 'youtube', label: 'YouTube Shorts', icon: Youtube },
  { id: 'instagram', label: 'Instagram Reels', icon: Instagram },
];

const Schedule = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [platform, setPlatform] = useState('youtube');
  const [publishTime, setPublishTime] = useState('');
  const [scheduling, setScheduling] = useState(false);

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !publishTime) return;
    setScheduling(true);

    try {
      // Get generated video for this project
      const { data: gv } = await supabase
        .from('generated_videos')
        .select('id')
        .eq('project_id', id)
        .limit(1)
        .single();

      if (!gv) throw new Error('No generated video found');

      await supabase.from('platform_exports').insert({
        generated_video_id: gv.id,
        platform,
        status: 'scheduled',
        aspect_ratio: '9:16',
      });

      await supabase.from('projects').update({ status: 'scheduled' }).eq('id', id);

      toast({ title: 'Scheduled!', description: `Your clip is scheduled for ${platform}.` });
      navigate('/dashboard');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setScheduling(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container max-w-lg pt-24 pb-16">
        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-bold">Schedule Post</h1>
          <p className="text-muted-foreground">Choose a platform and time for your viral clip.</p>
        </div>

        <form onSubmit={handleSchedule} className="space-y-6">
          {/* Platform Selection */}
          <div>
            <Label className="mb-3 block">Platform</Label>
            <div className="grid grid-cols-2 gap-3">
              {platforms.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPlatform(p.id)}
                  className={`glass flex items-center gap-3 rounded-xl p-4 transition-all ${
                    platform === p.id ? 'border-primary glow-cyan' : 'hover:border-primary/40'
                  }`}
                >
                  <p.icon className={`h-5 w-5 ${platform === p.id ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className="text-sm font-medium">{p.label}</span>
                  {platform === p.id && <CheckCircle2 className="ml-auto h-4 w-4 text-primary" />}
                </button>
              ))}
            </div>
          </div>

          {/* Publish Time */}
          <div>
            <Label htmlFor="time">Publish Time</Label>
            <Input
              id="time"
              type="datetime-local"
              value={publishTime}
              onChange={e => setPublishTime(e.target.value)}
              required
              className="mt-1"
            />
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={scheduling}>
            <Calendar className="mr-2 h-4 w-4" />
            {scheduling ? 'Scheduling...' : 'Confirm Schedule'}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default Schedule;
