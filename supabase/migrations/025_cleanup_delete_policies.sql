-- Allow superadmins (and tenant admins) to delete records for data cleanup.
-- These policies are needed for the SuperAdmin Data Cleanup feature.

-- Release logs: no delete policy existed
create policy "release_logs_delete_tenant"
  on public.release_logs
  for delete
  using (public.is_superadmin() or barangay_id = public.current_admin_barangay());

-- Resident verification requests: no delete policy existed
create policy "verification_delete_tenant"
  on public.resident_verification_requests
  for delete
  using (public.is_superadmin() or barangay_id = public.current_admin_barangay());

-- Resident feedback: only had select/insert policies
create policy "feedback_delete_superadmin"
  on public.resident_feedback
  for delete
  using (public.is_superadmin() or barangay_id = public.current_admin_barangay());

-- Audit logs: only had select/insert policies
create policy "audit_logs_delete_superadmin"
  on public.audit_logs
  for delete
  using (public.is_superadmin());
