import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Manejo de CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Verificar que la llamada viene del service_role o de un scheduler autorizado
  if (req.headers.get('Authorization') !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let accountId: string | undefined; // Para logs
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const logApiAction = async (level: 'info' | 'error', operation: string, credId: string, accId: string | undefined, details: any) => {
    await supabaseClient.schema('logs').from('api_logs').insert({
      account_id: accId,
      api_name: 'TOKEN_REFRESHER',
      operation_name: operation,
      correlation_id: credId,
      request_payload: details.request || null,
      response_payload: details.response || null,
      status: level === 'info' ? 'SUCCESS' : 'FAILED',
    }).catch(err => console.error("Error logging:", err.message));
  }

  try {
    const requestBody = await req.json();
    accountId = requestBody.accountId; // Ahora accountId se define en el ámbito try

    if (!accountId) {
      throw new Error('ID de cuenta (accountId) faltante en la petición.');
    }

    // 1. Obtener credenciales a refrescar
    const { data: credentialsToRefresh, error: dbError } = await supabaseClient
      .schema('core')
      .from('business_credentials')
      .select('id, account_id, api_name, client_id, client_secret, refresh_token, expires_at, is_locked')
      .eq('account_id', accountId)
    .eq('api_name', 'MERCADOPAGO')
      .not('refresh_token', 'is', null)
      .eq('is_deleted', false)
      .eq('external_status', 'active')
      .eq('is_locked', false) // Solo procesar si no está bloqueada actualmente
      
    if (dbError) throw new Error(`Error al obtener credenciales: ${dbError.message}`)

    const renewalResults = []

    for (const cred of credentialsToRefresh) {
      // Bloquear la credencial para evitar race conditions
      let locked = false;
      try {
        const { data: lockSuccess, error: lockError } = await supabaseClient
          .rpc('lock_credential', { p_credential_id: cred.id })
          .single();

        if (lockError) throw lockError;
        if (!lockSuccess) { // Si no se pudo bloquear (ya estaba bloqueada por otra instancia)
          renewalResults.push({ id: cred.id, api_name: cred.api_name, status: 'skipped_locked' });
          console.log(`Credencial ${cred.id} ya bloqueada, saltando.`);
          await logApiAction('info', 'token_refresh_skipped_locked', cred.id, cred.account_id, { message: 'Credencial ya bloqueada.' });
          continue; // Saltar a la siguiente credencial
        }
        locked = true;

        let renewed = false;
        const now = Date.now();
        const expiresAt = cred.expires_at ? new Date(cred.expires_at).getTime() : 0;
        
        // Criterio de renovación (7 días para MP, 30 minutos para Cal.com)
        const shouldRenew = expiresAt < now + 7 * 24 * 60 * 60 * 1000;

        if (!cred.expires_at || !cred.access_token || shouldRenew) {
          console.log(`Renovando ${cred.api_name} para credencial ${cred.id} de cuenta ${cred.account_id}...`);
          await logApiAction('info', 'token_refresh_attempt', cred.id, cred.account_id, { message: 'Iniciando renovación.' });

          if (cred.api_name === 'MERCADOPAGO') {
            const { newAccessToken, newRefreshToken, newExpiresIn, newExternalUserId } = await refreshMercadoPagoToken(
              cred.client_id,
              cred.client_secret,
              cred.refresh_token!,
            )

            const { error: updateError } = await supabaseClient
              .schema('core')
              .from('business_credentials')
              .update({
                access_token: newAccessToken,
                refresh_token: newRefreshToken,
                expires_at: new Date(now + newExpiresIn * 1000).toISOString(),
                external_user_id: newExternalUserId?.toString(),
                external_status: 'active',
                is_locked: false // Desbloquear al finalizar
              })
              .eq('id', cred.id)
            if (updateError) throw updateError
            renewed = true;
          }

          if (renewed) {
            renewalResults.push({ id: cred.id, api_name: cred.api_name, status: 'renewed' });
            await logApiAction('info', 'token_refresh_success', cred.id, cred.account_id, { message: 'Token renovado exitosamente.' });
          }
        } else {
            renewalResults.push({ id: cred.id, api_name: cred.api_name, status: 'no_renewal_needed' });
            await logApiAction('info', 'token_refresh_no_need', cred.id, cred.account_id, { message: 'No se requiere renovación.' });
        }
      } catch (error) {
        console.error(`Error renovando ${cred.api_name} para credencial ${cred.id}:`, error.message);
        renewalResults.push({ id: cred.id, api_name: cred.api_name, status: 'failed', error: error.message });
        await logApiAction('error', 'token_refresh_failed', cred.id, cred.account_id, { error: error.message });
      } finally {
        if (locked) { // Asegurarse de desbloquear siempre
          await supabaseClient.rpc('unlock_credential', { p_credential_id: cred.id })
            .catch(err => console.error(`Error al desbloquear credencial ${cred.id}:`, err.message));
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, renewalResults }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error general en Token Refresher:', error.message);
    await logApiAction('error', 'token_refresher_general_failure', 'N/A', accountId, { error: error.message });
    return new Response(
      JSON.stringify({ success: false, message: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

// Función helper para renovar tokens de Mercado Pago
async function refreshMercadoPagoToken(clientId: string, clientSecret: string, refreshToken: string) {
  const response = await fetch('https://api.mercadopago.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  const mpData = await response.json()

  if (!response.ok) {
    console.error('MP Refresh Error:', mpData)
    throw new Error(mpData.message || 'Error al renovar token con Mercado Pago.')
  }

  return {
    newAccessToken: mpData.access_token,
    newRefreshToken: mpData.refresh_token,
    newExpiresIn: mpData.expires_in,
    newExternalUserId: mpData.user_id,
  }
}
