-- ============================================================
-- Migration 036: Add source tracking to feedback tables
-- Distinguishes organic feedback (from residents/kiosk) from
-- manually-entered ratings by superadmin, for transparency.
-- ============================================================

-- resident_feedback: add source column
ALTER TABLE public.resident_feedback
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'resident'
  CHECK (source IN ('resident', 'manual'));

-- kiosk_feedback: add source column
ALTER TABLE public.kiosk_feedback
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'kiosk'
  CHECK (source IN ('kiosk', 'manual'));
