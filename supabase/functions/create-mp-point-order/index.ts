import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const correlationId = crypto.randomUUID();
  const supabase = createClient(
    SUPABASE_URL ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const { orderId, deviceId } = await req.json();
    console.log(`[${correlationId}] Creando Orden Point. Order: ${orderId}, UUID Device: ${deviceId}`);

    if (!MP_ACCESS_TOKEN) {
      throw new Error("La variable de entorno MP_ACCESS_TOKEN no está configurada.");
    }

    // 1. Obtener ID Físico del Point
    const { data: device, error: devError } = await supabase
      .schema("core")
      .from("point_devices")
      .select("mp_device_id, account_id")
      .eq("id", deviceId)
      .single();

    if (devError || !device?.mp_device_id) {
      throw new Error(`No se encontró el dispositivo físico para el ID ${deviceId}.`);
    }

    const physicalId = device.mp_device_id.trim();

    // 2. Obtener datos de la Orden ERP
    const { data: order, error: ordError } = await supabase
      .schema("core")
      .from("orders")
      .select("total_amount, account_id")
      .eq("id", orderId)
      .single();

    if (ordError || !order) {
      throw new Error(`No se pudo encontrar la orden ERP ${orderId}.`);
    }

    // 3. Preparar Payload para /v1/orders (Formato EXACTO según doc técnica)
    const formattedAmount = (Math.round(order.total_amount * 100) / 100).toFixed(2);

    const payload = {
      type: "point",
      external_reference: orderId,
      description: `Venta ERP #${orderId.substring(0, 8)}`,
      expiration_time: "PT15M", // 15 minutos de expiración
      transactions: {
        payments: [
          {
            amount: formattedAmount
          }
        ]
      },
      config: {
        point: {
          terminal_id: physicalId,
          print_on_terminal: "no_ticket"
        }
      }
    };

    // 4. Llamada a MercadoPago (Endpoint /v1/orders)
    console.log(`[${correlationId}] Llamando a MP API: POST /v1/orders para Device: ${physicalId}`);
    
    const mpRes = await fetch("https://api.mercadopago.com/v1/orders", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": correlationId
      },
      body: JSON.stringify(payload)
    });

    const mpData = await mpRes.json();

    // 5. Log de Auditoría
    try {
      await supabase.schema("logs").from("api_logs").insert({
        account_id: order.account_id,
        api_name: "MERCADOPAGO",
        operation_name: "POINT_ORDER_CREATE",
        status: mpRes.ok ? "SUCCESS" : "ERROR",
        request_payload: payload,
        response_payload: mpData,
        correlation_id: correlationId,
        order_id: orderId
      });
    } catch (logErr) {
      console.error("Error guardando log:", logErr.message);
    }

    if (!mpRes.ok) {
      throw new Error(`MercadoPago Error: ${JSON.stringify(mpData)}`);
    }

    return new Response(JSON.stringify({ success: true, mpOrder: mpData }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error(`[${correlationId}] ERROR:`, err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
