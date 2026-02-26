import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

/**
 * CONFIGURACIÓN DE HEADERS CORS
 * Permite la invocación segura desde el frontend en desarrollo y producción.
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/**
 * EDGE FUNCTION: oauth-handler
 * Encargada del intercambio de tokens OAuth para Mercado Pago.
 * Implementa trazabilidad total y protección contra doble ejecución.
 */
serve(async (req) => {
  // Manejo inmediato de peticiones preflight OPTIONS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Identificadores para logs y auditoría
  let credentialIdToLog: string | undefined;
  let accountIdToLog: string | undefined;
  let correlationId = crypto.randomUUID();

  console.log(`[${correlationId}] --- INICIANDO PROCESO DE VINCULACIÓN OAUTH ---`);

  try {
    // 1. Inicialización del cliente de Supabase con Service Role para evadir RLS de sistema
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const requestBody = await req.json();
    const { code, credentialId } = requestBody;
    credentialIdToLog = credentialId;

    if (!code || !credentialId) {
      throw new Error('Parámetros requeridos faltantes (code o credentialId).');
    }

    console.log(`[${correlationId}] Buscando secretos para la credencial: ${credentialId}`);

    // 2. Recuperación de secretos desencriptados mediante RPC segura
    const { data: cred, error: dbError } = await supabaseClient
      .rpc('get_credential_by_id', { p_credential_id: credentialId })
      .single()

    if (dbError || !cred) {
      throw new Error(`No se pudo recuperar la configuración de la credencial: ${dbError?.message || 'No encontrada'}`);
    }
    
    accountIdToLog = cred.account_id;

    // --- PROTECCIÓN CONTRA DOBLE LOG (Idempotencia) ---
    // Si la credencial ya tiene un access_token y fue actualizada hace menos de 5 segundos, 
    // asumimos que es una petición duplicada por el StrictMode de React.
    const lastUpdate = new Date(cred.updated_at).getTime();
    const now = new Date().getTime();
    if (cred.access_token && (now - lastUpdate < 5000)) {
        console.warn(`[${correlationId}] Detectada posible petición duplicada. Retornando éxito sin repetir proceso.`);
        return new Response(JSON.stringify({ success: true, message: 'Ya procesado.' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    const redirectUri = `${Deno.env.get('APP_URL') || 'http://localhost:5173'}/oauth/callback`;

    // 3. Preparación de la llamada a la API de Mercado Pago
    const mpTokenExchangeUrl = 'https://api.mercadopago.com/oauth/token';
    const mpParams = new URLSearchParams({
      client_id: cred.client_id,
      client_secret: cred.client_secret,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri,
    });

    console.log(`[${correlationId}] Ejecutando intercambio de tokens en Mercado Pago...`);

    const response = await fetch(mpTokenExchangeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: mpParams,
    });

    const mpData = await response.json();

    if (!response.ok) {
      console.error(`[${correlationId}] Error en API de Mercado Pago:`, mpData);
      throw new Error(mpData.message || 'Fallo en la comunicación con Mercado Pago.');
    }

    console.log(`[${correlationId}] Tokens recibidos exitosamente. Actualizando base de datos...`);

    // 4. Persistencia de tokens y actualización de estado
    // El trigger handle_token_encryption en la DB encriptará los tokens automáticamente.
    const { error: updateError } = await supabaseClient
      .schema('core')
      .from('business_credentials')
      .update({
        access_token: mpData.access_token,
        refresh_token: mpData.refresh_token,
        external_user_id: mpData.user_id?.toString(),
        expires_at: new Date(Date.now() + mpData.expires_in * 1000).toISOString(),
        external_status: 'active',
        is_deleted: false
      })
      .eq('id', credentialId);

    if (updateError) {
        throw new Error(`Error al persistir tokens en la base de datos: ${updateError.message}`);
    }

    // 5. Registro de Auditoría (ÉXITO) - ISO 9000
    // Registramos la operación para trazabilidad completa.
    const { error: logError } = await supabaseClient
      .schema('logs')
      .from('api_logs')
      .insert({
        account_id: accountIdToLog,
        api_name: 'MERCADOPAGO',
        endpoint: mpTokenExchangeUrl,
        operation_name: 'oauth_token_exchange',
        correlation_id: correlationId,
        request_payload: { client_id: cred.client_id, redirect_uri: redirectUri }, // Masked code
        response_payload: { user_id: mpData.user_id, expires_in: mpData.expires_in },
        status: 'SUCCESS'
      });

    if (logError) console.error(`[${correlationId}] Error al guardar log de auditoría:`, logError);

    console.log(`[${correlationId}] --- PROCESO COMPLETADO CON ÉXITO ---`);

    return new Response(
      JSON.stringify({ success: true, message: 'Mercado Pago vinculado correctamente.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error(`[${correlationId}] ERROR CRÍTICO:`, error.message);
    
    // 6. Registro de Auditoría (FALLO)
    // Intentamos registrar el error incluso si el flujo principal falló.
    try {
      const supabaseErrorLog = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      
      await supabaseErrorLog
        .schema('logs')
        .from('api_logs')
        .insert({
          account_id: accountIdToLog || null,
          api_name: 'MERCADOPAGO',
          operation_name: 'oauth_token_exchange_failed',
          correlation_id: correlationId,
          request_payload: { error: 'Exchange process interrupted' },
          response_payload: { message: error.message },
          status: 'FAILED'
        });
    } catch (logErr) {
      console.error(`[${correlationId}] Incapaz de registrar fallo en api_logs:`, logErr.message);
    }

    return new Response(
      JSON.stringify({ success: false, message: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
