import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  let credentialIdToLog: string | undefined;
  let accountIdToLog: string | undefined;
  let correlationId = crypto.randomUUID();

  try {
    const { code, credentialId } = await req.json();
    credentialIdToLog = credentialId;

    // 1. Obtener secretos
    const { data: cred, error: dbError } = await supabaseClient
      .rpc('get_credential_by_id', { p_credential_id: credentialId })
      .single()

    if (dbError || !cred) throw new Error("Credencial no encontrada en la DB.");
    accountIdToLog = cred.account_id;

    // 2. Intercambio de tokens con Cal.com v1
    const basicAuth = btoa(`${cred.client_id}:${cred.client_secret}`);
    const tokenExchangeUrl = 'https://app.cal.com/api/auth/oauth/token';
    
    const response = await fetch(tokenExchangeUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: `${Deno.env.get('APP_URL') || 'http://localhost:5173'}/oauth/callback`,
      }),
    })

    const data = await response.json()
    if (!response.ok) throw new Error(data.message || 'Error en intercambio Cal.com');

    // 3. Guardar tokens (Mapeo flexible v1)
    const { error: updateError } = await supabaseClient
      .schema('core')
      .from('business_credentials')
      .update({
        access_token: data.access_token || data.accessToken,
        refresh_token: data.refresh_token || data.refreshToken,
        external_user_id: (data.user_id || data.ownerId || data.username)?.toString(),
        expires_at: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null,
        external_status: 'active',
        is_deleted: false
      })
      .eq('id', credentialId)

    if (updateError) throw updateError

    // 4. Auditoría Exitosa
    await supabaseClient.schema('logs').from('api_logs').insert({
      account_id: accountIdToLog,
      api_name: 'CAL_COM',
      endpoint: tokenExchangeUrl,
      operation_name: 'oauth_exchange_success',
      status: 'SUCCESS',
      correlation_id: correlationId
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error("Cal.com OAuth Error:", error.message);
    
    // Log de Auditoría Fallido
    const errorClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    await errorClient.schema('logs').from('api_logs').insert({
      account_id: accountIdToLog || null,
      api_name: 'CAL_COM',
      operation_name: 'oauth_exchange_failed',
      status: 'FAILED',
      response_payload: { message: error.message },
      correlation_id: correlationId
    });

    return new Response(JSON.stringify({ success: false, message: error.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
