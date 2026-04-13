-- Add purpose column to release_logs so admins can view the purpose
-- of a released document even after the original request is deleted.
alter table public.release_logs
  add column if not exists purpose text;
