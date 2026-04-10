-- Fix: admins could not delete residents because resident_profiles had no DELETE policy.
-- This adds a delete policy matching the same tenant pattern used on other tables.

create policy "resident_profiles_delete_tenant"
  on public.resident_profiles
  for delete
  using (public.is_superadmin() or barangay_id = public.current_admin_barangay());
