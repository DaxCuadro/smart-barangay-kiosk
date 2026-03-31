-- Add barangay seal image URL and extra header info per barangay
alter table barangays
  add column if not exists seal_url text,
  add column if not exists province text,
  add column if not exists municipality text,
  add column if not exists barangay_address text,
  add column if not exists barangay_email text;

-- Add alternate title / committee assignment for officials
alter table barangay_officials
  add column if not exists alternate_title text;

-- Storage bucket for barangay seal images (run via Supabase dashboard or CLI)
-- insert into storage.buckets (id, name, public) values ('barangay-seals', 'barangay-seals', true)
-- on conflict (id) do nothing;
