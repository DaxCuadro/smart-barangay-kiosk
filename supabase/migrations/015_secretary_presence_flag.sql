-- Track whether secretary desk is currently available per barangay.
-- Stored alongside zone settings so barangay admins can manage it.

alter table public.barangay_zone_settings
  add column if not exists secretary_present boolean not null default true;
