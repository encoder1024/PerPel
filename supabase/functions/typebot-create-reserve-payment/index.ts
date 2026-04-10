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
  let rawBody = "";
  const correlationId = crypto.randomUUID();

  try {
    rawBody = await req.text();
    try {
      requestBody = JSON.parse(rawBody);
    } catch (e) {
      console.error("Error parseando JSON:", e.message);
      console.error("Cuerpo recibido:", rawBody);
      throw new Error(`JSON malformado: ${e.message}. Revisa las comas y comillas en el bot.`);
    }

    const { 
      account_id, 
      business_id, 
      total_amount, 
      nombre, 
      email, 
      telefono,
      client_id 
    } = requestBody;

    // 1. Buscar el item de seña por SKU '8000-0001' y business_id
    const { data: item, error: itemError } = await supabase
      .schema('core')
      .from('inventory_items')
      .select('id, name')
      .eq('sku', '8000-0001')
      .eq('account_id', account_id)
      .eq('business_id', business_id)
      .single();

    if (itemError || !item) {
      throw new Error(`Item con SKU 8000-0001 no encontrado para el negocio ${business_id} en la cuenta ${account_id}`);
    }

    // 2. Crear/Actualizar el cliente en core.customers (considerando business_id)
    // Si client_id es 'cliente_bot', generamos uno nuevo o buscamos por email
    const { data: customer, error: customerError } = await supabase
      .schema('core')
      .from('customers')
      .upsert({
        account_id,
        business_id,
        full_name: nombre,
        email: email,
        phone_number: telefono,
        notes: 'Origen: Bot',
        is_deleted: false
      }, { onConflict: 'account_id, email' }) 
      .select()
      .single();

    const finalClientId = customer?.id || null;

    if (customerError) {
        console.warn("Error al gestionar cliente:", customerError.message);
    }

    // 3. Crear la Orden con UUID aleatorio
    const orderId = crypto.randomUUID();
    const { error: orderError } = await supabase
      .schema('core')
      .from('orders')
      .insert({
        id: orderId,
        account_id,
        business_id,
        client_id: finalClientId,
        total_amount: Number(total_amount),
        customer_name: nombre,
        status: 'PENDING',
        origin: 'BOT',
        notes: 'Reserva vía Bot'
      });

    if (orderError) throw orderError;

    // 4. Crear el item de la orden
    const { error: orderItemError } = await supabase
      .schema('core')
      .from('order_items')
      .insert({
        account_id,
        order_id: orderId,
        item_id: item.id,
        quantity: 1,
        unit_price: Number(total_amount)
      });

    if (orderItemError) throw orderItemError;

    // 5. Generar preferencia en MercadoPago
    const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [
          {
            title: item.name || 'Seña de Reserva',
            unit_price: Number(total_amount),
            quantity: 1,
            currency_id: 'ARS'
          }
        ],
        external_reference: orderId,
        back_urls: {
          success: "https://app.perpel.com/success",
          failure: "https://app.perpel.com/failure",
        },
        auto_return: "approved",
      }),
    });

    const preferenceData = await mpResponse.json();

    if (!mpResponse.ok) {
      throw new Error(`MercadoPago API Error: ${JSON.stringify(preferenceData)}`);
    }

    // 6. Actualizar la orden con el preference_id
    await supabase
      .schema('core')
      .from('orders')
      .update({ mercadopago_preference_id: preferenceData.id })
      .eq('id', orderId);

    // 7. Registrar log de éxito
    await supabase.from('api_logs', { schema: 'logs' }).insert({
      account_id,
      api_name: 'MERCADOPAGO',
      endpoint: '/checkout/preferences',
      order_id: orderId,
      operation_name: 'TYPEBOT_RESERVE_SUCCESS',
      correlation_id: correlationId,
      request_payload: requestBody,
      response_payload: preferenceData,
      status: "SUCCESS"
    });

    return new Response(JSON.stringify({ 
      orderId, 
      initPoint: preferenceData.init_point,
      preferenceId: preferenceData.id 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error(error);
    // Registrar log de error si tenemos account_id
    if (requestBody?.account_id) {
        await supabase.from('api_logs', { schema: 'logs' }).insert({
            account_id: requestBody.account_id,
            api_name: 'MERCADOPAGO',
            operation_name: 'TYPEBOT_RESERVE_ERROR',
            correlation_id: correlationId,
            request_payload: requestBody,
            response_payload: { error: error.message },
            status: "ERROR"
        });
    }

    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
