-- Multi-tenant foundation (Phase 1: schema + backfill)
-- Apply this in Supabase SQL editor for your main project.

create table if not exists barangays (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

-- Ensure a default barangay exists for backfill
insert into barangays (name, code)
values ('Default Barangay', 'default')
on conflict (code) do nothing;

-- Admin users: add role + barangay ownership
alter table admin_users
  add column if not exists barangay_id uuid references barangays(id),
  add column if not exists role text not null default 'barangay_admin';

-- Core tables: add barangay_id columns
alter table residents add column if not exists barangay_id uuid references barangays(id);
alter table resident_profiles add column if not exists barangay_id uuid references barangays(id);
alter table resident_verification_requests add column if not exists barangay_id uuid references barangays(id);
alter table resident_intake_requests add column if not exists barangay_id uuid references barangays(id);
alter table release_logs add column if not exists barangay_id uuid references barangays(id);
alter table announcements add column if not exists barangay_id uuid references barangays(id);
alter table barangay_zone_settings add column if not exists barangay_id uuid references barangays(id);
alter table barangay_officials add column if not exists barangay_id uuid references barangays(id);

-- Backfill barangay_id for existing data
update admin_users
set barangay_id = (select id from barangays where code = 'default' limit 1)
where barangay_id is null;

update residents
set barangay_id = (select id from barangays where code = 'default' limit 1)
where barangay_id is null;

update resident_profiles
set barangay_id = (select id from barangays where code = 'default' limit 1)
where barangay_id is null;

update resident_verification_requests
set barangay_id = (select id from barangays where code = 'default' limit 1)
where barangay_id is null;

update resident_intake_requests
set barangay_id = (select id from barangays where code = 'default' limit 1)
where barangay_id is null;

update release_logs
set barangay_id = (select id from barangays where code = 'default' limit 1)
where barangay_id is null;

update announcements
set barangay_id = (select id from barangays where code = 'default' limit 1)
where barangay_id is null;

update barangay_zone_settings
set barangay_id = (select id from barangays where code = 'default' limit 1)
where barangay_id is null;

update barangay_officials
set barangay_id = (select id from barangays where code = 'default' limit 1)
where barangay_id is null;

-- Optional: enforce not null after backfill (enable when ready)
-- alter table admin_users alter column barangay_id set not null;
-- alter table residents alter column barangay_id set not null;
-- alter table resident_profiles alter column barangay_id set not null;
-- alter table resident_verification_requests alter column barangay_id set not null;
-- alter table resident_intake_requests alter column barangay_id set not null;
-- alter table release_logs alter column barangay_id set not null;
-- alter table announcements alter column barangay_id set not null;
-- alter table barangay_zone_settings alter column barangay_id set not null;
-- alter table barangay_officials alter column barangay_id set not null;

-- Indexes for tenant filtering
create index if not exists admin_users_barangay_id_idx on admin_users (barangay_id);
create index if not exists residents_barangay_id_idx on residents (barangay_id);
create index if not exists resident_profiles_barangay_id_idx on resident_profiles (barangay_id);
create index if not exists resident_verification_requests_barangay_id_idx on resident_verification_requests (barangay_id);
create index if not exists resident_intake_requests_barangay_id_idx on resident_intake_requests (barangay_id);
create index if not exists release_logs_barangay_id_idx on release_logs (barangay_id);
create index if not exists announcements_barangay_id_idx on announcements (barangay_id);
create index if not exists barangay_zone_settings_barangay_id_idx on barangay_zone_settings (barangay_id);
create index if not exists barangay_officials_barangay_id_idx on barangay_officials (barangay_id);
