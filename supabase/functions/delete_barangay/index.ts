// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function deleteAuthUsers(supabaseAdmin, userIds) {
  const failures = [];
  for (const userId of userIds) {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error && !String(error.message || '').toLowerCase().includes('not found')) {
      failures.push({ user_id: userId, message: error.message });
    }
  }
  return failures;
}

Deno.serve(async req => {
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

    const authHeader = req.headers.get('Authorization') || '';
    const headerToken = authHeader.replace('Bearer ', '').trim();
    const token = body?.access_token || headerToken || '';

    console.log(JSON.stringify({
      stage: 'delete_barangay_token_input',
      hasAuthHeader: Boolean(authHeader),
      headerTokenLength: headerToken?.length || 0,
      bodyTokenLength: body?.access_token ? String(body.access_token).length : 0,
      resolvedTokenLength: token ? String(token).length : 0,
      barangayId: body?.barangay_id,
    }));

    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const targetBarangayId = body?.barangay_id;
    if (!targetBarangayId) {
      return new Response(JSON.stringify({ error: 'Missing barangay_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Decode JWT locally (avoids getUser failures even when the edge gateway accepted the token)
    function decodeJwtSub(jwt: string): string | null {
      try {
        const parts = jwt.split('.');
        if (parts.length !== 3) return null;
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
        const payloadJson = atob(padded);
        const payload = JSON.parse(payloadJson);
        return payload?.sub || null;
      } catch (err) {
        console.log(JSON.stringify({ stage: 'delete_barangay_jwt_decode_error', message: String(err) }));
        return null;
      }
    }

    const callerUserId = decodeJwtSub(token);

    console.log(JSON.stringify({
      stage: 'delete_barangay_decode',
      hasUser: Boolean(callerUserId),
      userId: callerUserId,
    }));

    if (!callerUserId) {
      return new Response(JSON.stringify({ error: 'Unauthorized', detail: 'Invalid or missing JWT sub' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: callerAdmin } = await supabaseAdmin
      .from('admin_users')
      .select('user_id, role')
      .eq('user_id', callerUserId)
      .maybeSingle();

    if (!callerAdmin || callerAdmin.role !== 'superadmin') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: barangayRow, error: barangayError } = await supabaseAdmin
      .from('barangays')
      .select('id, name, code')
      .eq('id', targetBarangayId)
      .maybeSingle();

    if (barangayError) {
      return new Response(JSON.stringify({ error: barangayError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!barangayRow) {
      return new Response(JSON.stringify({ error: 'Barangay not found.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: adminsInBarangay, error: adminsError } = await supabaseAdmin
      .from('admin_users')
      .select('user_id, role')
      .eq('barangay_id', targetBarangayId);

    if (adminsError) {
      return new Response(JSON.stringify({ error: adminsError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const hasSuperadminAssignment = (adminsInBarangay || []).some(item => item.role === 'superadmin');
    if (hasSuperadminAssignment) {
      return new Response(JSON.stringify({
        error: 'Cannot delete a barangay that still has a superadmin assignment. Reassign that account first.',
      }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profileUsers, error: profilesError } = await supabaseAdmin
      .from('resident_profiles')
      .select('user_id')
      .eq('barangay_id', targetBarangayId)
      .not('user_id', 'is', null);

    if (profilesError) {
      return new Response(JSON.stringify({ error: profilesError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const residentUserIds = Array.from(new Set((profileUsers || []).map(row => row.user_id).filter(Boolean)));
    const adminUserIds = Array.from(
      new Set((adminsInBarangay || []).filter(item => item.role !== 'superadmin').map(item => item.user_id).filter(Boolean)),
    );

    const authDeletionErrors = await deleteAuthUsers(
      supabaseAdmin,
      Array.from(new Set([...residentUserIds, ...adminUserIds])),
    );

    if (authDeletionErrors.length) {
      return new Response(JSON.stringify({
        error: 'Failed to delete one or more auth users tied to this barangay.',
        detail: authDeletionErrors,
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tableDeletes = [
      ['release_logs', 'barangay_id'],
      ['resident_verification_requests', 'barangay_id'],
      ['resident_intake_requests', 'barangay_id'],
      ['announcements', 'barangay_id'],
      ['admin_events', 'barangay_id'],
      ['barangay_officials', 'barangay_id'],
      ['barangay_zone_settings', 'barangay_id'],
      ['resident_profiles', 'barangay_id'],
      ['residents', 'barangay_id'],
      ['admin_users', 'barangay_id'],
    ];

    for (const [table, column] of tableDeletes) {
      const { error } = await supabaseAdmin.from(table).delete().eq(column, targetBarangayId);
      if (error) {
        return new Response(JSON.stringify({
          error: `Failed while deleting ${table}.`,
          detail: error.message,
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (residentUserIds.length) {
      const { error: residentAccountsDeleteError } = await supabaseAdmin
        .from('resident_accounts')
        .delete()
        .in('user_id', residentUserIds);
      if (residentAccountsDeleteError) {
        return new Response(JSON.stringify({
          error: 'Failed while deleting resident_accounts.',
          detail: residentAccountsDeleteError.message,
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const { error: deleteBarangayError } = await supabaseAdmin
      .from('barangays')
      .delete()
      .eq('id', targetBarangayId);

    if (deleteBarangayError) {
      return new Response(JSON.stringify({
        error: 'Failed while deleting barangay record.',
        detail: deleteBarangayError.message,
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      barangay_id: targetBarangayId,
      barangay_name: barangayRow.name,
    }), {
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
