import { serve } from "https://deno.land/std@0.131.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.1";

const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN");

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  let requestBody;
  let correlationId = crypto.randomUUID();

  try {
    requestBody = await req.json();
    const { orderId, deviceId } = requestBody;

    if (!orderId || !deviceId) {
      throw new Error("orderId and deviceId are required.");
    }

    // 1. Fetch Order Details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('total_amount, account_id')
      .eq('id', orderId)
      .single();

    if (orderError) throw orderError;

    // 2. Prepare Payment Intent Payload
    const intentPayload = {
      amount: order.total_amount,
      description: `Cobro para la orden #${orderId.substring(0, 8)}`,
      external_reference: orderId,
      payment: {
        type: "in_store",
        installments_cost: "buyer" // Corregido según tu indicación
      }
    };

    // 3. Call MercadoPago Point API
    const mpResponse = await fetch(`https://api.mercadopago.com/point/payment_intents?device_id=${deviceId}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(intentPayload),
    });

    const responseBody = await mpResponse.json();

    // 4. Handle API Response
    if (!mpResponse.ok) {
      // Log failure and throw error
      await supabase.from('api_logs', { schema: 'logs' }).insert({
        account_id: order.account_id,
        api_name: 'MERCADOPAGO',
        endpoint: '/point/payment_intents',
        order_id: orderId,
        operation_name: 'CREATE_POINT_INTENT_FAILED',
        correlation_id: correlationId,
        request_payload: requestBody,
        response_payload: responseBody,
        status: "ERROR"
      });
      throw new Error(`MercadoPago API Error: ${JSON.stringify(responseBody)}`);
    }

    // Log success
    await supabase.from('api_logs', { schema: 'logs' }).insert({
      account_id: order.account_id,
      api_name: 'MERCADOPAGO',
      endpoint: '/point/payment_intents',
      order_id: orderId,
      operation_name: 'CREATE_POINT_INTENT_SUCCESS',
      correlation_id: correlationId,
      request_payload: requestBody,
      response_payload: responseBody,
      status: "SUCCESS"
    });

    return new Response(JSON.stringify({ success: true, intentId: responseBody.id }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Error creating Point Payment Intent:", error.message);
    // General error logging
    await supabase.from('api_logs', { schema: 'logs' }).insert({
      api_name: 'MERCADOPAGO',
      operation_name: 'CREATE_POINT_INTENT_ERROR',
      correlation_id: correlationId,
      request_payload: requestBody,
      response_payload: { error: error.message },
      status: "ERROR"
    });
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
