import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Default client (used by kiosk which has no auth, and as a general fallback).
// No session persistence — kiosk access is anonymous.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Panel-specific clients with isolated auth storage keys.
// Each panel stores its session tokens under a unique localStorage key,
// so signing out in one tab does not affect the others.
//
// IMPORTANT: These are created lazily (on first call) so that only the
// active panel's client is created on any given page load.  This prevents
// multiple simultaneous token-refresh requests (one per client) that would
// trigger Supabase's 429 rate-limit and forcefully sign the user out.

let _supabaseAdmin;
export function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { storageKey: 'sb-admin-auth-token' },
    });
  }
  return _supabaseAdmin;
}

let _supabaseSuperAdmin;
export function getSupabaseSuperAdmin() {
  if (!_supabaseSuperAdmin) {
    _supabaseSuperAdmin = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { storageKey: 'sb-superadmin-auth-token' },
    });
  }
  return _supabaseSuperAdmin;
}

let _supabaseResident;
export function getSupabaseResident() {
  if (!_supabaseResident) {
    _supabaseResident = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { storageKey: 'sb-resident-auth-token' },
    });
  }
  return _supabaseResident;
}