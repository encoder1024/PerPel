import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const apiKey = req.headers.get('apikey')
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, message: 'Falta la API Key de Supabase.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const body = await req.json().catch(() => ({}));
    const { storeId, accessToken, accountId } = body;

    if (!storeId || !accessToken) {
      return new Response(
        JSON.stringify({ success: false, message: 'Datos incompletos: storeId y accessToken son requeridos.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Llamada a Tiendanube
    const tnResponse = await fetch(`https://api.tiendanube.com/v1/${storeId}/store`, {
      method: 'GET',
      headers: {
        'Authentication': `bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'AppPerPel (soporte@perpel.com)'
      }
    })

    const tnData = await tnResponse.json()

    // Auditoría ISO 9000 (Corregido el manejo de errores aquí)
    const { error: logDbError } = await supabaseClient.schema('logs').from('api_logs').insert({
      account_id: accountId || null,
      api_name: 'TIENDANUBE',
      operation_name: 'validate_credentials',
      endpoint: `/v1/${storeId}/store`,
      status: tnResponse.ok ? 'SUCCESS' : 'FAILED',
      request_payload: { storeId },
      response_payload: tnResponse.ok ? { store_name: tnData.name } : tnData
    });

    if (logDbError) {
      console.error("Error al guardar log de auditoría:", logDbError.message);
    }

    if (!tnResponse.ok) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: `Tiendanube rechazó la conexión: ${tnData.message || tnResponse.statusText}`,
          error: tnData
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        storeName: tnData.name?.es || tnData.name,
        currency: tnData.main_currency
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error("Error crítico en EF:", error.message);
    return new Response(
      JSON.stringify({ success: false, message: `Error interno del servidor: ${error.message}` }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
