-- Ensure one zone settings row per barangay
create unique index if not exists barangay_zone_settings_barangay_id_key
  on public.barangay_zone_settings (barangay_id);
