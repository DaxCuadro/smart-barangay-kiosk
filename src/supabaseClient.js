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
// IMPORTANT: These are created lazily (on first call) to avoid multiple
// simultaneous token-refresh requests at startup, which triggers Supabase's
// 429 rate-limit and forcefully signs the user out.

let _supabaseAdmin;
export function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storageKey: 'sb-admin-auth-token',
        autoRefreshToken: false,   // We start auto-refresh manually after validating the session
        detectSessionInUrl: false, // Admin panel doesn't use OAuth redirects
      },
    });
  }
  return _supabaseAdmin;
}

let _supabaseSuperAdmin;
export function getSupabaseSuperAdmin() {
  if (!_supabaseSuperAdmin) {
    _supabaseSuperAdmin = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storageKey: 'sb-superadmin-auth-token',
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return _supabaseSuperAdmin;
}

let _supabaseResident;
export function getSupabaseResident() {
  if (!_supabaseResident) {
    _supabaseResident = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storageKey: 'sb-resident-auth-token',
        autoRefreshToken: false,
      },
    });
  }
  return _supabaseResident;
}