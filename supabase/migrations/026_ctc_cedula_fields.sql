-- Add CTC (Community Tax Certificate / Cedula) fields to intake requests.
-- These are optional and only relevant for Barangay Clearance and Business Clearance.

alter table public.resident_intake_requests
  add column if not exists ctc_number text,
  add column if not exists ctc_date date;
