// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    // Allow both dashboard/CLI secret names (no SUPABASE_ prefix) and defaults
    const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('ANON_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseKey = serviceRoleKey || anonKey;

    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({
          error: 'Missing Supabase environment variables. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY as a fallback).',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
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
    const mode = requestedMode === 'status' ? 'status' : submittedPassword ? 'validate' : 'status';

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
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
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const storedPassword = (settingRow?.value || '').trim();
    const requiresPassword = Boolean(storedPassword);

    if (mode === 'status') {
      return new Response(JSON.stringify({ valid: !requiresPassword, requiresPassword, mode }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!requiresPassword) {
      return new Response(JSON.stringify({ valid: true, requiresPassword: false }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!submittedPassword) {
      return new Response(JSON.stringify({ error: 'Password required', requiresPassword: true, mode }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (submittedPassword !== storedPassword) {
      return new Response(JSON.stringify({ error: 'Incorrect password', requiresPassword: true, mode }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ valid: true, requiresPassword: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error?.message || 'Unexpected error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
