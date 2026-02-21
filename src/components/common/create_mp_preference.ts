import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { items, orderId, payerEmail, accountId } = await req.json();

    // Llamada DIRECTA a la API de Mercado Pago (sin SDK)
    const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get('MP_ACCESS_TOKEN')}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: items.map((it: any) => ({
          title: it.name,
          unit_price: Number(it.selling_price),
          quantity: Number(it.quantity),
          currency_id: 'ARS'
        })),
        payer: { email: payerEmail },
        external_reference: orderId,
        notification_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/mercadopago_webhook?action=webhook`,
        back_urls: {
          success: "https://per-pel.vercel.app/admin/orderSussesPay",
          failure: "https://per-pel.vercel.app/admin/orderFailurePay",
          pending: "https://per-pel.vercel.app/admin/orderPendingPay"
        },
        auto_return: "approved",
      }),
    });

    const preference = await mpResponse.json();

    if (!mpResponse.ok) throw new Error(JSON.stringify(preference));

    // Auditoría
    await supabase.schema('logs').from('api_logs').insert({
      api_name: 'MERCADOPAGO',
      endpoint: 'preference_create_direct',
      request_payload: { orderId, items },
      response_payload: preference,
      status: mpResponse.status,
      order_id: orderId,
      account_id: accountId,
      operation_name: 'MP-Preference'
    });

    return new Response(JSON.stringify({ preferenceId: preference.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
})

