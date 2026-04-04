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
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Missing Supabase environment variables.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let body = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const otp = typeof body?.otp === 'string' ? body.otp.trim() : '';
    const newPassword = typeof body?.new_password === 'string' ? body.new_password : '';

    if (!email || !otp || !newPassword) {
      return new Response(JSON.stringify({ error: 'Email, OTP, and new password are required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (newPassword.length < 8) {
      return new Response(JSON.stringify({ error: 'Password must be at least 8 characters.' }), {
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
      return new Response(JSON.stringify({ error: 'Failed to verify OTP.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const matchedUser = (users || []).find(u => u.email?.toLowerCase() === email);
    if (!matchedUser) {
      return new Response(JSON.stringify({ error: 'Invalid OTP or email.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find valid OTP
    const now = new Date().toISOString();
    const { data: otpRow, error: otpError } = await supabase
      .from('password_reset_otps')
      .select('id, otp_code, expires_at, used, attempts')
      .eq('user_id', matchedUser.id)
      .eq('otp_code', otp)
      .eq('used', false)
      .gte('expires_at', now)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (otpError || !otpRow) {
      // Increment attempts on the most recent OTP for brute-force protection
      const { data: latestOtp } = await supabase
        .from('password_reset_otps')
        .select('id, attempts')
        .eq('user_id', matchedUser.id)
        .eq('used', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestOtp) {
        const newAttempts = (latestOtp.attempts || 0) + 1;
        if (newAttempts >= 5) {
          // Invalidate OTP after 5 failed attempts
          await supabase
            .from('password_reset_otps')
            .update({ used: true, attempts: newAttempts })
            .eq('id', latestOtp.id);
          return new Response(JSON.stringify({ error: 'OTP has been invalidated after too many attempts. Request a new one.' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        await supabase
          .from('password_reset_otps')
          .update({ attempts: newAttempts })
          .eq('id', latestOtp.id);
      }

      return new Response(JSON.stringify({ error: 'Invalid or expired OTP.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Mark OTP as used
    await supabase
      .from('password_reset_otps')
      .update({ used: true })
      .eq('id', otpRow.id);

    // Update password via admin API
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      matchedUser.id,
      { password: newPassword },
    );

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message || 'Failed to update password.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, message: 'Password updated successfully.' }), {
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
