-- Fix RLS helper recursion by bypassing row security in helper functions.

create or replace function public.current_admin_barangay()
returns uuid
language sql
stable
security definer
set search_path = public
set row_security = off
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
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
      and role = 'superadmin'
  );
$$;
