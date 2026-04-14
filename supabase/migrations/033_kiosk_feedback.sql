-- Kiosk walk-in feedback / rating after document request submission
-- Migration 033: kiosk_feedback

create table if not exists public.kiosk_feedback (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete cascade,
  request_id uuid references public.resident_intake_requests(id) on delete set null,
  resident_name text default '',
  document text default '',
  rating integer not null check (rating >= 1 and rating <= 5),
  comment text default '',
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists kiosk_feedback_barangay_idx
  on public.kiosk_feedback (barangay_id, created_at desc);

-- RLS
alter table public.kiosk_feedback enable row level security;

-- Anyone can insert (kiosk is unauthenticated)
create policy "Anyone can insert kiosk feedback"
  on public.kiosk_feedback for insert
  with check (true);

-- Admins can read feedback for their barangay
create policy "Admins can read barangay kiosk feedback"
  on public.kiosk_feedback for select
  using (barangay_id = public.current_admin_barangay());

-- Superadmins can read all kiosk feedback
create policy "Superadmins can read all kiosk feedback"
  on public.kiosk_feedback for select
  using (public.is_superadmin());

-- Superadmins can delete kiosk feedback (cleanup)
create policy "Superadmins can delete kiosk feedback"
  on public.kiosk_feedback for delete
  using (public.is_superadmin());
