-- Audit log table for tracking all superadmin and admin actions
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  actor_email text,
  action text not null,
  target_type text,
  target_id text,
  target_label text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Index for fast lookups
create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_actor_id_idx on public.audit_logs (actor_id);
create index if not exists audit_logs_action_idx on public.audit_logs (action);

-- RLS: only superadmins can read audit logs; any authenticated user can insert (for self-logging)
alter table public.audit_logs enable row level security;

create policy "Superadmins can read audit logs"
  on public.audit_logs for select
  using (public.is_superadmin());

create policy "Authenticated users can insert audit logs"
  on public.audit_logs for insert
  with check (auth.uid() is not null);
