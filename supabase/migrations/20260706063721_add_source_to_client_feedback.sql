ALTER TABLE public.client_feedback
  ADD COLUMN IF NOT EXISTS source text;

CREATE INDEX IF NOT EXISTS client_feedback_source_idx ON public.client_feedback (source);
