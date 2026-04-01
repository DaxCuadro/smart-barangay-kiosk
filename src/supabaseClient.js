import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Default client (used by kiosk which has no auth, and as a general fallback)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Panel-specific clients with isolated auth storage keys.
// Each panel stores its session tokens under a unique localStorage key,
// so signing out in one tab does not affect the others.
export const supabaseAdmin = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { storageKey: 'sb-admin-auth-token' },
});

export const supabaseSuperAdmin = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { storageKey: 'sb-superadmin-auth-token' },
});

export const supabaseResident = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { storageKey: 'sb-resident-auth-token' },
});