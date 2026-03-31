-- Allow barangay admins and superadmins to insert verification records
-- (e.g. when confirming a new kiosk applicant into the residents table)
create policy "verification_insert_admin"
  on public.resident_verification_requests
  for insert
  with check (
    public.is_superadmin()
    or barangay_id = public.current_admin_barangay()
  );
