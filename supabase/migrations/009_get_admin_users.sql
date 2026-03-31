-- Superadmin-only RPC to list admin users with email.

create or replace function public.get_admin_users()
returns table (
  user_id uuid,
  email text,
  role text,
  barangay_id uuid,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select au.user_id, au.email, au.role, au.barangay_id, au.created_at
  from public.admin_users as au
  where public.is_superadmin();
$$;

revoke all on function public.get_admin_users() from public;
grant execute on function public.get_admin_users() to authenticated;
