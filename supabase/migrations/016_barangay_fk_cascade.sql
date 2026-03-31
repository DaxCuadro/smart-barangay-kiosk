-- Ensure deleting a barangay can cascade through tenant-scoped rows.
-- This prevents foreign key blockage from tables like admin_users.

do $$
begin
  if to_regclass('public.admin_users') is not null then
    alter table public.admin_users drop constraint if exists admin_users_barangay_id_fkey;
    alter table public.admin_users
      add constraint admin_users_barangay_id_fkey
      foreign key (barangay_id) references public.barangays(id) on delete cascade;
  end if;

  if to_regclass('public.residents') is not null then
    alter table public.residents drop constraint if exists residents_barangay_id_fkey;
    alter table public.residents
      add constraint residents_barangay_id_fkey
      foreign key (barangay_id) references public.barangays(id) on delete cascade;
  end if;

  if to_regclass('public.resident_profiles') is not null then
    alter table public.resident_profiles drop constraint if exists resident_profiles_barangay_id_fkey;
    alter table public.resident_profiles
      add constraint resident_profiles_barangay_id_fkey
      foreign key (barangay_id) references public.barangays(id) on delete cascade;
  end if;

  if to_regclass('public.resident_verification_requests') is not null then
    alter table public.resident_verification_requests drop constraint if exists resident_verification_requests_barangay_id_fkey;
    alter table public.resident_verification_requests
      add constraint resident_verification_requests_barangay_id_fkey
      foreign key (barangay_id) references public.barangays(id) on delete cascade;
  end if;

  if to_regclass('public.resident_intake_requests') is not null then
    alter table public.resident_intake_requests drop constraint if exists resident_intake_requests_barangay_id_fkey;
    alter table public.resident_intake_requests
      add constraint resident_intake_requests_barangay_id_fkey
      foreign key (barangay_id) references public.barangays(id) on delete cascade;
  end if;

  if to_regclass('public.release_logs') is not null then
    alter table public.release_logs drop constraint if exists release_logs_barangay_id_fkey;
    alter table public.release_logs
      add constraint release_logs_barangay_id_fkey
      foreign key (barangay_id) references public.barangays(id) on delete cascade;
  end if;

  if to_regclass('public.announcements') is not null then
    alter table public.announcements drop constraint if exists announcements_barangay_id_fkey;
    alter table public.announcements
      add constraint announcements_barangay_id_fkey
      foreign key (barangay_id) references public.barangays(id) on delete cascade;
  end if;

  if to_regclass('public.barangay_zone_settings') is not null then
    alter table public.barangay_zone_settings drop constraint if exists barangay_zone_settings_barangay_id_fkey;
    alter table public.barangay_zone_settings
      add constraint barangay_zone_settings_barangay_id_fkey
      foreign key (barangay_id) references public.barangays(id) on delete cascade;
  end if;

  if to_regclass('public.barangay_officials') is not null then
    alter table public.barangay_officials drop constraint if exists barangay_officials_barangay_id_fkey;
    alter table public.barangay_officials
      add constraint barangay_officials_barangay_id_fkey
      foreign key (barangay_id) references public.barangays(id) on delete cascade;
  end if;

  if to_regclass('public.admin_events') is not null then
    alter table public.admin_events drop constraint if exists admin_events_barangay_id_fkey;
    alter table public.admin_events
      add constraint admin_events_barangay_id_fkey
      foreign key (barangay_id) references public.barangays(id) on delete cascade;
  end if;
end $$;
