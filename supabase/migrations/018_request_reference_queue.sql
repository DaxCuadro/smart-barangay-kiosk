-- Add reference_number and queue_number columns to resident_intake_requests
alter table public.resident_intake_requests
  add column if not exists reference_number text,
  add column if not exists queue_number integer;

-- Ensure reference numbers are unique
create unique index if not exists intake_requests_reference_number_unique
  on public.resident_intake_requests (reference_number)
  where reference_number is not null;

-- Add reference_number to release_logs so it persists after the request is deleted
alter table public.release_logs
  add column if not exists reference_number text;

-- Index for efficient per-barangay queue lookups
create index if not exists intake_requests_queue_lookup_idx
  on public.resident_intake_requests (barangay_id, created_at desc)
  where queue_number is not null;
