// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/*
 * ═══════════════════════════════════════════════════════════════════
 *  SMS PROVIDER SWITCHING GUIDE (send_sms)
 * ═══════════════════════════════════════════════════════════════════
 *
 *  CURRENT PROVIDER: PhilSMS (philsms.com)
 *    - Starts at ₱0.35/SMS, Philippine networks
 *    - Secret needed: PHILSMS_API_TOKEN
 *    - Sender ID: must be registered & active in PhilSMS dashboard
 *
 *  TO SWITCH TO SEMAPHORE:
 *    1. Comment out the "── PHILSMS PROVIDER ──" block
 *    2. Uncomment the "── SEMAPHORE PROVIDER ──" block
 *    3. Set secret: npx supabase secrets set SEMAPHORE_API_KEY=xxx
 *    4. Redeploy: npx supabase functions deploy send_sms --no-verify-jwt
 * ═══════════════════════════════════════════════════════════════════
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Phone number normalization (shared by all providers) ──
function normalizePHPhone(raw) {
  let phone = raw.replace(/[\s\-()]/g, '');
  if (phone.startsWith('+63')) phone = phone.slice(1);
  else if (phone.startsWith('0')) phone = '63' + phone.slice(1);
  return phone;
}

// ── PHILSMS PROVIDER ── (currently active)
async function sendViaSms(phone, message) {
  const apiToken = Deno.env.get('PHILSMS_API_TOKEN');
  if (!apiToken) throw new Error('PHILSMS_API_TOKEN secret not set.');
  const res = await fetch('https://dashboard.philsms.com/api/v3/sms/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      recipient: phone,
      sender_id: 'PhilSMS',
      type: 'plain',
      message,
    }),
  });
  const data = await res.json();
  if (data.status === 'error') throw new Error(data.message || JSON.stringify(data));
  return data;
}
// ── END PHILSMS PROVIDER ──

// ── SEMAPHORE PROVIDER ── (uncomment to use Semaphore instead)
// async function sendViaSms(phone, message) {
//   const apiKey = Deno.env.get('SEMAPHORE_API_KEY');
//   if (!apiKey) throw new Error('SEMAPHORE_API_KEY secret not set.');
//   const res = await fetch('https://semaphore.co/api/v4/messages', {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
//     body: new URLSearchParams({ apikey: apiKey, number: phone, message }),
//   });
//   const data = await res.json();
//   if (!res.ok) throw new Error(JSON.stringify(data));
//   return data;
// }
// ── END SEMAPHORE PROVIDER ──

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Missing Supabase environment variables.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify caller is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let body = {};
    try { body = await req.json(); } catch { body = {}; }

    const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
    const message = typeof body?.message === 'string' ? body.message.trim() : '';

    if (!phone || !message) {
      return new Response(JSON.stringify({ error: 'Missing phone or message.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const normalizedPhone = normalizePHPhone(phone);
    if (!/^63\d{10}$/.test(normalizedPhone)) {
      return new Response(JSON.stringify({ error: 'Invalid Philippine phone number.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Send SMS (swap the function call when switching providers) ──
    const smsResult = await sendViaSms(normalizedPhone, message);

    return new Response(JSON.stringify({ success: true, data: smsResult }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error?.message || 'Unexpected error.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
