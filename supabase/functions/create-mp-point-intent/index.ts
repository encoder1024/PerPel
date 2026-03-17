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

  const correlationId = crypto.randomUUID();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const { orderId, deviceId } = await req.json();
    console.log(`[${correlationId}] Iniciando cobro. Order: ${orderId}, UUID Device: ${deviceId}`);

    if (!MP_ACCESS_TOKEN) {
      throw new Error("La variable de entorno MP_ACCESS_TOKEN no está configurada en Supabase.");
    }

    // 1. Obtener ID Físico del Point
    const { data: device, error: devError } = await supabase
      .schema("core")
      .from("point_devices")
      .select("mp_device_id, account_id")
      .eq("id", deviceId)
      .single();

    if (devError || !device?.mp_device_id) {
      throw new Error(`No se encontró el mp_device_id para el UUID ${deviceId}. Verifica que el dispositivo esté registrado correctamente.`);
    }

    const physicalId = device.mp_device_id.trim();
    console.log(`[${correlationId}] ID Físico resuelto: "${physicalId}"`);

    // 2. Obtener datos de la Orden
    const { data: order, error: ordError } = await supabase
      .schema("core")
      .from("orders")
      .select("total_amount, account_id")
      .eq("id", orderId)
      .single();

    if (ordError || !order) {
      throw new Error(`No se pudo encontrar la orden ${orderId}.`);
    }

    // 3. Payload para MercadoPago (Formato ESTRICTO de Point Integrated)
    const payload = {
      amount: Math.round(order.total_amount * 100) / 100,
      additional_info: {
        external_reference: orderId,
        print_on_terminal: true
      }
    };

    // 4. Llamada a MercadoPago (Endpoint CORRECTO de Point Integrated)
    const targetUrl = `https://api.mercadopago.com/point/integration-api/devices/${physicalId}/payment-intents`;
    console.log(`[${correlationId}] Llamando a MP API: ${targetUrl}`);
    
    const mpRes = await fetch(`https://api.mercadopago.com/point/integration-api/devices/${physicalId}/payment-intents`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": correlationId // Requisito para evitar duplicados
      },
      body: JSON.stringify(payload)
    });

    const mpData = await mpRes.json();

    // 5. Intento de logueo (si falla no detiene el proceso)
    try {
      await supabase.schema("logs").from("api_logs").insert({
        account_id: order.account_id,
        api_name: "MERCADOPAGO",
        operation_name: "POINT_INTENT",
        status: mpRes.ok ? "SUCCESS" : "ERROR",
        request_payload: { orderId, physicalId },
        response_payload: mpData,
        correlation_id: correlationId
      });
    } catch (logErr) {
      console.error("Error guardando log (no crítico):", logErr.message);
    }

    if (!mpRes.ok) {
      throw new Error(`MercadoPago Error: ${JSON.stringify(mpData)}`);
    }

    return new Response(JSON.stringify({ success: true, intentId: mpData.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error(`[${correlationId}] Error:`, err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
