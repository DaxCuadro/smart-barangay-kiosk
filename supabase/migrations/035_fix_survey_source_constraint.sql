-- ============================================================
-- Migration 035: Fix survey_responses source constraint
-- Allow 'admin' source for barangay officials/staff surveys
-- ============================================================

-- Drop and recreate the CHECK constraint to include 'admin'
ALTER TABLE public.survey_responses DROP CONSTRAINT IF EXISTS survey_responses_source_check;
ALTER TABLE public.survey_responses
  ADD CONSTRAINT survey_responses_source_check
  CHECK (source IN ('kiosk', 'remote', 'admin'));
