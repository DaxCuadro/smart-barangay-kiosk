-- ============================================================
-- Migration 034: Survey responses table (anonymous)
-- Stores pre-usage and post-usage survey responses
-- No personal information is collected — purely anonymous
-- ============================================================

CREATE TABLE IF NOT EXISTS public.survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barangay_id UUID REFERENCES public.barangays(id) ON DELETE CASCADE,
  survey_type TEXT NOT NULL CHECK (survey_type IN ('pre', 'post')),
  source TEXT NOT NULL CHECK (source IN ('kiosk', 'remote', 'admin')),
  responses JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_survey_responses_barangay ON public.survey_responses(barangay_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_type ON public.survey_responses(survey_type);
CREATE INDEX IF NOT EXISTS idx_survey_responses_source ON public.survey_responses(source);
CREATE INDEX IF NOT EXISTS idx_survey_responses_created ON public.survey_responses(created_at DESC);

-- RLS
ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (anonymous survey — kiosk is unauthenticated)
DROP POLICY IF EXISTS survey_responses_insert ON public.survey_responses;
CREATE POLICY survey_responses_insert ON public.survey_responses
  FOR INSERT WITH CHECK (true);

-- Superadmins can read all; barangay admins can read their own barangay
DROP POLICY IF EXISTS survey_responses_select ON public.survey_responses;
CREATE POLICY survey_responses_select ON public.survey_responses
  FOR SELECT USING (
    public.is_superadmin()
    OR barangay_id = public.current_admin_barangay()
  );

-- Superadmins and barangay admins can delete (for data cleanup)
DROP POLICY IF EXISTS survey_responses_delete ON public.survey_responses;
CREATE POLICY survey_responses_delete ON public.survey_responses
  FOR DELETE USING (
    public.is_superadmin()
    OR barangay_id = public.current_admin_barangay()
  );
