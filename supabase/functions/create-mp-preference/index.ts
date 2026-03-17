import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  let requestBody;
  const correlationId = crypto.randomUUID();

  try {
    requestBody = await req.json();
    const { orderId } = requestBody;

    // 1. Fetch Order and its Items Details
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

    const responseBody = await mpResponse.json();

    if (!mpResponse.ok) {
      await supabase.from('api_logs', { schema: 'logs' }).insert({
        account_id: order.account_id,
        api_name: 'MERCADOPAGO',
        endpoint: '/checkout/preferences',
        order_id: orderId,
        operation_name: 'CREATE_PREFERENCE_FAILED',
        correlation_id: correlationId,
        request_payload: requestBody,
        response_payload: responseBody,
        status: "FAILED"
      });
      throw new Error(`MercadoPago API Error: ${JSON.stringify(responseBody)}`);
    }

    // 3. Update Order with Preference ID
    await supabase
      .schema('core')
      .from('orders')
      .update({ mercadopago_preference_id: responseBody.id })
      .eq('id', orderId);

    // 4. Record Detailed API Log
    await supabase.from('api_logs', { schema: 'logs' }).insert({
      account_id: order.account_id,
      api_name: 'MERCADOPAGO',
      endpoint: '/checkout/preferences',
      order_id: orderId,
      operation_name: 'CREATE_PREFERENCE_SUCCESS',
      correlation_id: correlationId,
      request_payload: requestBody,
      response_payload: responseBody,
      status: "SUCCESS"
    });

    return new Response(JSON.stringify({ preferenceId: responseBody.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error(error);
    await supabase.from('api_logs', { schema: 'logs' }).insert({
      api_name: 'MERCADOPAGO',
      operation_name: 'CREATE_PREFERENCE_ERROR',
      correlation_id: correlationId,
      request_payload: requestBody,
      response_payload: { error: error.message },
      status: "ERROR"
    });

    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
