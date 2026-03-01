import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";

  const authClient = createClient(supabaseUrl, supabaseService, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const supabaseClient = createClient(supabaseUrl, supabaseService);

  let credentialIdToLog: string | undefined;
  let accountIdToLog: string | undefined;
  let correlationId = crypto.randomUUID();

  try {
    const { code, credentialId, accessToken } = await req.json();
    credentialIdToLog = credentialId;

    const jwt = accessToken || authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) throw new Error("Missing Authorization token");

    const { data: userData, error: userError } = await authClient.auth.getUser(jwt);
    if (userError || !userData?.user) throw new Error("Unauthorized");

    const { data: profile, error: profileError } = await supabaseClient
      .schema("core")
      .from("user_profiles")
      .select("account_id")
      .eq("id", userData.user.id)
      .single();
    if (profileError || !profile?.account_id) throw new Error("Cuenta no encontrada.");

    // 1. Obtener secretos desde RPC (desencriptado en DB)
    const { data: cred, error: dbError } = await supabaseClient
      .schema("core")
      .rpc("get_credential_by_id", { p_credential_id: credentialId })
      .maybeSingle();

    if (dbError || !cred) throw new Error("Credencial no encontrada en la DB.");
    if (cred.account_id !== profile.account_id) throw new Error("Cuenta no autorizada.");
    if (cred.api_name !== "CAL_COM") throw new Error("Credencial inválida.");
    accountIdToLog = cred.account_id;

    // 2. Intercambio de tokens con Cal.com v1
    const tokenExchangeUrl = "https://api.cal.com/v2/auth/oauth2/token";
    const appUrl = Deno.env.get("APP_URL") || "http://localhost:5173";
    const redirectUri = Deno.env.get("CAL_REDIRECT_URI") || `${appUrl}/oauth/callback`;
    
    const response = await fetch(tokenExchangeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: cred.client_id,
        client_secret: cred.client_secret,
        grant_type: "authorization_code",
        code: code,
        redirect_uri: redirectUri,
      }),
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(JSON.stringify({
        message: "Error en intercambio Cal.com",
        status: response.status,
        response: data,
        tokenExchangeUrl,
        redirect_uri: redirectUri,
      }));
    }

    const sanitize = (value: unknown) => (value ?? "").toString().replace(/\s+/g, "");

    // 3. Guardar tokens (Mapeo flexible v1)
    const { error: updateError } = await supabaseClient
      .schema("core")
      .from("business_credentials")
      .update({
        access_token: sanitize(data.access_token || data.accessToken),
        refresh_token: sanitize(data.refresh_token || data.refreshToken),
        external_user_id: (data.user_id || data.ownerId || data.username)?.toString(),
        expires_at: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null,
        external_status: "active",
        is_deleted: false
      })
      .eq('id', credentialId)

    if (updateError) throw updateError

    // 4. Auditoría Exitosa
    await supabaseClient.schema('logs').from('api_logs').insert({
      account_id: accountIdToLog,
      api_name: 'CAL_COM',
      endpoint: tokenExchangeUrl,
      operation_name: 'oauth_exchange_success',
      status: 'SUCCESS',
      correlation_id: correlationId
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error("Cal.com OAuth Error:", error.message);
    
    // Log de Auditoría Fallido
    const errorClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    await errorClient.schema('logs').from('api_logs').insert({
      account_id: accountIdToLog || null,
      api_name: 'CAL_COM',
      operation_name: 'oauth_exchange_failed',
      status: 'FAILED',
      response_payload: { message: error.message },
      correlation_id: correlationId
    });

    return new Response(JSON.stringify({ success: false, message: error.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
