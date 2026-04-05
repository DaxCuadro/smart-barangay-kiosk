-- Track cancelled requests instead of deleting them
-- cancelled_by: 'admin' or 'resident'
-- cancelled_at: timestamp of cancellation
alter table public.resident_intake_requests
  add column if not exists cancelled_by text,
  add column if not exists cancelled_at timestamptz;
