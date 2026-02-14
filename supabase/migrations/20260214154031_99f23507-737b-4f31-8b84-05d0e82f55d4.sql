
-- Enable RLS on tables that are missing it
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processing_logs ENABLE ROW LEVEL SECURITY;
