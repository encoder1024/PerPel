import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-calcom-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const mapEventToStatus = (event: string) => {
  switch (event) {
    case "BOOKING_CREATED":
      return "SCHEDULED";
    case "BOOKING_RESCHEDULED":
      return "RESCHEDULED";
    case "BOOKING_CANCELLED":
      return "CANCELLED";
    case "BOOKING_NO_SHOW":
      return "NO_SHOW";
    default:
      return "PENDING";
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  let requestBody;
  let responseBody = { status: "OK" };
  let correlationId = crypto.randomUUID();

  try {
    // Validación simple de secreto compartido (si existe)
    const webhookSecret = Deno.env.get("CALCOM_WEBHOOK_SECRET");
    if (webhookSecret) {
      const incomingSecret = req.headers.get("x-calcom-secret");
      if (incomingSecret !== webhookSecret) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    requestBody = await req.json();
    const { triggerEvent, payload } = requestBody;

    const calId = payload?.id?.toString();
    if (!calId) throw new Error("Cal.com payload sin id.");

    const status = mapEventToStatus(triggerEvent);

    const startTime = payload?.startTime;
    const endTime = payload?.endTime;
    const metadata = payload?.metadata || {};
    const businessId = metadata?.business_id;
    const supabaseUserId = metadata?.supabase_user_id || null;

    if (!businessId) throw new Error("metadata.business_id requerido.");

    // Obtener account_id si no viene en metadata
    let accountId = metadata?.account_id;
    if (!accountId && supabaseUserId) {
      const { data: profile } = await supabase
        .from("user_profiles", { schema: "core" })
        .select("account_id")
        .eq("id", supabaseUserId)
        .single();
      accountId = profile?.account_id;
    }
    if (!accountId) {
      const { data: biz } = await supabase
        .from("businesses", { schema: "core" })
        .select("account_id")
        .eq("id", businessId)
        .single();
      accountId = biz?.account_id;
    }
    if (!accountId) throw new Error("No se pudo resolver account_id.");

    // Upsert appointments
    const appointmentRow = {
      account_id: accountId,
      business_id: businessId,
      external_cal_id: calId,
      start_time: startTime,
      end_time: endTime,
      status,
      client_id: supabaseUserId,
      employee_id: payload?.organizer?.id || null,
      service_id: metadata?.service_id || null,
      cancel_reason: payload?.reason || null,
      is_deleted: false,
    };

    const { error: apptError } = await supabase
      .from("appointments", { schema: "core" })
      .upsert(appointmentRow, { onConflict: "account_id,external_cal_id" });

    if (apptError) throw apptError;

    // 2. Log Detailed Cal.com Webhook (Punto 8 de la estrategia)
    await supabase.from("api_logs", { schema: "logs" }).insert({
      api_name: "CAL_COM",
      endpoint: "/webhook",
      operation_name: triggerEvent || "WEBHOOK_RECEIVED",
      correlation_id: correlationId,
      request_payload: requestBody,
      response_payload: responseBody,
      status: "SUCCESS",
      account_id: accountId,
    });

    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Cal.com Webhook Error:", error.message);
    
    await supabase.from("api_logs", { schema: "logs" }).insert({
      api_name: "CAL_COM",
      operation_name: "WEBHOOK_ERROR",
      correlation_id: correlationId,
      request_payload: requestBody,
      response_payload: { error: error.message },
      status: "ERROR",
    });

    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
