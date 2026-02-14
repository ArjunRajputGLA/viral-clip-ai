import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Navbar } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Upload as UploadIcon, Film, Loader2 } from 'lucide-react';

const Upload = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (f: File) => {
    if (!f.type.startsWith('video/')) {
      toast({ title: 'Invalid file', description: 'Please upload a video file.', variant: 'destructive' });
      return;
    }
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !user) return;
    setUploading(true);

    try {
      // 1. Create project
      const { data: project, error: projErr } = await supabase
        .from('projects')
        .insert({ title, user_id: user.id, status: 'processing' })
        .select()
        .single();
      if (projErr) throw projErr;

      // 2. Upload to storage
      const filePath = `${user.id}/${project.id}/${file.name}`;
      const { error: uploadErr } = await supabase.storage
        .from('raw-videos')
        .upload(filePath, file);
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from('raw-videos').getPublicUrl(filePath);

      // 3. Create raw_videos record
      const { error: rawErr } = await supabase
        .from('raw_videos')
        .insert({ project_id: project.id, file_url: urlData.publicUrl });
      if (rawErr) throw rawErr;

      // 4. Trigger AI processing
      supabase.functions.invoke('generate-clip', { body: { project_id: project.id } });

      navigate(`/processing/${project.id}`);
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container max-w-xl pt-24 pb-16">
        <h1 className="mb-2 text-3xl font-bold">Upload Video</h1>
        <p className="mb-8 text-muted-foreground">Upload your raw footage and let AI do the magic.</p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label htmlFor="title">Video Title</Label>
            <Input id="title" value={title} onChange={e => setTitle(e.target.value)} placeholder="My awesome video" required className="mt-1" />
          </div>

          <div
            className={`glass rounded-2xl border-2 border-dashed p-12 text-center transition-colors cursor-pointer ${
              dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
            }`}
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
          >
            <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
            {file ? (
              <div className="flex flex-col items-center gap-2">
                <Film className="h-10 w-10 text-primary" />
                <p className="font-medium">{file.name}</p>
                <p className="text-sm text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <UploadIcon className="h-10 w-10 text-muted-foreground" />
                <p className="font-medium">Drop your video here</p>
                <p className="text-sm text-muted-foreground">or click to browse • MP4, MOV, WebM</p>
              </div>
            )}
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={!file || uploading}>
            {uploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading...</> : 'Generate Viral Clip'}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default Upload;
