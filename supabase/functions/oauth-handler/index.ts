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

  let credentialIdToLog: string | undefined; // Declaramos aquí para que esté disponible en el catch
  let accountIdToLog: string | undefined;

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const requestBody = await req.json();
    const { code, credentialId } = requestBody;

    credentialIdToLog = credentialId; // Asignamos aquí

    if (!code || !credentialId) {
      throw new Error('Código o ID de credencial faltante.')
    }

    // 1. Obtener los secretos de la base de datos (desencriptados)
    const { data: cred, error: dbError } = await supabaseClient
      .rpc('get_credential_by_id', { p_credential_id: credentialId })
      .single()

    if (dbError || !cred) {
      throw new Error(`Error recuperando secretos: ${dbError?.message || 'No encontrado'}`)
    }
    
    accountIdToLog = cred.account_id; // Asignamos aquí

    // 2. Intercambiar código por Access Token en Mercado Pago
    const mpTokenExchangeUrl = 'https://api.mercadopago.com/oauth/token';
    const mpTokenExchangeBody = new URLSearchParams({
      client_id: cred.client_id,
      client_secret: cred.client_secret,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: `${Deno.env.get('APP_URL') || 'http://localhost:5173'}/oauth/callback`,
    });

    const response = await fetch(mpTokenExchangeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: mpTokenExchangeBody,
    })

    const mpData = await response.json()

    if (!response.ok) {
      console.error('MP Error:', mpData)
      throw new Error(mpData.message || 'Error en el intercambio de tokens con Mercado Pago.')
    }

    // 3. Guardar los nuevos tokens en nuestra base de datos
    // El trigger handle_token_encryption los encriptará automáticamente
    const { error: updateError } = await supabaseClient
      .schema('core')
      .from('business_credentials')
      .update({
        access_token: mpData.access_token,
        refresh_token: mpData.refresh_token,
        external_user_id: mpData.user_id?.toString(),
        expires_at: new Date(Date.now() + mpData.expires_in * 1000).toISOString(),
        external_status: 'active'
      })
      .eq('id', credentialId)

    if (updateError) throw updateError

    // 4. Registrar acción en logs.api_logs
    try {
      const { error: logError } = await supabaseClient
        .schema('logs')
        .from('api_logs')
        .insert({
          account_id: accountIdToLog,
          api_name: 'MERCADOPAGO',
          endpoint: mpTokenExchangeUrl,
          operation_name: 'oauth_token_exchange',
          correlation_id: credentialIdToLog,
          request_payload: { client_id: cred.client_id, code: code, redirect_uri: mpTokenExchangeBody.get('redirect_uri') }, // Incluimos 'code' en el log
          response_payload: { 
            user_id: mpData.user_id, 
            expires_in: mpData.expires_in,
            // access_token: 'ENCRYPTED_IN_DB', // Indicamos que se encriptó en DB
            // refresh_token: 'ENCRYPTED_IN_DB', // Indicamos que se encriptó en DB
          },
          status: 'SUCCESS'
        })
      if (logError) console.error('Error logging API call (SUCCESS):', logError);
      
    } catch (logErr) {
      console.error('Error al registrar API log para OAuth (después de éxito):', logErr.message);
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Cuenta vinculada correctamente.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    // 4. Registrar error en logs.api_logs
    try {
      const errorDetails = error.message || 'Error desconocido.';
      const requestPayload = { 
        code: requestBody?.code || 'N/A', 
        credentialId: credentialIdToLog || 'N/A' 
      };

      const { error: logError } = await supabaseClient
        .schema('logs')
        .from('api_logs')
        .insert({
          account_id: accountIdToLog || null, // Puede ser null si el error ocurrió antes de recuperarlo
          api_name: 'MERCADOPAGO',
          endpoint: 'https://api.mercadopago.com/oauth/token',
          operation_name: 'oauth_token_exchange_failed',
          correlation_id: credentialIdToLog || null,
          request_payload: requestPayload,
          response_payload: { message: errorDetails },
          status: 'FAILED'
        })
      if (logError) console.error('Error logging API call (FAILED):', logError);
    } catch (logErr) {
      console.error('Error al registrar API log (FAILED) para OAuth:', logErr.message);
    }

    return new Response(
      JSON.stringify({ success: false, message: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
