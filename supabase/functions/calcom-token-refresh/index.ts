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

  // MODIFICACIÓN DE SEGURIDAD: Permitir service role O usuario autenticado
  const authHeader = req.headers.get("Authorization") ?? "";
  const isServiceRole = authHeader === `Bearer ${supabaseService}`;
  
  const supabase = createClient(supabaseUrl, supabaseService);

  // Si no es service role, validamos el JWT del usuario
  if (!isServiceRole) {
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, message: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  try {
    const { credentialId, accountId } = await req.json();
    if (!credentialId) {
      throw new Error("credentialId requerido");
    }

    return await withRefreshLock(credentialId, async () => {
      const { data: cred, error: credError } = await supabase
        .schema("core")
        .rpc("get_credential_by_id", { p_credential_id: credentialId })
        .maybeSingle();

      if (credError || !cred?.refresh_token) {
        throw new Error("Credencial Cal.com invalida o sin refresh_token");
      }
      
      // Validar que el usuario (si no es service role) pertenece a la cuenta
      if (!isServiceRole && accountId && cred.account_id !== accountId) {
        throw new Error("Cuenta no autorizada");
      }

      const refreshUrl = "https://app.cal.com/api/auth/oauth/refreshToken";
      console.log(`Intentando refresh en: ${refreshUrl}`);

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
      
      // Devolvemos la respuesta de Cal.com tal cual para el modal de diagnóstico
      if (!response.ok) {
        return new Response(JSON.stringify({ 
            success: false, 
            message: "Error en API Cal.com", 
            status: response.status,
            api_response: data 
        }), {
          status: 200, // Usamos 200 para que el modal pueda mostrar el JSON
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const sanitize = (value: unknown) => (value ?? "").toString().replace(/\s+/g, "");

      const { error: updateError } = await supabase
        .schema("core")
        .from("business_credentials")
        .update({
          access_token: sanitize(data.access_token || data.accessToken),
          refresh_token: sanitize(data.refresh_token || data.refreshToken),
          expires_at: data.expires_in
            ? new Date(Date.now() + data.expires_in * 1000).toISOString()
            : null,
          external_status: "active",
          updated_at: new Date().toISOString()
        })
        .eq("id", cred.id);

      if (updateError) throw updateError;

      return new Response(JSON.stringify({ success: true, data }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, message }), {
      status: 200, // Usamos 200 para diagnóstico
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
