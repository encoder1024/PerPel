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

const allowedEvents = new Set([
  "BOOKING_CREATED",
  "BOOKING_RESCHEDULED",
  "BOOKING_CANCELLED",
  "BOOKING_NO_SHOW",
]);

const isUuid = (value: unknown) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  let requestBody;
  let rawBody = "";
  let responseBody = { status: "OK" };
  let correlationId = crypto.randomUUID();

  try {
    rawBody = await req.text();
    requestBody = rawBody ? JSON.parse(rawBody) : {};
    const { triggerEvent, payload, attendees } = requestBody ?? {};

    const cleanId = (value: unknown) =>
      value !== null && value !== undefined
        ? value.toString().trim()
        : undefined;
    const calId = cleanId(payload?.uid);
    const bookingId = cleanId(payload?.bookingId);

    if (!calId) {
      // Cal.com ping/test suele no traer id
      await supabase.schema("logs").from("api_logs").insert({
        api_name: "CAL_COM",
        endpoint: "/webhook",
        operation_name: "WEBHOOK_PING",
        correlation_id: correlationId,
        request_payload: requestBody,
        response_payload: { status: "PING_OK" },
        status: "SUCCESS",
      });
      return new Response(JSON.stringify({ status: "PING_OK" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validación HMAC (recomendada) con fallback a header custom
    const webhookSecret = Deno.env.get("CAL_WEBHOOK_SECRET");
    if (webhookSecret) {
      const incomingSignature = req.headers.get("x-cal-signature-256");
      let signatureOk = false;

      if (incomingSignature && rawBody) {
        const key = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(webhookSecret),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"]
        );
        const sigBuf = await crypto.subtle.sign(
          "HMAC",
          key,
          new TextEncoder().encode(rawBody)
        );
        const sigHex = Array.from(new Uint8Array(sigBuf))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        signatureOk = sigHex === incomingSignature;
      }

      if (!signatureOk) {
        const incomingSecret =
          req.headers.get("x-calcom-secret") || req.headers.get("x-cal-secret");
        if (incomingSecret !== webhookSecret) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    if (!triggerEvent || !allowedEvents.has(triggerEvent)) {
      return new Response(JSON.stringify({ error: "triggerEvent invalido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!payload) {
      return new Response(JSON.stringify({ error: "payload requerido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const status = mapEventToStatus(triggerEvent);

    const startTime = payload?.startTime;
    const endTime = payload?.endTime;
    const metadata = payload?.metadata || {};
    let businessId = metadata?.business_id;
    const supabaseUserId = metadata?.supabase_user_id || null;
    const serviceId = metadata?.service_id || null;

    if (!businessId && payload?.type) {
      const typeAsId = payload.type.toString();
      const { data: bizByType } = await supabase
        .schema("core")
        .from("businesses")
        .select("id")
        .eq("id", typeAsId)
        .maybeSingle();
      if (bizByType?.id) {
        businessId = bizByType.id;
      }
    }

    if (!businessId) throw new Error("metadata.business_id requerido.");
    if (!startTime || !endTime) throw new Error("startTime/endTime requeridos.");

    // Obtener account_id si no viene en metadata
    let accountId = metadata?.account_id;
    if (!accountId && supabaseUserId) {
      const { data: profile } = await supabase
        .schema("core")
        .from("user_profiles")
        .select("account_id")
        .eq("id", supabaseUserId)
        .single();
      accountId = profile?.account_id;
    }
    if (!accountId) {
      const { data: biz } = await supabase
        .schema("core")
        .from("businesses")
        .select("account_id")
        .eq("id", businessId)
        .single();
      accountId = biz?.account_id;
    }
    if (!accountId) throw new Error("No se pudo resolver account_id.");

    // Upsert appointments (manual, because unique index is partial)
    const organizerId = payload?.organizer?.id?.toString?.() ?? null;
    const employeeId = isUuid(organizerId) ? organizerId : null;

    const appointmentRow = {
      account_id: accountId,
      business_id: businessId,
      external_cal_id: calId,
      external_booking_id: bookingId,
      start_time: startTime,
      end_time: endTime,
      status,
      client_id: supabaseUserId,
      employee_id: employeeId,
      service_id: serviceId,
      cancel_reason: payload?.reason || null,
      is_deleted: false,
      client_name: attendees?.name || null,
      client_email: attendees?.email || null,
      client_phone: attendees?.phoneNumber || null,
    };

    const { data: existing, error: existingError } = await supabase
      .schema("core")
      .from("appointments")
      .select("id")
      .eq("account_id", accountId)
      .eq("external_cal_id", calId)
      .eq("is_deleted", false)
      .maybeSingle();

    if (existingError) throw existingError;

    let apptError;
    if (existing?.id) {
      const { error } = await supabase
        .schema("core")
        .from("appointments")
        .update(appointmentRow)
        .eq("id", existing.id);
      apptError = error;
    } else {
      const { error } = await supabase
        .schema("core")
        .from("appointments")
        .insert(appointmentRow);
      apptError = error;
    }

    if (apptError) throw apptError;

    await supabase.schema("logs").from("api_logs").insert({
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

    await supabase.schema("logs").from("api_logs").insert({
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
