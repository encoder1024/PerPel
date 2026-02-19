import { serve } from "https://deno.land/std@0.131.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.1";

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  let requestBody;
  let responseBody = { status: "OK" };
  let correlationId = crypto.randomUUID();

  try {
    requestBody = await req.json();
    const { triggerEvent, payload } = requestBody;

    // 1. Process Booking Created
    if (triggerEvent === "BOOKING_CREATED") {
      const { startTime, endTime, attendees, metadata, id: calId } = payload;
      const supabaseUserId = metadata?.supabase_user_id;
      const businessId = metadata?.business_id; // Metadata obligatoria en el embed

      // Obtener el account_id si no viene en metadata
      let accountId = metadata?.account_id;
      if (!accountId && supabaseUserId) {
        const { data: profile } = await supabase
          .from('user_profiles', { schema: 'core' })
          .select('account_id')
          .eq('id', supabaseUserId)
          .single();
        accountId = profile?.account_id;
      }

      // Sincronizar con core.appointments (Punto 3 de Cal.com strategy)
      const { error: apptError } = await supabase.from('appointments', { schema: 'core' }).insert({
        account_id: accountId,
        business_id: businessId, // Campo obligatorio
        external_cal_id: calId.toString(),
        start_time: startTime,
        end_time: endTime,
        status: 'SCHEDULED',
        client_id: supabaseUserId || null, 
      });

      if (apptError) throw apptError;
    }

    // 2. Log Detailed Cal.com Webhook (Punto 8 de la estrategia)
    await supabase.from('api_logs', { schema: 'logs' }).insert({
      api_name: 'CAL_COM',
      endpoint: '/webhook',
      operation_name: triggerEvent || 'WEBHOOK_RECEIVED',
      correlation_id: correlationId,
      request_payload: requestBody,
      response_payload: responseBody,
      status: "SUCCESS"
    });

    return new Response(JSON.stringify(responseBody), { status: 200 });

  } catch (error) {
    console.error('Cal.com Webhook Error:', error.message);
    
    await supabase.from('api_logs', { schema: 'logs' }).insert({
      api_name: 'CAL_COM',
      operation_name: 'WEBHOOK_ERROR',
      correlation_id: correlationId,
      request_payload: requestBody,
      response_payload: { error: error.message },
      status: "ERROR"
    });

    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
