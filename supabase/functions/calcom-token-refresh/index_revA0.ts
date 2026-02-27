import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const refreshLocks = new Map<string, Promise<Response>>();

const withRefreshLock = async (key: string, fn: () => Promise<Response>) => {
  const existing = refreshLocks.get(key);
  if (existing) {
    const res = await existing;
    return res.clone();
  }
  const promise = (async () => {
    try {
      return await fn();
    } finally {
      refreshLocks.delete(key);
    }
  })();
  refreshLocks.set(key, promise);
  const res = await promise;
  return res.clone();
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  // Solo service role
  if (req.headers.get("Authorization") !== `Bearer ${supabaseService}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseService);

  try {
    const { credentialId, accountId } = await req.json();
    if (!credentialId) {
      throw new Error("credentialId requerido");
    }
    if (!accountId) {
      throw new Error("accountId requerido");
    }

    return await withRefreshLock(credentialId, async () => {
      const { data: cred, error: credError } = await supabase
        .rpc("get_credential_by_id", { p_credential_id: credentialId })
        .maybeSingle();

      if (credError || !cred?.refresh_token) {
        throw new Error("Credencial Cal.com invalida o sin refresh_token");
      }
      if (cred.api_name !== "CAL_COM") {
        throw new Error("Credencial invalida");
      }
      if (cred.account_id !== accountId) {
        throw new Error("Cuenta no autorizada");
      }
      if (!cred.client_id || !cred.client_secret) {
        throw new Error("Credencial Cal.com incompleta");
      }

      const refreshUrl = "https://app.cal.com/api/auth/oauth/refreshToken";
      const response = await fetch(refreshUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": `Bearer ${cred.refresh_token}`,
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: cred.client_id,
          client_secret: cred.client_secret,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Error refresh Cal.com");

      const { data: encAccess, error: encAccessErr } = await supabase
        .rpc("encrypt_token", { plain_text: data.access_token || data.accessToken });
      if (encAccessErr) throw encAccessErr;

      const { data: encRefresh, error: encRefreshErr } = await supabase
        .rpc("encrypt_token", { plain_text: data.refresh_token || data.refreshToken });
      if (encRefreshErr) throw encRefreshErr;

      const { error: updateError } = await supabase
        .schema("core")
        .from("business_credentials")
        .update({
          access_token: encAccess,
          refresh_token: encRefresh,
          expires_at: data.expires_in
            ? new Date(Date.now() + data.expires_in * 1000).toISOString()
            : null,
          external_status: "active",
        })
        .eq("id", cred.id);

      if (updateError) throw updateError;

      await supabase.schema("logs").from("api_logs").insert({
        account_id: cred.account_id,
        api_name: "CAL_COM",
        endpoint: refreshUrl,
        operation_name: "oauth_refresh_success",
        status: "SUCCESS",
        correlation_id: cred.id,
      });

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await supabase.schema("logs").from("api_logs").insert({
      api_name: "CAL_COM",
      operation_name: "oauth_refresh_failed",
      status: "FAILED",
      response_payload: { message },
    });
    return new Response(JSON.stringify({ success: false, message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
