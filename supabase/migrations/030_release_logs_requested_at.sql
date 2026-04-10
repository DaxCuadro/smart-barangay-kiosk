-- Add requested_at to release_logs so daily summaries can attribute
-- releases to the day the request was originally filed.
alter table public.release_logs
  add column if not exists requested_at timestamptz;

-- Backfill existing rows: use released_at as best-guess for historical data
update public.release_logs
  set requested_at = released_at
  where requested_at is null;
