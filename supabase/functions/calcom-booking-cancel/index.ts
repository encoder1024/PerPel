import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const adminClient = createClient(supabaseUrl, supabaseService, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let correlationId = crypto.randomUUID();
  let accountId: string | null = null;
  let appointmentId: string | null = null;

  try {
    const { appointmentId: apptId, reason, userAccessToken } = await req.json();
    appointmentId = apptId;
    if (!appointmentId) throw new Error("appointmentId requerido");
    if (!userAccessToken) throw new Error("userAccessToken requerido");

    const { data: userData, error: userError } =
      await adminClient.auth.getUser(userAccessToken);
    if (userError || !userData?.user) throw new Error("Unauthorized");

    const { data: profile, error: profileError } = await adminClient
      .schema("core")
      .from("user_profiles")
      .select("id, account_id, app_role")
      .eq("id", userData.user.id)
      .single();
    if (profileError || !profile?.account_id) {
      throw new Error("Cuenta no encontrada.");
    }
    accountId = profile.account_id;

    const { data: appt, error: apptError } = await adminClient
      .schema("core")
      .from("appointments")
      .select("id, account_id, business_id, external_cal_id, status")
      .eq("id", appointmentId)
      .eq("is_deleted", false)
      .single();
    if (apptError || !appt) throw new Error("Turno no encontrado");
    if (appt.account_id !== accountId) throw new Error("Cuenta no autorizada");

    if (profile.app_role === "EMPLOYEE") {
      const { data: assignment, error: assignError } = await adminClient
        .schema("core")
        .from("employee_assignments")
        .select("business_id")
        .eq("account_id", accountId)
        .eq("user_id", profile.id)
        .eq("business_id", appt.business_id)
        .eq("is_deleted", false)
        .maybeSingle();
      if (assignError || !assignment) {
        throw new Error("No autorizado para este negocio");
      }
    }

    if (!appt.external_cal_id) {
      throw new Error("Turno sin external_cal_id");
    }

    const { data: assign, error: assignError } = await adminClient
      .schema("core")
      .from("business_asign_credentials")
      .select("credential_id")
      .eq("business_id", appt.business_id)
      .eq("is_deleted", false)
      .limit(1)
      .maybeSingle();
    if (assignError || !assign?.credential_id) {
      throw new Error("Credencial Cal.com no encontrada 1");
    }

    const { data: cred, error: credError } = await adminClient
      .schema("core")
      .rpc("get_credential_by_id", { p_credential_id: assign.credential_id });
    const credRow = Array.isArray(cred) ? cred[0] : cred;
    if (credError || !credRow?.access_token) {
      throw new Error("Credencial Cal.com no encontrada 2");
    }

    const meUrl = "https://api.cal.com/v2/me";
    const bookingUrl = `https://api.cal.com/v2/bookings/${appt.external_cal_id}`;
    const cancelUrl = `https://api.cal.com/v2/bookings/${appt.external_cal_id}/cancel`;
    const cancelReason = reason || "Cancelado desde ERP";
    const clean = (value: unknown) =>
      (value ?? "").toString().replace(/\s+/g, "");
    let accessToken = clean(credRow.access_token);
    const refreshToken = clean(credRow.refresh_token);
    const clientId = clean(credRow.client_id);
    const clientSecret = clean(credRow.client_secret);

    const callMe = async (token: string) => {
      const resp = await fetch(meUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "cal-api-version": "2024-08-13",
          "Authorization": `Bearer ${clean(token)}`,
        },
      });
      const body = await resp.json();
      await adminClient.schema("logs").from("api_logs").insert({
        account_id: accountId,
        api_name: "CAL_COM",
        endpoint: meUrl,
        operation_name: "booking_cancel_me_check",
        correlation_id: correlationId,
        response_payload: { status: resp.status, body },
        status: resp.ok ? "SUCCESS" : "FAILED",
      });
      return { resp, body };
    };

    let meRespResult = await callMe(accessToken);
    if (meRespResult.resp.status === 401) {
      // Attempt token refresh
      const refreshUrl = "https://app.cal.com/api/auth/oauth/refreshToken";
      const refreshResp = await fetch(refreshUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": `Bearer ${refreshToken}`,
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });
      const refreshData = await refreshResp.json();
      await adminClient.schema("logs").from("api_logs").insert({
        account_id: accountId,
        api_name: "CAL_COM",
        endpoint: refreshUrl,
        operation_name: "booking_cancel_token_refresh",
        correlation_id: correlationId,
        response_payload: { status: refreshResp.status, body: refreshData },
        status: refreshResp.ok ? "SUCCESS" : "FAILED",
      });
      if (refreshResp.ok) {
        const { data: encAccess, error: encAccessErr } = await adminClient
          .schema("core")
          .rpc("encrypt_token", {
            plain_text: refreshData.access_token || refreshData.accessToken,
          });
        if (encAccessErr) throw encAccessErr;
        const { data: encRefresh, error: encRefreshErr } = await adminClient
          .schema("core")
          .rpc("encrypt_token", {
            plain_text: refreshData.refresh_token || refreshData.refreshToken,
          });
        if (encRefreshErr) throw encRefreshErr;

        await adminClient
          .schema("core")
          .from("business_credentials")
          .update({
            access_token: encAccess,
            refresh_token: encRefresh,
            expires_at: refreshData.expires_in
              ? new Date(Date.now() + refreshData.expires_in * 1000).toISOString()
              : null,
            external_status: "active",
          })
          .eq("id", assign.credential_id);

        const newAccessToken = clean(
          refreshData.access_token || refreshData.accessToken || ""
        );
        accessToken = newAccessToken;
        meRespResult = await callMe(accessToken);
      } else {
        if (refreshData?.error === "invalid_grant") {
          await adminClient
            .schema("core")
            .from("business_credentials")
            .update({ external_status: "expired" })
            .eq("id", assign.credential_id);
        }
      }
    }

    const bookingResp = await fetch(bookingUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "cal-api-version": "2024-08-13",
        "Authorization": `Bearer ${accessToken}`,
      },
    });
    const bookingData = await bookingResp.json();
    await adminClient.schema("logs").from("api_logs").insert({
      account_id: accountId,
      api_name: "CAL_COM",
      endpoint: bookingUrl,
      operation_name: "booking_cancel_booking_check",
      correlation_id: correlationId,
      response_payload: { status: bookingResp.status, body: bookingData },
      status: bookingResp.ok ? "SUCCESS" : "FAILED",
    });
    const cancelResp = await fetch(cancelUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "cal-api-version": "2024-08-13",
        "Authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ cancellationReason: cancelReason }),
    });
    const cancelData = await cancelResp.json();
    if (!cancelResp.ok) {
      await adminClient.schema("logs").from("api_logs").insert({
        account_id: accountId,
        api_name: "CAL_COM",
        endpoint: cancelUrl,
        operation_name: "booking_cancel_http_error",
        correlation_id: correlationId,
        request_payload: { appointmentId, reason: cancelReason },
        response_payload: { status: cancelResp.status, body: cancelData },
        status: "FAILED",
      });
      throw new Error(
        cancelData?.error?.message || cancelData?.message || "Cancel failed"
      );
    }

    const { error: updateError } = await adminClient
      .schema("core")
      .from("appointments")
      .update({ status: "CANCELLED" })
      .eq("id", appointmentId)
      .eq("account_id", accountId);
    if (updateError) throw updateError;

    await adminClient.schema("logs").from("api_logs").insert({
      account_id: accountId,
      api_name: "CAL_COM",
      endpoint: cancelUrl,
      operation_name: "booking_cancel",
      correlation_id: correlationId,
      request_payload: { appointmentId, reason: cancelReason },
      response_payload: cancelData,
      status: "SUCCESS",
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await adminClient.schema("logs").from("api_logs").insert({
      account_id: accountId,
      api_name: "CAL_COM",
      operation_name: "booking_cancel_failed",
      correlation_id: correlationId,
      request_payload: { appointmentId },
      response_payload: { message },
      status: "FAILED",
    });
    return new Response(JSON.stringify({ success: false, message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
