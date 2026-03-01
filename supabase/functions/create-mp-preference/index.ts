import { serve } from "https://deno.land/std@0.131.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.1";

const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN");

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  let requestBody;
  let responseBody;
  let status = "SUCCESS";
  let correlationId = crypto.randomUUID();

  try {
    requestBody = await req.json();
    const { orderId } = requestBody;

    // 1. Fetch Order and its Items Details from Supabase
    const { data: order, error: orderError } = await supabase
      .schema('core')
      .from('orders')
      .select(`
        *,
        order_items (
          quantity,
          unit_price,
          inventory_items (name)
        )
      `)
      .eq('id', orderId)
      .single();

    if (orderError) throw orderError;

    // Map items for Mercado Pago format
    const mpItems = order.order_items.map((oi: any) => ({
      title: oi.inventory_items.name,
      unit_price: Number(oi.unit_price),
      quantity: Number(oi.quantity),
      currency_id: order.currency || 'ARS'
    }));

    // 2. Call MercadoPago API to create Preference
    const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: mpItems,
        external_reference: orderId,
        back_urls: {
          success: "https://app.perpel.com/success",
          failure: "https://app.perpel.com/failure",
        },
        auto_return: "approved",
      }),
    });

    responseBody = await mpResponse.json();

    if (!mpResponse.ok) {
      status = "FAILED";
      throw new Error(JSON.stringify(responseBody));
    }

    // 3. Update Order with Preference ID
    await supabase
      .from('orders')
      .update({ mercadopago_preference_id: responseBody.id })
      .eq('id', orderId);

    // 4. Record Detailed API Log (Punto 8 de la estrategia)
    await supabase.from('api_logs', { schema: 'logs' }).insert({
      account_id: order.account_id,
      api_name: 'MERCADOPAGO',
      endpoint: '/checkout/preferences',
      order_id: orderId,
      operation_name: 'CREATE_PREFERENCE',
      correlation_id: correlationId,
      request_payload: requestBody,
      response_payload: responseBody,
      status: status
    });

    return new Response(JSON.stringify({ preferenceId: responseBody.id }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error(error);
    // Log failure
    await supabase.from('api_logs', { schema: 'logs' }).insert({
      api_name: 'MERCADOPAGO',
      operation_name: 'CREATE_PREFERENCE',
      correlation_id: correlationId,
      request_payload: requestBody,
      response_payload: { error: error.message },
      status: "ERROR"
    });

    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
