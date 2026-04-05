// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/*
 * ═══════════════════════════════════════════════════════════════════
 *  SMS PROVIDER SWITCHING GUIDE (request_otp)
 * ═══════════════════════════════════════════════════════════════════
 *
 *  CURRENT PROVIDER: PhilSMS (philsms.com)
 *    - Starts at ₱0.35/SMS, Philippine networks
 *    - Secret needed: PHILSMS_API_TOKEN
 *
 *  TO SWITCH TO SEMAPHORE:
 *    1. Comment out the "── PHILSMS OTP ──" block
 *    2. Uncomment the "── SEMAPHORE OTP ──" block
 *    3. Set secret: npx supabase secrets set SEMAPHORE_API_KEY=xxx
 *    4. Redeploy: npx supabase functions deploy request_otp --no-verify-jwt
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

// ── PHILSMS OTP ── (currently active)
async function sendOtp(phone, otp) {
  const apiToken = Deno.env.get('PHILSMS_API_TOKEN');
  if (!apiToken) throw new Error('PHILSMS_API_TOKEN secret not set.');
  const message = `Your Smart Barangay password reset code is: ${otp}. Valid for 5 minutes. Do not share this code.`;
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
  if (data.status === 'error') throw new Error(data.message || 'SMS provider returned an error.');
}
// ── END PHILSMS OTP ──

// ── SEMAPHORE OTP ── (uncomment to use Semaphore instead)
// async function sendOtp(phone, otp) {
//   const apiKey = Deno.env.get('SEMAPHORE_API_KEY');
//   if (!apiKey) throw new Error('SEMAPHORE_API_KEY secret not set.');
//   const res = await fetch('https://semaphore.co/api/v4/otp', {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
//     body: new URLSearchParams({
//       apikey: apiKey,
//       number: phone,
//       message: `Your Smart Barangay password reset code is: {otp}. Valid for 5 minutes. Do not share this code.`,
//       code: otp,
//     }),
//   });
//   if (!res.ok) throw new Error('SMS provider returned an error.');
// }
// ── END SEMAPHORE OTP ──

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
        .select('phone, resident_id')
        .eq('user_id', matchedUser.id)
        .maybeSingle();
      targetPhone = profileRow?.phone || '';

      // Fallback: check the linked residents table for telephone
      if (!targetPhone && profileRow?.resident_id) {
        const { data: residentRow } = await supabase
          .from('residents')
          .select('telephone')
          .eq('id', profileRow.resident_id)
          .maybeSingle();
        targetPhone = residentRow?.telephone || '';
      }
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
