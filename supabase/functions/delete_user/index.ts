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
      return new Response('Missing Supabase environment variables.', {
        status: 500,
        headers: corsHeaders,
      });
    }

    let body = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const authHeader = req.headers.get('Authorization') || '';
    const headerToken = authHeader.replace('Bearer ', '').trim();
    const token = headerToken || body?.access_token || '';
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized', detail: userError?.message || null }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: adminRow } = await supabaseAdmin
      .from('admin_users')
      .select('user_id, role, barangay_id')
      .eq('user_id', userData.user.id)
      .maybeSingle();

    if (!adminRow) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const isSuperadmin = adminRow.role === 'superadmin';
    const targetUserId = body?.user_id;

    if (!targetUserId) {
      return new Response(JSON.stringify({ error: 'Missing user_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: targetAdminRow } = await supabaseAdmin
      .from('admin_users')
      .select('user_id, role, barangay_id')
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (targetAdminRow) {
      return new Response(JSON.stringify({ error: `Cannot delete an ${targetAdminRow.role} account from here.` }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let targetBarangayId: string | null = null;

    const { data: targetProfileRow } = await supabaseAdmin
      .from('resident_profiles')
      .select('barangay_id')
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (targetProfileRow?.barangay_id) {
      targetBarangayId = targetProfileRow.barangay_id;
    }

    if (!targetBarangayId) {
      const { data: targetVerificationRow } = await supabaseAdmin
        .from('resident_verification_requests')
        .select('barangay_id')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (targetVerificationRow?.barangay_id) {
        targetBarangayId = targetVerificationRow.barangay_id;
      }
    }

    if (!isSuperadmin) {
      if (!adminRow.barangay_id) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!targetBarangayId || targetBarangayId !== adminRow.barangay_id) {
        return new Response(JSON.stringify({ error: 'Cross-barangay deletion is not allowed.' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);
    if (deleteError) {
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
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
