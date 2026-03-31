-- App-wide settings storage (global).
-- Apply after 004 migrations.

create table if not exists app_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

alter table app_settings enable row level security;

drop policy if exists "app_settings_read" on app_settings;
create policy "app_settings_read"
on app_settings
for select
using (true);

drop policy if exists "app_settings_superadmin_write" on app_settings;
create policy "app_settings_superadmin_write"
on app_settings
for all
using (is_superadmin())
with check (is_superadmin());
