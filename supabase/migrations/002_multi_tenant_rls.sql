-- Multi-tenant RLS policies (Phase 2: isolation)

-- Helper functions
create or replace function public.current_admin_barangay()
returns uuid
language sql
stable
as $$
  select barangay_id
  from public.admin_users
  where user_id = auth.uid()
  limit 1;
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
      and role = 'superadmin'
  );
$$;

-- Admin users table
alter table public.admin_users enable row level security;

create policy "admin_users_select_self_or_super"
  on public.admin_users
  for select
  using (user_id = auth.uid() or public.is_superadmin());

create policy "admin_users_manage_super"
  on public.admin_users
  for all
  using (public.is_superadmin())
  with check (public.is_superadmin());

-- Barangays table
alter table public.barangays enable row level security;

create policy "barangays_read_super_or_member"
  on public.barangays
  for select
  using (public.is_superadmin() or id = public.current_admin_barangay());

create policy "barangays_manage_super"
  on public.barangays
  for all
  using (public.is_superadmin())
  with check (public.is_superadmin());

-- Residents
alter table public.residents enable row level security;

create policy "residents_read_tenant"
  on public.residents
  for select
  using (public.is_superadmin() or barangay_id = public.current_admin_barangay());

create policy "residents_write_tenant"
  on public.residents
  for insert
  with check (public.is_superadmin() or barangay_id = public.current_admin_barangay());

create policy "residents_update_tenant"
  on public.residents
  for update
  using (public.is_superadmin() or barangay_id = public.current_admin_barangay())
  with check (public.is_superadmin() or barangay_id = public.current_admin_barangay());

create policy "residents_delete_tenant"
  on public.residents
  for delete
  using (public.is_superadmin() or barangay_id = public.current_admin_barangay());

-- Resident profiles
alter table public.resident_profiles enable row level security;

create policy "resident_profiles_read_tenant"
  on public.resident_profiles
  for select
  using (public.is_superadmin() or barangay_id = public.current_admin_barangay() or user_id = auth.uid());

create policy "resident_profiles_write_self"
  on public.resident_profiles
  for insert
  with check (user_id = auth.uid());

create policy "resident_profiles_update_self"
  on public.resident_profiles
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Resident verification requests
alter table public.resident_verification_requests enable row level security;

create policy "verification_read_tenant"
  on public.resident_verification_requests
  for select
  using (public.is_superadmin() or barangay_id = public.current_admin_barangay() or user_id = auth.uid());

create policy "verification_write_self"
  on public.resident_verification_requests
  for insert
  with check (user_id = auth.uid());

create policy "verification_update_tenant"
  on public.resident_verification_requests
  for update
  using (public.is_superadmin() or barangay_id = public.current_admin_barangay())
  with check (public.is_superadmin() or barangay_id = public.current_admin_barangay());

-- Resident intake requests
alter table public.resident_intake_requests enable row level security;

create policy "intake_read_tenant"
  on public.resident_intake_requests
  for select
  using (public.is_superadmin() or barangay_id = public.current_admin_barangay());

create policy "intake_write_tenant"
  on public.resident_intake_requests
  for insert
  with check (public.is_superadmin() or barangay_id = public.current_admin_barangay());

create policy "intake_update_tenant"
  on public.resident_intake_requests
  for update
  using (public.is_superadmin() or barangay_id = public.current_admin_barangay())
  with check (public.is_superadmin() or barangay_id = public.current_admin_barangay());

create policy "intake_delete_tenant"
  on public.resident_intake_requests
  for delete
  using (public.is_superadmin() or barangay_id = public.current_admin_barangay());

-- Release logs
alter table public.release_logs enable row level security;

create policy "release_logs_read_tenant"
  on public.release_logs
  for select
  using (public.is_superadmin() or barangay_id = public.current_admin_barangay());

create policy "release_logs_write_tenant"
  on public.release_logs
  for insert
  with check (public.is_superadmin() or barangay_id = public.current_admin_barangay());

-- Announcements
alter table public.announcements enable row level security;

create policy "announcements_read_tenant"
  on public.announcements
  for select
  using (public.is_superadmin() or barangay_id = public.current_admin_barangay());

create policy "announcements_write_tenant"
  on public.announcements
  for insert
  with check (public.is_superadmin() or barangay_id = public.current_admin_barangay());

create policy "announcements_update_tenant"
  on public.announcements
  for update
  using (public.is_superadmin() or barangay_id = public.current_admin_barangay())
  with check (public.is_superadmin() or barangay_id = public.current_admin_barangay());

create policy "announcements_delete_tenant"
  on public.announcements
  for delete
  using (public.is_superadmin() or barangay_id = public.current_admin_barangay());

-- Barangay zone settings
alter table public.barangay_zone_settings enable row level security;

create policy "zone_settings_read_tenant"
  on public.barangay_zone_settings
  for select
  using (public.is_superadmin() or barangay_id = public.current_admin_barangay());

create policy "zone_settings_write_tenant"
  on public.barangay_zone_settings
  for insert
  with check (public.is_superadmin() or barangay_id = public.current_admin_barangay());

create policy "zone_settings_update_tenant"
  on public.barangay_zone_settings
  for update
  using (public.is_superadmin() or barangay_id = public.current_admin_barangay())
  with check (public.is_superadmin() or barangay_id = public.current_admin_barangay());

-- Barangay officials
alter table public.barangay_officials enable row level security;

create policy "officials_read_tenant"
  on public.barangay_officials
  for select
  using (public.is_superadmin() or barangay_id = public.current_admin_barangay());

create policy "officials_write_tenant"
  on public.barangay_officials
  for insert
  with check (public.is_superadmin() or barangay_id = public.current_admin_barangay());

create policy "officials_update_tenant"
  on public.barangay_officials
  for update
  using (public.is_superadmin() or barangay_id = public.current_admin_barangay())
  with check (public.is_superadmin() or barangay_id = public.current_admin_barangay());

create policy "officials_delete_tenant"
  on public.barangay_officials
  for delete
  using (public.is_superadmin() or barangay_id = public.current_admin_barangay());
