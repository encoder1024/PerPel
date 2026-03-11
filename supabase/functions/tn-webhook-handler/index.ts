import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import * as crypto from "https://deno.land/std@0.177.0/node/crypto.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function validateSignature(body: string, signature: string, secret: string) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(body);
  const hash = hmac.digest('hex');
  return hash === signature;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Recepción rápida
    const eventType = req.headers.get('x-linkedstore-event')
    const signature = req.headers.get('x-linkedstore-signature')
    const bodyText = await req.text()
    const webhookSecret = Deno.env.get('TIENDANUBE_WEBHOOK_SECRET')

    // 2. Validación de firma (Opcional pero recomendado para seguridad inmediata)
    if (webhookSecret && signature) {
        const isValid = await validateSignature(bodyText, signature, webhookSecret)
        if (!isValid) throw new Error('Firma inválida.')
    }

    const payload = JSON.parse(bodyText)
    const storeId = payload.store_id

    // 3. Persistir en la cola y terminar inmediatamente
    const { error } = await supabaseClient
      .schema('logs')
      .from('tiendanube_webhook_queue')
      .insert({
        event_type: eventType,
        store_id: storeId?.toString(),
        payload: payload,
        status: 'PENDING'
      })

    if (error) throw error

    console.log(`Webhook ${eventType} encolado exitosamente para Store ${storeId}`);

    // RESPUESTA INMEDIATA A TIENDANUBE (Evita timeouts)
    return new Response(JSON.stringify({ success: true, message: 'Enqueued' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (error) {
    console.error(`Error crítico en Receptor Webhook TN: ${error.message}`);
    // Respondemos 200 de todas formas para que TN no reintente si es un error de nuestro lado
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })
  }
})
