// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import bcrypt from 'https://esm.sh/bcryptjs@2.4.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RATE_LIMIT_KEY = 'kiosk_pw_rate_limit';
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const BCRYPT_ROUNDS = 10;

async function getRateLimit(supabaseAdmin) {
  const { data } = await supabaseAdmin
    .from('app_settings')
    .select('value')
    .eq('key', RATE_LIMIT_KEY)
    .maybeSingle();
  if (!data?.value) return { count: 0, resetAt: 0 };
  try {
    const parsed = JSON.parse(data.value);
    return { count: parsed.count || 0, resetAt: parsed.resetAt || 0 };
  } catch {
    return { count: 0, resetAt: 0 };
  }
}

async function setRateLimit(supabaseAdmin, count, resetAt) {
  await supabaseAdmin
    .from('app_settings')
    .upsert({ key: RATE_LIMIT_KEY, value: JSON.stringify({ count, resetAt }), updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'Missing Supabase environment variables.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let body = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const requestedMode = typeof body?.mode === 'string' ? body.mode : '';
    const submittedPassword = typeof body?.password === 'string' ? body.password : '';
    const mode = requestedMode === 'status'
      ? 'status'
      : requestedMode === 'set'
        ? 'set'
        : submittedPassword
          ? 'validate'
          : 'status';

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: settingRow, error: settingError } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', 'kiosk_change_password')
      .maybeSingle();

    if (settingError) {
      return new Response(
        JSON.stringify({ error: 'Failed to read kiosk password setting.', detail: settingError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const storedHash = (settingRow?.value || '').trim();
    const requiresPassword = Boolean(storedHash);

    // --- MODE: status ---
    if (mode === 'status') {
      return new Response(JSON.stringify({ valid: !requiresPassword, requiresPassword, mode }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- MODE: set (superadmin only) ---
    if (mode === 'set') {
      const authHeader = req.headers.get('Authorization') || '';
      const token = authHeader.replace('Bearer ', '').trim();
      if (!token) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
      if (userError || !userData?.user?.id) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: adminRow } = await supabaseAdmin
        .from('admin_users')
        .select('role')
        .eq('user_id', userData.user.id)
        .maybeSingle();
      if (!adminRow || adminRow.role !== 'superadmin') {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const newPassword = typeof body?.password === 'string' ? body.password.trim() : '';
      let hashValue = null;
      if (newPassword) {
        if (newPassword.length < 6) {
          return new Response(JSON.stringify({ error: 'Kiosk password must be at least 6 characters.' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        hashValue = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
      }

      const { error: upsertError } = await supabaseAdmin
        .from('app_settings')
        .upsert({ key: 'kiosk_change_password', value: hashValue || null, updated_at: new Date().toISOString() }, { onConflict: 'key' });

      if (upsertError) {
        return new Response(JSON.stringify({ error: upsertError.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Reset rate limit on password change
      await setRateLimit(supabaseAdmin, 0, 0);

      return new Response(JSON.stringify({ success: true, requiresPassword: Boolean(hashValue) }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- MODE: validate ---
    if (!requiresPassword) {
      return new Response(JSON.stringify({ valid: true, requiresPassword: false }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!submittedPassword) {
      return new Response(JSON.stringify({ error: 'Password required', requiresPassword: true, mode }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Rate limiting check
    const rateLimit = await getRateLimit(supabaseAdmin);
    const now = Date.now();
    let currentCount = rateLimit.count;
    let currentResetAt = rateLimit.resetAt;

    if (currentResetAt && now > currentResetAt) {
      currentCount = 0;
      currentResetAt = 0;
    }

    if (currentCount >= MAX_ATTEMPTS) {
      const retryAfterSec = Math.ceil((currentResetAt - now) / 1000);
      return new Response(JSON.stringify({
        error: 'Too many failed attempts. Please try again later.',
        retryAfterSeconds: Math.max(retryAfterSec, 0),
      }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Detect if stored value is a bcrypt hash or legacy plaintext
    const isBcryptHash = storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$') || storedHash.startsWith('$2y$');
    let isMatch = false;

    if (isBcryptHash) {
      isMatch = await bcrypt.compare(submittedPassword, storedHash);
    } else {
      // Legacy plaintext comparison — auto-migrate to bcrypt on success
      isMatch = submittedPassword === storedHash;
    }

    if (!isMatch) {
      const newCount = currentCount + 1;
      const newResetAt = currentResetAt || (now + WINDOW_MS);
      await setRateLimit(supabaseAdmin, newCount, newResetAt);

      return new Response(JSON.stringify({ error: 'Incorrect password', requiresPassword: true, mode }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Successful validation — reset rate limit
    if (currentCount > 0) {
      await setRateLimit(supabaseAdmin, 0, 0);
    }

    // Auto-migrate legacy plaintext password to bcrypt hash
    if (!isBcryptHash && isMatch) {
      const migrated = await bcrypt.hash(submittedPassword, BCRYPT_ROUNDS);
      await supabaseAdmin
        .from('app_settings')
        .upsert({ key: 'kiosk_change_password', value: migrated, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    }

    return new Response(JSON.stringify({ valid: true, requiresPassword: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error?.message || 'Unexpected error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
