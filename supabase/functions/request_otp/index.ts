// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/*
 * ═══════════════════════════════════════════════════════════════════
 *  SMS PROVIDER SWITCHING GUIDE (request_otp)
 * ═══════════════════════════════════════════════════════════════════
 *
 *  CURRENT PROVIDER: Semaphore OTP endpoint (semaphore.co)
 *    - ₱1.00/OTP (priority queue, dedicated OTP route)
 *    - Secret needed: SEMAPHORE_API_KEY
 *
 *  TO SWITCH TO TWILIO:
 *    1. Comment out the "── SEMAPHORE OTP ──" block
 *    2. Uncomment the "── TWILIO OTP ──" block
 *    3. Set secrets: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
 *    4. Redeploy: npx supabase functions deploy request_otp --no-verify-jwt
 *
 *  TO SWITCH BACK TO SEMAPHORE:
 *    1. Comment out the "── TWILIO OTP ──" block
 *    2. Uncomment the "── SEMAPHORE OTP ──" block
 *    3. Redeploy: npx supabase functions deploy request_otp --no-verify-jwt
 * ═══════════════════════════════════════════════════════════════════
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Phone number normalization ──
function normalizePHPhone(raw) {
  let phone = raw.replace(/[\s\-()]/g, '');
  if (phone.startsWith('+63')) phone = phone.slice(1);
  else if (phone.startsWith('0')) phone = '63' + phone.slice(1);
  return phone;
}

// ── SEMAPHORE OTP ── (currently active)
async function sendOtp(phone, otp) {
  const apiKey = Deno.env.get('SEMAPHORE_API_KEY');
  if (!apiKey) throw new Error('SEMAPHORE_API_KEY secret not set.');
  const res = await fetch('https://api.semaphore.co/api/v4/otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      apikey: apiKey,
      number: phone,
      message: `Your Smart Barangay password reset code is: {otp}. Valid for 5 minutes. Do not share this code.`,
      code: otp,
    }),
  });
  if (!res.ok) throw new Error('SMS provider returned an error.');
}
// ── END SEMAPHORE OTP ──

// ── TWILIO OTP ── (uncomment to use Twilio instead)
// async function sendOtp(phone, otp) {
//   const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
//   const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
//   const fromNumber = Deno.env.get('TWILIO_FROM_NUMBER');
//   if (!accountSid || !authToken || !fromNumber) throw new Error('Twilio secrets not set.');
//   const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
//     method: 'POST',
//     headers: {
//       'Content-Type': 'application/x-www-form-urlencoded',
//       'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
//     },
//     body: new URLSearchParams({
//       To: '+' + phone,
//       From: fromNumber,
//       Body: `Your Smart Barangay password reset code is: ${otp}. Valid for 5 minutes. Do not share this code.`,
//     }),
//   });
//   if (!res.ok) throw new Error('SMS provider returned an error.');
// }
// ── END TWILIO OTP ──

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

    let body = {};
    try { body = await req.json(); } catch { body = {}; }

    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
    const userType = typeof body?.user_type === 'string' ? body.user_type : 'resident';

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Look up the user by email
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) {
      return new Response(JSON.stringify({ error: 'Failed to look up user.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const matchedUser = (users || []).find(u => u.email?.toLowerCase() === email);
    if (!matchedUser) {
      // Don't reveal whether the account exists
      return new Response(JSON.stringify({ success: true, message: 'If an account exists, an OTP has been sent.' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Determine phone number to use
    let targetPhone = phone;

    if (!targetPhone && userType === 'admin') {
      const { data: adminRow } = await supabase
        .from('admin_users')
        .select('phone')
        .eq('user_id', matchedUser.id)
        .maybeSingle();
      targetPhone = adminRow?.phone || '';
    }

    if (!targetPhone && (userType === 'resident' || !targetPhone)) {
      const { data: profileRow } = await supabase
        .from('resident_profiles')
        .select('phone')
        .eq('user_id', matchedUser.id)
        .maybeSingle();
      targetPhone = profileRow?.phone || '';
    }

    if (!targetPhone) {
      return new Response(JSON.stringify({ error: 'No phone number on file for this account. Contact your barangay admin.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const normalizedPhone = normalizePHPhone(targetPhone);
    if (!/^63\d{10}$/.test(normalizedPhone)) {
      return new Response(JSON.stringify({ error: 'Invalid phone number on file.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Rate limit: max 3 OTPs per email in 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count: recentCount } = await supabase
      .from('password_reset_otps')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', matchedUser.id)
      .gte('created_at', tenMinutesAgo);

    if ((recentCount || 0) >= 3) {
      return new Response(JSON.stringify({ error: 'Too many OTP requests. Please wait 10 minutes.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const { error: insertError } = await supabase
      .from('password_reset_otps')
      .insert({ user_id: matchedUser.id, otp_code: otp, expires_at: expiresAt, used: false });

    if (insertError) {
      return new Response(JSON.stringify({ error: 'Failed to generate OTP.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Send OTP via active provider
    await sendOtp(normalizedPhone, otp);

    const lastFour = normalizedPhone.slice(-4);
    const maskedPhone = `****${lastFour}`;

    return new Response(JSON.stringify({
      success: true,
      message: 'OTP sent to your registered phone number.',
      masked_phone: maskedPhone,
    }), {
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
