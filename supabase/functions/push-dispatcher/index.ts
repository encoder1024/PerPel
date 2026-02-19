import { serve } from "https://deno.land/std@0.131.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.1";

const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID");
const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY");

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  let requestBody;
  let responseBody;
  let correlationId = crypto.randomUUID();
  let accountId = null;

  try {
    requestBody = await req.json();
    const { title, message, userId, segment, data, sendAfter } = requestBody;

    // 1. Get User Details
    let include_player_ids = [];
    if (userId) {
      const { data: userProfile, error } = await supabase
        .from('user_profiles', { schema: 'core' })
        .select('onesignal_id, account_id')
        .eq('id', userId)
        .single();

      if (error || !userProfile?.onesignal_id) {
        throw new Error("User not found or has no OneSignal ID");
      }
      include_player_ids = [userProfile.onesignal_id];
      accountId = userProfile.account_id;
    }

    // 2. Prepare Payload
    const notificationPayload = {
      app_id: ONESIGNAL_APP_ID,
      contents: { en: message, es: message },
      headings: { en: title, es: title },
      data: data || {},
      send_after: sendAfter || undefined,
      ...(segment ? { included_segments: [segment] } : { include_player_ids }),
    };

    // 3. OneSignal Call
    const response = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": `Basic ${ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify(notificationPayload),
    });

    responseBody = await response.json();

    // 4. Log to api_logs
    await supabase.from('api_logs', { schema: 'logs' }).insert({
      account_id: accountId,
      api_name: 'ONESIGNAL',
      endpoint: '/notifications',
      operation_name: 'PUSH_DISPATCHER',
      correlation_id: correlationId,
      request_payload: requestBody,
      response_payload: responseBody,
      status: response.ok ? "SUCCESS" : "FAILED"
    });

    return new Response(JSON.stringify(responseBody), { status: 200 });

  } catch (error) {
    await supabase.from('api_logs', { schema: 'logs' }).insert({
      api_name: 'ONESIGNAL',
      operation_name: 'PUSH_DISPATCHER',
      correlation_id: correlationId,
      request_payload: requestBody,
      response_payload: { error: error.message },
      status: "ERROR"
    });

    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
