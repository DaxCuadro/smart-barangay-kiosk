-- Feedback / rating system for document requests
-- Migration 023: Resident feedback after document release

create table if not exists public.resident_feedback (
  id uuid primary key default gen_random_uuid(),
  release_log_id uuid not null references public.release_logs(id) on delete cascade,
  resident_id uuid not null references public.residents(id) on delete cascade,
  barangay_id uuid not null references public.barangays(id) on delete cascade,
  rating integer not null check (rating >= 1 and rating <= 5),
  comment text default '',
  created_at timestamptz not null default now()
);

-- Prevent duplicate feedback per release
create unique index if not exists resident_feedback_release_unique
  on public.resident_feedback (release_log_id);

-- Indexes for fast lookups
create index if not exists resident_feedback_barangay_idx
  on public.resident_feedback (barangay_id, created_at desc);
create index if not exists resident_feedback_resident_idx
  on public.resident_feedback (resident_id);

-- RLS
alter table public.resident_feedback enable row level security;

-- Residents can insert their own feedback
create policy "Residents can insert own feedback"
  on public.resident_feedback for insert
  with check (auth.uid() is not null);

-- Residents can read their own feedback
create policy "Residents can read own feedback"
  on public.resident_feedback for select
  using (auth.uid() is not null);

-- Admins can read feedback for their barangay
create policy "Admins can read barangay feedback"
  on public.resident_feedback for select
  using (barangay_id = public.current_admin_barangay());

-- Superadmins can read all feedback
create policy "Superadmins can read all feedback"
  on public.resident_feedback for select
  using (public.is_superadmin());
