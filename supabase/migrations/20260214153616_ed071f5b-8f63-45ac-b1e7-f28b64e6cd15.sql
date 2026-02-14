
-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, username)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'username');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS for profiles
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- RLS for generated_videos (via project ownership)
CREATE POLICY "Users can view own generated videos" ON public.generated_videos FOR SELECT
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));
CREATE POLICY "Users can insert generated videos" ON public.generated_videos FOR INSERT
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- RLS for platform_exports (via generated_video -> project ownership)
CREATE POLICY "Users can view own exports" ON public.platform_exports FOR SELECT
  USING (generated_video_id IN (SELECT gv.id FROM generated_videos gv JOIN projects p ON gv.project_id = p.id WHERE p.user_id = auth.uid()));
CREATE POLICY "Users can insert exports" ON public.platform_exports FOR INSERT
  WITH CHECK (generated_video_id IN (SELECT gv.id FROM generated_videos gv JOIN projects p ON gv.project_id = p.id WHERE p.user_id = auth.uid()));

-- RLS for processing_logs (via project ownership)
CREATE POLICY "Users can view own logs" ON public.processing_logs FOR SELECT
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));
