import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { businessId, tnOrderId } = await req.json()
    if (!businessId || !tnOrderId) throw new Error('businessId y tnOrderId son requeridos.')

    // 1. Obtener Store ID del negocio
    const { data: creds } = await supabaseClient
      .schema('core')
      .rpc('get_business_credentials', { 
        p_business_id: businessId, 
        p_api_name: 'TIENDANUBE' 
      })
    
    const cred = creds?.[0]
    if (!cred) throw new Error('Credenciales no encontradas para este negocio.')

    const storeId = cred.external_user_id

    // 2. Inyectar en la cola de Webhooks
    // Simulamos un evento de creación para que el procesador lo tome
    const { error: insertError } = await supabaseClient
      .schema('logs')
      .from('tiendanube_webhook_queue')
      .insert({
        event_type: 'order/created',
        store_id: storeId,
        resource_id: tnOrderId.toString(),
        payload: { 
            store_id: parseInt(storeId), 
            id: parseInt(tnOrderId), 
            event: 'order/created',
            is_forced: true 
        },
        status: 'PENDING'
      });

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ 
        success: true, 
        message: "Orden encolada para procesamiento." 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error("Error en tn-force-sync-order:", error.message);
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
