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

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const authClient = createClient(supabaseUrl, supabaseService, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const serviceClient = createClient(supabaseUrl, supabaseService);

  try {
    const { credentialId, accessToken } = await req.json();
    if (!credentialId) {
      return new Response(JSON.stringify({ error: "credentialId requerido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jwt = accessToken || authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Missing Authorization token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: userData, error: userError } = await authClient.auth
      .getUser(jwt);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile, error: profileError } = await serviceClient
      .schema("core")
      .from("user_profiles")
      .select("account_id")
      .eq("id", userData.user.id)
      .single();
    if (profileError || !profile?.account_id) {
      throw new Error(
        JSON.stringify({
          message: "No se pudo obtener account_id del usuario.",
          userId: userData?.user?.id,
          profileError: profileError?.message || null,
          profileFound: !!profile,
        }),
      );
    }

    const { data: cred, error: credError } = await serviceClient
      .schema("core")
      .from("business_credentials")
      .select("id, account_id, client_id, api_name, is_deleted")
      .eq("id", credentialId)
      .eq("account_id", profile.account_id)
      .eq("api_name", "CAL_COM")
      .eq("is_deleted", false)
      .single();

    if (credError || !cred?.client_id) {
      throw new Error("Credencial Cal.com no válida.");
    }

    const appUrl = Deno.env.get("APP_URL") || "http://localhost:5173";
    const redirectUri = Deno.env.get("CAL_REDIRECT_URI") ||
      `${appUrl}/oauth/callback`;
    const state = `calcom:${cred.id}`;

    const authUrl =
      `https://app.cal.com/auth/oauth2/authorize?client_id=${encodeURIComponent(cred.client_id)}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${encodeURIComponent(state)}`;

    return new Response(JSON.stringify({ url: authUrl }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
