
-- Allow users to delete their own raw videos
CREATE POLICY "Users can delete their raw videos"
ON public.raw_videos
FOR DELETE
USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- Allow users to delete their own generated videos
CREATE POLICY "Users can delete their generated videos"
ON public.generated_videos
FOR DELETE
USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- Allow users to delete their own processing logs
CREATE POLICY "Users can delete their processing logs"
ON public.processing_logs
FOR DELETE
USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- Allow users to delete their own platform exports
CREATE POLICY "Users can delete their exports"
ON public.platform_exports
FOR DELETE
USING (generated_video_id IN (
  SELECT gv.id FROM generated_videos gv
  JOIN projects p ON gv.project_id = p.id
  WHERE p.user_id = auth.uid()
));
