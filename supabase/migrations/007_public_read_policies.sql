-- Allow public read access for kiosk/portal lookup data.

-- Barangays
alter table public.barangays enable row level security;

drop policy if exists "barangays_read_public" on public.barangays;
create policy "barangays_read_public"
  on public.barangays
  for select
  using (status <> 'inactive');

-- Announcements
alter table public.announcements enable row level security;

drop policy if exists "announcements_read_public" on public.announcements;
create policy "announcements_read_public"
  on public.announcements
  for select
  using (true);

-- Zone settings
alter table public.barangay_zone_settings enable row level security;

drop policy if exists "zone_settings_read_public" on public.barangay_zone_settings;
create policy "zone_settings_read_public"
  on public.barangay_zone_settings
  for select
  using (true);
