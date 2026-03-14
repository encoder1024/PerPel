import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, supabaseService);

  const correlationId = crypto.randomUUID();
  console.log(`[${correlationId}] >>> INICIANDO CANCELACIÓN DE TURNO (v1)`);

  try {
    const { appointmentId, external_booking_id, reason } = await req.json();

    if (!appointmentId || !external_booking_id) {
      throw new Error("appointmentId y external_booking_id son requeridos.");
    }

    // 1. Obtener la cita
    const { data: appt, error: apptError } = await supabase
      .schema("core")
      .from("appointments")
      .select("business_id, account_id")
      .eq("id", appointmentId)
      .single();

    if (apptError || !appt) throw new Error("Cita no encontrada.");

    // 2. Obtener Credenciales de Cal.com (incluyendo API Key guardada en external_user_id)
    const { data: creds, error: credError } = await supabase
      .schema("core")
      .rpc("get_business_credentials", { 
        p_business_id: appt.business_id, 
        p_api_name: "CAL_COM" 
      });

    // 2. Usamos la API Key hardcodeada para la prueba de descarte
    const apiKey = "cal_live_39e444ef0b8be8b391b46614c83bce3b";

    // 3. Llamar a la API de Cal.com v1 usando apiKey como parámetro
    const cancelReason = reason || "Cancelado desde ERP PerPel";
    const cancelUrl = new URL(`https://api.cal.com/v1/bookings/${external_booking_id}/cancel`);
    cancelUrl.searchParams.set("apiKey", apiKey);
    cancelUrl.searchParams.set("cancellationReason", cancelReason);
    
    console.log(`[${correlationId}] Invocando DELETE en Cal.com v1 con API Key.`);

    const response = await fetch(cancelUrl.toString(), {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "AppPerPel (soporte@perpel.com)"
      }
    });

    const responseText = await response.text();
    let apiData;
    try {
        apiData = JSON.parse(responseText);
    } catch (e) {
        apiData = { raw: responseText };
    }

    console.log(`[${correlationId}] Respuesta Cal.com (Status ${response.status}):`, JSON.stringify(apiData));

    if (!response.ok) {
        return new Response(JSON.stringify({ 
            success: false, 
            message: "Error en API Cal.com al cancelar (v1)", 
            status: response.status,
            api_response: apiData 
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    // 4. Actualizar estado local
    const { error: updateError } = await supabase
      .schema("core")
      .from("appointments")
      .update({ status: "CANCELLED", cancel_reason: cancelReason })
      .eq("id", appointmentId);

    if (updateError) throw updateError;

    return new Response(JSON.stringify({ success: true, message: "Turno cancelado con éxito en Cal.com (v1) y ERP" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error(`[${correlationId}] ERROR:`, error.message);
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
