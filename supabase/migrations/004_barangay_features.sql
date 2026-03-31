-- Feature toggles per barangay
alter table public.barangays
  add column if not exists enable_kiosk boolean not null default true,
  add column if not exists enable_portal boolean not null default true,
  add column if not exists enable_announcements boolean not null default true;

update public.barangays
set enable_kiosk = coalesce(enable_kiosk, true),
    enable_portal = coalesce(enable_portal, true),
    enable_announcements = coalesce(enable_announcements, true);
