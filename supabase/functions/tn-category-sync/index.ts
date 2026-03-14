import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const correlationId = crypto.randomUUID();
  console.log(`[${correlationId}] >>> INICIANDO SYNC DE CATEGORÍAS`);

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const body = await req.json().catch(() => ({}));
    const { businessId, accountId } = body;

    if (!businessId || !accountId) {
        throw new Error(`Faltan parámetros requeridos (businessId: ${businessId}, accountId: ${accountId}).`);
    }

    console.log(`[${correlationId}] Negocio: ${businessId}, Cuenta: ${accountId}`);

    // 1. Obtener Credenciales
    const { data: creds, error: credsError } = await supabaseClient
      .schema('core')
      .rpc('get_business_credentials', { 
        p_business_id: businessId, 
        p_api_name: 'TIENDANUBE' 
      })
    
    const cred = creds?.[0]
    if (credsError || !cred) throw new Error('No hay credenciales activas de Tiendanube vinculadas.');

    const storeId = cred.external_user_id
    const accessToken = cred.access_token

    // 2. Llamar a Tiendanube API (Categorías)
    console.log(`[${correlationId}] Consultando Tiendanube Store ID: ${storeId}`);
    const tnResponse = await fetch(`https://api.tiendanube.com/v1/${storeId}/categories`, {
      method: 'GET',
      headers: {
        'Authentication': `bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'AppPerPel (soporte@perpel.com)'
      }
    })

    const responseText = await tnResponse.text();
    let tnCategories;
    try {
        tnCategories = JSON.parse(responseText);
    } catch (e) {
        throw new Error(`Respuesta de Tiendanube no es JSON: ${responseText.substring(0, 100)}`);
    }

    if (!tnResponse.ok) throw new Error(`Tiendanube Error: ${tnCategories.message || tnResponse.statusText}`);

    console.log(`[${correlationId}] Tiendanube devolvió ${tnCategories.length} categorías.`);

    // 3. Upsert en la tabla local
    let processedCount = 0;
    for (const tnCat of tnCategories) {
      const { error: upsertError } = await supabaseClient
        .schema('core')
        .from('tiendanube_categorias')
        .upsert({
          account_id: accountId,
          business_id: businessId,
          tn_category_id: tnCat.id,
          tn_parent_id: tnCat.parent || 0,
          tn_subcategories_ids: tnCat.subcategories || [],
          name: tnCat.name?.es || tnCat.name,
          updated_at: new Date().toISOString(),
          is_deleted: false
        }, {
          onConflict: 'account_id, business_id, tn_category_id'
        })

      if (!upsertError) processedCount++;
    }

    // 4. Log de Auditoría
    await supabaseClient.schema('logs').from('api_logs').insert({
      account_id: accountId,
      api_name: 'TIENDANUBE',
      operation_name: 'sync_categories',
      status: 'SUCCESS',
      response_payload: { count: processedCount, correlationId }
    })

    return new Response(JSON.stringify({ success: true, count: processedCount, correlationId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error(`[${correlationId}] ERROR:`, error.message);
    return new Response(JSON.stringify({ success: false, message: error.message, correlationId }), {
      status: 200, // Devolvemos 200 para capturar el JSON de error en el frontend
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
