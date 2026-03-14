import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const correlationId = crypto.randomUUID();
  console.log(`[${correlationId}] --- INICIANDO VINCULACIÓN TIENDANUBE ---`);

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { account_id, business_id, client_id, client_secret } = await req.json()

    if (!account_id || !business_id || !client_id || !client_secret) {
      throw new Error('Faltan parámetros requeridos (account_id, business_id, client_id, client_secret).')
    }

    console.log(`[${correlationId}] Configurando credenciales base para Negocio: ${business_id}, Tienda: ${client_id}`);

    // 1. Upsert de la credencial con client_id y client_secret (encriptado por trigger)
    const { data: credential, error: credError } = await supabase
      .schema('core')
      .from('business_credentials')
      .upsert({
        account_id,
        api_name: 'TIENDANUBE',
        name: `Tiendanube - Tienda ${client_id}`,
        client_id,
        client_secret,
        external_status: 'pending_auth',
        is_deleted: false
      }, { onConflict: 'account_id, api_name, client_id' })
      .select()
      .single()

    if (credError) throw new Error(`Error al guardar credenciales base: ${credError.message}`);

    // 2. Vincular negocio con la credencial mediante la tabla de asignación core.business_asign_credentials
    console.log(`[${correlationId}] Vinculando Credencial ID ${credential.id} con Negocio ID ${business_id}`);
    const { error: assignError } = await supabase
      .schema('core')
      .from('business_asign_credentials')
      .upsert({
        account_id,
        business_id,
        credential_id: credential.id,
        is_active: true,
        is_deleted: false
      }, { onConflict: 'business_id, credential_id' })

    if (assignError) throw new Error(`Error al vincular negocio (asignación): ${assignError.message}`);

    // 3. Generar URL de redirección con SCOPES explícitos
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const redirectUri = `${supabaseUrl}/functions/v1/tn-oauth-callback`;
    
    // Definimos los permisos necesarios (Tiendanube suele usar comas como separador en URL)
    const scope = [
      'read_products',
      'write_products',
      'read_orders',
      'write_orders',
      'read_customers',
      'write_customers'
    ].join(',');

    const authUrl = `https://www.tiendanube.com/apps/${client_id}/authorize?scope=write_orders,write_products&state=${credential.id}&redirect_uri=${encodeURIComponent(redirectUri)}`;

    console.log(`[${correlationId}] URL de autorización generada con scopes: ${scope}`);

    return new Response(JSON.stringify({ success: true, url: authUrl, correlationId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error(`[${correlationId}] ERROR: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message, correlationId }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})