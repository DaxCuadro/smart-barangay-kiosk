-- Migration 028: Security hardening for RLS policies
-- 1. Explicit deny-all on password_reset_otps (only service_role bypasses RLS)
-- 2. Tighten audit_logs insert to admins/superadmins only
-- 3. Add deny-all for update/delete on audit_logs

-- ============================================================
-- password_reset_otps: explicit deny-all policies
-- Service role key bypasses RLS entirely, so edge functions
-- still work. This blocks any authenticated client-side access.
-- ============================================================

create policy "Deny all select on password_reset_otps"
  on public.password_reset_otps for select
  using (false);

create policy "Deny all insert on password_reset_otps"
  on public.password_reset_otps for insert
  with check (false);

create policy "Deny all update on password_reset_otps"
  on public.password_reset_otps for update
  using (false);

create policy "Deny all delete on password_reset_otps"
  on public.password_reset_otps for delete
  using (false);

-- ============================================================
-- audit_logs: tighten insert policy
-- Only admin users (admin or superadmin in admin_users table)
-- should be able to insert audit log entries.
-- ============================================================

drop policy if exists "Authenticated users can insert audit logs" on public.audit_logs;

create policy "Admin users can insert audit logs"
  on public.audit_logs for insert
  with check (
    exists (
      select 1 from public.admin_users
      where admin_users.user_id = auth.uid()
    )
  );

-- Prevent any update or delete on audit logs (immutable trail)
create policy "Deny all update on audit_logs"
  on public.audit_logs for update
  using (false);

create policy "Deny all delete on audit_logs"
  on public.audit_logs for delete
  using (false);
