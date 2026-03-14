import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const correlationId = crypto.randomUUID();
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const credentialId = url.searchParams.get('state')

  console.log(`[${correlationId}] --- RECIBIENDO CALLBACK DE TIENDANUBE ---`);
  
  if (!code || !credentialId) {
    return new Response('Parámetros de autorización faltantes.', { status: 400 })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Recuperar secretos (client_id y client_secret desencriptados)
    // Usamos .schema('core') explícitamente para la RPC
    console.log(`[${correlationId}] Invocando core.get_credential_by_id para ID: ${credentialId}`);
    
    const { data: cred, error: rpcError } = await supabase
      .schema('core')
      .rpc('get_credential_by_id', { p_credential_id: credentialId })
      .single()

    if (rpcError || !cred) {
        throw new Error(`No se pudo recuperar la credencial base: ${rpcError?.message || 'No encontrada'}`);
    }

    // 2. Intercambiar código por Access Token
    console.log(`[${correlationId}] Solicitando token a Tiendanube...`);
    const exchangeUrl = 'https://www.tiendanube.com/apps/authorize/token'
    
    const exchangeResponse = await fetch(exchangeUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'AppPerPel (admin@appperpel.com)' 
      },
      body: JSON.stringify({
        client_id: cred.client_id,
        client_secret: cred.client_secret,
        grant_type: 'authorization_code',
        code: code
      })
    })

    const responseText = await exchangeResponse.text();
    let tokenData;
    try {
        tokenData = JSON.parse(responseText);
    } catch (e) {
        throw new Error(`Respuesta de Tiendanube no es JSON válido: ${responseText.substring(0, 100)}`);
    }

    if (!exchangeResponse.ok) {
        throw new Error(`Tiendanube error: ${tokenData.error_description || tokenData.message}`);
    }

    const { access_token, user_id } = tokenData;

    // 3. Registrar Webhooks
    const userAgent = `AppPerPel (admin@appperpel.com)`; 
    const webhookEndpoint = `https://api.tiendanube.com/v1/${user_id}/webhooks`;
    const webhookHandlerUrl = `https://wpwmcikdclulxuhpijri.supabase.co/functions/v1/tn-webhook-handler`;
    const events = ['order/created', 'order/updated', 'order/paid'];
    
    for (const event of events) {
      try {
        await fetch(webhookEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authentication': `bearer ${access_token}`,
            'User-Agent': userAgent
          },
          body: JSON.stringify({ event, url: webhookHandlerUrl })
        });
      } catch (whErr) {
        console.warn(`[${correlationId}] Error al registrar webhook ${event}:`, whErr.message);
      }
    }

    // 4. Persistir Access Token y Activar Credencial
    const { error: updateError } = await supabase
      .schema('core')
      .from('business_credentials')
      .update({
        access_token: access_token,
        external_user_id: user_id?.toString(),
        external_status: 'active'
      })
      .eq('id', credentialId)

    if (updateError) throw new Error(`Error al actualizar token: ${updateError.message}`);

    // 5. Asegurar vínculo activo
    await supabase
      .schema('core')
      .from('business_asign_credentials')
      .update({ is_active: true, is_deleted: false })
      .eq('credential_id', credentialId);

    console.log(`[${correlationId}] --- VINCULACIÓN COMPLETADA CON ÉXITO ---`);

    // 6. Redirección final (Forzada a Localhost por requerimiento del usuario)
    const appUrl = 'http://localhost:5173';
    return Response.redirect(`${appUrl}/configuracion/ecommerce?status=success&api=tiendanube`, 303)

  } catch (error) {
    console.error(`[${correlationId}] ERROR CRÍTICO: ${error.message}`);
    const appUrl = 'http://localhost:5173';
    const redirectUrl = `${appUrl}/configuracion/ecommerce?status=error&message=${encodeURIComponent(error.message)}`;
    return Response.redirect(redirectUrl, 303)
  }
})
