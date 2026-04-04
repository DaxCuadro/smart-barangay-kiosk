-- SMS & OTP support: phone columns + OTP table
-- Migration 022: SMS notifications and OTP password reset

-- Add phone column to resident_profiles for SMS notifications
alter table public.resident_profiles
  add column if not exists phone text;

-- Add phone column to admin_users for admin OTP password reset
alter table public.admin_users
  add column if not exists phone text;

-- OTP table for password resets via SMS
create table if not exists public.password_reset_otps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  otp_code text not null,
  expires_at timestamptz not null,
  used boolean not null default false,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);

-- Index for fast lookups by user + active OTPs
create index if not exists password_reset_otps_user_id_idx
  on public.password_reset_otps (user_id, used, expires_at);

-- Auto-cleanup: delete expired OTPs older than 1 hour (run periodically or via cron)
-- For now, the edge function handles expiry checks.

-- RLS: only service role should access OTPs (edge functions use service role key)
alter table public.password_reset_otps enable row level security;

-- No public policies — only service_role can read/write OTPs
-- This ensures OTPs are never accessible from the client side
