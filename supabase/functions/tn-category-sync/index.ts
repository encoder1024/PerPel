import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  try {
    const { businessId, accountId } = await req.json()

    if (!businessId) throw new Error('businessId es requerido.')

    // 1. Obtener Credenciales
    const { data: creds, error: credsError } = await supabaseClient
      .rpc('get_business_credentials', { 
        p_business_id: businessId, 
        p_api_name: 'TIENDANUBE' 
      })
    
    const cred = creds?.[0]
    if (credsError || !cred) throw new Error('No hay credenciales activas para este negocio.')

    const storeId = cred.external_user_id
    const accessToken = cred.access_token

    // 2. Llamar a Tiendanube API (Categorías)
    const tnResponse = await fetch(`https://api.tiendanube.com/v1/${storeId}/categories`, {
      method: 'GET',
      headers: {
        'Authentication': `bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'AppPerPel (soporte@perpel.com)'
      }
    })

    const tnCategories = await tnResponse.json()

    if (!tnResponse.ok) throw new Error(`Error TN: ${tnCategories.message}`)

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
          updated_at: new Date().toISOString()
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
      response_payload: { count: processedCount }
    })

    return new Response(
      JSON.stringify({ success: true, count: processedCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, message: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
