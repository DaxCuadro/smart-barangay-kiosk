-- Fix zone settings upsert: reset identity sequence and recreate function.

-- Reset the identity sequence to max(id) + 1 to prevent PK conflicts.
do $$
declare
  max_id integer;
begin
  select coalesce(max(id), 0) into max_id from public.barangay_zone_settings;
  execute format('alter table public.barangay_zone_settings alter column id restart with %s', max_id + 1);
end $$;

-- Recreate upsert function to explicitly exclude id from insert (let identity handle it).
drop function if exists public.upsert_zone_settings(uuid, int);

create function public.upsert_zone_settings(p_barangay_id uuid, p_zones_count int)
returns table (
  id integer,
  barangay_id uuid,
  zones_count integer
)
language sql
volatile
security definer
set search_path = public
set row_security = off
as $$
  insert into public.barangay_zone_settings (barangay_id, zones_count)
  values (p_barangay_id, p_zones_count)
  on conflict (barangay_id)
  do update set zones_count = excluded.zones_count
  returning id, barangay_id, zones_count;
$$;

revoke all on function public.upsert_zone_settings(uuid, int) from public;
grant execute on function public.upsert_zone_settings(uuid, int) to authenticated;
