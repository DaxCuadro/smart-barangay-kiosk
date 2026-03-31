-- Add barangay_id to admin_events for multi-tenant isolation.

alter table public.admin_events
  add column if not exists barangay_id uuid references barangays(id);

-- Backfill existing events to default barangay
update public.admin_events
set barangay_id = (select id from barangays where code = 'default' limit 1)
where barangay_id is null;

-- Index for tenant filtering
create index if not exists admin_events_barangay_id_idx on admin_events (barangay_id);

-- RLS policies
alter table public.admin_events enable row level security;

drop policy if exists "admin_events_read_tenant" on public.admin_events;
create policy "admin_events_read_tenant"
  on public.admin_events
  for select
  using (public.is_superadmin() or barangay_id = public.current_admin_barangay());

drop policy if exists "admin_events_write_tenant" on public.admin_events;
create policy "admin_events_write_tenant"
  on public.admin_events
  for insert
  with check (public.is_superadmin() or barangay_id = public.current_admin_barangay());

drop policy if exists "admin_events_update_tenant" on public.admin_events;
create policy "admin_events_update_tenant"
  on public.admin_events
  for update
  using (public.is_superadmin() or barangay_id = public.current_admin_barangay())
  with check (public.is_superadmin() or barangay_id = public.current_admin_barangay());

drop policy if exists "admin_events_delete_tenant" on public.admin_events;
create policy "admin_events_delete_tenant"
  on public.admin_events
  for delete
  using (public.is_superadmin() or barangay_id = public.current_admin_barangay());
