import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const correlationId = crypto.randomUUID();
  console.log(`[${correlationId}] >>> RECIBIENDO NOTIFICACIÓN TIENDANUBE`);

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const payloadText = await req.text();
    let payload;
    try {
        payload = JSON.parse(payloadText);
    } catch (e) {
        throw new Error("El cuerpo de la petición no es un JSON válido.");
    }

    // Tiendanube envía: { "store_id": 123, "id": 456, "event": "order/created" }
    // El 'id' es el ID de la Orden (resource_id)
    const eventType = req.headers.get('x-linkedstore-event') || payload.event;
    const storeId = (req.headers.get('x-linkedstore-id') || payload.store_id)?.toString();
    const resourceId = payload.id?.toString();

    console.log(`[${correlationId}] Evento: ${eventType}, Store: ${storeId}, Recurso: ${resourceId}`);

    if (!eventType || !storeId || !resourceId) {
        throw new Error(`Datos insuficientes. E:${eventType} S:${storeId} R:${resourceId}`);
    }

    // 1. DEDUPLICACIÓN PREVENTIVA (Idempotencia en la cola)
    // Si ya existe un webhook PENDING para este mismo recurso y evento, no lo insertamos de nuevo
    const { data: existing } = await supabase
      .schema('logs')
      .from('tiendanube_webhook_queue')
      .select('id')
      .eq('store_id', storeId)
      .eq('event_type', eventType)
      .eq('resource_id', resourceId)
      .eq('status', 'PENDING')
      .maybeSingle();

    if (existing) {
        console.log(`[${correlationId}] Webhook duplicado (ya en cola PENDING). Ignorando inserción.`);
        return new Response(JSON.stringify({ success: true, message: "Duplicate ignored" }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200
        });
    }

    // 2. Insertar en la cola
    const { error: insertError } = await supabase
      .schema('logs')
      .from('tiendanube_webhook_queue')
      .insert({
        event_type: eventType,
        store_id: storeId,
        resource_id: resourceId,
        payload: payload,
        status: 'PENDING'
      });

    if (insertError) throw insertError;

    console.log(`[${correlationId}] Webhook encolado con éxito.`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (error) {
    console.error(`[${correlationId}] ERROR Handler:`, error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200 // Siempre 200 para evitar reintentos infinitos por errores de lógica
    })
  }
})
