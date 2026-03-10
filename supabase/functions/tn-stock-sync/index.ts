import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { itemId, businessId, newQuantity } = await req.json()

    if (!itemId || !businessId) throw new Error('itemId y businessId son requeridos.')

    // 1. Obtener IDs de vinculación desde la tabla principal (inventory_items)
    // Buscamos a través del padre para asegurar que PostgREST resuelva las relaciones 1-a-1
    const { data: itemData, error: fetchError } = await supabaseClient
      .schema('core')
      .from('inventory_items')
      .select(`
        account_id,
        inventory_items_tn (tn_product_id),
        tiendanube_item_variants (tn_variant_id)
      `)
      .eq('id', itemId)
      .single()

    if (fetchError || !itemData) throw new Error(`Error al buscar vinculación: ${fetchError?.message}`)

    // Extraer IDs
    // inventory_items_tn es objeto directo (PK es item_id)
    const tnProductId = itemData.inventory_items_tn?.tn_product_id
    
    // tiendanube_item_variants es un ARRAY (PK es id, no item_id)
    const tnVariantId = itemData.tiendanube_item_variants?.[0]?.tn_variant_id
    
    const accountId = itemData.account_id

    if (!tnProductId || !tnVariantId) {
      console.log(`[Abort] Item ${itemId} no tiene IDs completos. Prod: ${tnProductId}, Var: ${tnVariantId}.`);
      return new Response(JSON.stringify({ 
        success: false, 
        message: `Faltan IDs de vinculación. Prod: ${tnProductId}, Var: ${tnVariantId}` 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 2. Obtener Credenciales
    const { data: creds } = await supabaseClient
      .schema('core')
      .rpc('get_business_credentials', { 
        p_business_id: businessId, 
        p_api_name: 'TIENDANUBE' 
      })
    
    const cred = creds?.[0]
    if (!cred) throw new Error('Credenciales de Tiendanube no encontradas para este negocio.')

    const storeId = cred.external_user_id
    const accessToken = cred.access_token

    // 3. Sincronización Quirúrgica (Solo Stock)
    // URL CORRECTA: Usa IDs de Tiendanube, no UUIDs del ERP
    const url = `https://api.tiendanube.com/v1/${storeId}/products/${tnProductId}/variants/${tnVariantId}`
    const stockPayload = { stock: newQuantity }

    console.log(`Sincronizando stock en TN. URL: ${url}, Nuevo Stock: ${newQuantity}`);

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authentication': `bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'AppPerPel (soporte@perpel.com)'
      },
      body: JSON.stringify(stockPayload)
    })

    const resultData = await response.json()

    // 4. Auditoría ISO 9000
    await supabaseClient.schema('logs').from('api_logs').insert({
      account_id: accountId,
      api_name: 'TIENDANUBE',
      operation_name: 'sync_stock_realtime',
      status: response.ok ? 'SUCCESS' : 'FAILED',
      request_payload: { itemId, tnProductId, tnVariantId, payload: stockPayload },
      response_payload: resultData
    })

    if (!response.ok) throw new Error(`Error TN Stock Sync: ${resultData.message || response.statusText}`)

    // 5. Actualizar Timestamp del Mapa de Sincronización
    await supabaseClient.schema('core').from('tiendanube_sync_map').upsert({
      item_id: itemId,
      account_id: accountId,
      business_id: businessId,
      tn_product_id: tnProductId,
      sync_status: 'SYNCED',
      last_sync_at: new Date().toISOString()
    })

    return new Response(JSON.stringify({ success: true, new_stock: newQuantity }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error(`Error en tn-stock-sync: ${error.message}`);
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
