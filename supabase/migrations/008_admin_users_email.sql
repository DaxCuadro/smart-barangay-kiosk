-- Add email cache for admin users.

alter table public.admin_users
  add column if not exists email text;

create index if not exists admin_users_email_idx on public.admin_users (email);
