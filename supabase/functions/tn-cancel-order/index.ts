import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Manejo de CORS
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const correlationId = crypto.randomUUID();

  try {
    const { orderId } = await req.json()
    if (!orderId) throw new Error('El orderId es requerido.')

    console.log(`[${correlationId}] Iniciando cancelación en Tiendanube para la orden interna: ${orderId}`);

    // 1. Obtener la referencia externa y el negocio de la orden
    const { data: order, error: orderError } = await supabaseClient
      .schema('core')
      .from('orders')
      .select('external_reference, business_id, account_id')
      .eq('id', orderId)
      .eq('origin', 'TIENDANUBE')
      .single()

    if (orderError || !order) {
        console.log(`[${correlationId}] La orden no existe o no es de Tiendanube. Omitiendo notificación externa.`);
        return new Response(JSON.stringify({ 
            success: true, 
            message: 'Orden no requiere cancelación en Tiendanube.' 
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    const tnOrderId = order.external_reference;
    if (!tnOrderId) throw new Error('La orden no tiene una referencia externa de Tiendanube.');

    // 2. Obtener Credenciales del Negocio
    const { data: creds, error: credError } = await supabaseClient
      .schema('core')
      .rpc('get_business_credentials', { 
        p_business_id: order.business_id, 
        p_api_name: 'TIENDANUBE' 
      })
    
    const cred = creds?.[0]
    if (credError || !cred) throw new Error('No se encontraron credenciales de Tiendanube para este negocio.');

    const storeId = cred.external_user_id;
    const accessToken = cred.access_token;

    // 3. Llamada a la API de Tiendanube para cancelar la orden
    const url = `https://api.tiendanube.com/v1/${storeId}/orders/${tnOrderId}/cancel`
    
    // Tiendanube requiere un 'reason' en el cuerpo para el endpoint /cancel
    // Los motivos válidos suelen ser: 'customer', 'fraud', 'inventory', 'other'
    const cancelPayload = {
        reason: 'other'
    };

    console.log(`[${correlationId}] Llamando a Tiendanube API: ${url} con motivo: ${cancelPayload.reason}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authentication': `bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'AppPerPel (soporte@perpel.com)'
      },
      body: JSON.stringify(cancelPayload) // Enviamos el motivo requerido
    })

    const resultData = await response.json()

    // 4. Auditoría ISO 9000
    await supabaseClient.schema('logs').from('api_logs').insert({
      account_id: order.account_id,
      api_name: 'TIENDANUBE',
      operation_name: 'cancel_order',
      order_id: orderId,
      status: response.ok ? 'SUCCESS' : 'FAILED',
      request_payload: { orderId, tnOrderId, storeId, payload: cancelPayload },
      response_payload: resultData
    })

    if (!response.ok) {
        console.error(`[${correlationId}] Error de Tiendanube:`, JSON.stringify(resultData));
        throw new Error(`Tiendanube API Error: ${resultData.message || response.statusText}`);
    }

    console.log(`[${correlationId}] Orden cancelada con éxito en Tiendanube.`);

    return new Response(JSON.stringify({ 
        success: true, 
        message: 'Orden cancelada correctamente en Tiendanube.',
        tn_response: resultData
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error(`[${correlationId}] ERROR en tn-cancel-order: ${error.message}`);
    return new Response(JSON.stringify({ 
        success: false, 
        message: error.message 
    }), {
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
