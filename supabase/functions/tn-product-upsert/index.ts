import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // 1. Verificar API KEY manualmente
    const apiKey = req.headers.get('apikey')
    if (!apiKey) throw new Error('Falta la API Key de Supabase.')

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { itemId, businessId, accountId } = await req.json()

    if (!itemId || !businessId) throw new Error('itemId y businessId son requeridos.')

    // 2. Obtener Credenciales
    const { data: creds, error: credsError } = await supabaseClient
      .rpc('get_business_credentials', { 
        p_business_id: businessId, 
        p_api_name: 'TIENDANUBE' 
      })
    
    const cred = creds?.[0]
    if (credsError || !cred) throw new Error('No se encontraron credenciales activas de Tiendanube para este negocio.')

    const storeId = cred.external_user_id
    const accessToken = cred.access_token

    // 3. Obtener Datos del Producto y sus Metadatos TN
    const { data: product, error: prodError } = await supabaseClient
      .schema('core')
      .from('inventory_items')
      .select(`
        *,
        inventory_items_tn (*),
        tiendanube_item_variants (*)
      `)
      .eq('id', itemId)
      .single()

    if (prodError || !product) throw new Error('Producto no encontrado en el ERP.')

    // 4. Preparar el JSON para Tiendanube
    const variants = product.tiendanube_item_variants || []
    if (variants.length === 0) throw new Error('El producto no tiene variantes preparadas para Tiendanube.')

    const attrNames = new Set<string>()
    variants.forEach(v => {
      if (v.prop_name_1) attrNames.add(v.prop_name_1)
      if (v.prop_name_2) attrNames.add(v.prop_name_2)
      if (v.prop_name_3) attrNames.add(v.prop_name_3)
    })

    const tnProductData = {
      name: { es: variants[0].nombre || product.name },
      description: { es: variants[0].descripcion || product.description || "" },
      handle: { es: variants[0].identificador_de_url || "" },
      brand: variants[0].marca || null,
      published: variants[0].mostrar_en_tienda ?? true,
      attributes: Array.from(attrNames).map(name => ({ es: name })),
      variants: variants.map(v => {
        const values = []
        if (v.prop_name_1) values.push({ es: v.valor_de_propiedad_1 })
        if (v.prop_name_2) values.push({ es: v.valor_de_propiedad_2 })
        if (v.prop_name_3) values.push({ es: v.valor_de_propiedad_3 })
        
        return {
          price: v.precio?.toString(),
          promotional_price: v.precio_promocional?.toString() || null,
          stock: v.stock || 0,
          sku: v.sku || null,
          barcode: v.codigo_de_barras || null,
          cost: v.costo?.toString() || null,
          weight: v.peso_kg?.toString() || "0.00",
          width: v.ancho_cm?.toString() || "0.00",
          height: v.alto_cm?.toString() || "0.00",
          depth: v.profundidad_cm?.toString() || "0.00",
          values: values
        }
      })
    }

    // 5. Ejecutar llamada a Tiendanube
    const tnProductId = product.inventory_items_tn?.[0]?.tn_product_id
    const url = tnProductId 
      ? `https://api.tiendanube.com/v1/${storeId}/products/${tnProductId}`
      : `https://api.tiendanube.com/v1/${storeId}/products`
    
    const method = tnProductId ? 'PUT' : 'POST'

    const response = await fetch(url, {
      method: method,
      headers: {
        'Authentication': `bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'AppPerPel (soporte@perpel.com)'
      },
      body: JSON.stringify(tnProductData)
    })

    const resultData = await response.json()

    // 6. Auditoría ISO 9000
    await supabaseClient.schema('logs').from('api_logs').insert({
      account_id: accountId,
      api_name: 'TIENDANUBE',
      operation_name: tnProductId ? 'update_product' : 'create_product',
      status: response.ok ? 'SUCCESS' : 'FAILED',
      request_payload: { itemId, tnProductId },
      response_payload: response.ok ? { id: resultData.id } : resultData
    })

    if (!response.ok) throw new Error(`Error TN: ${resultData.message || response.statusText}`)

    // 7. Sincronizar IDs
    await supabaseClient.schema('core').from('inventory_items_tn').upsert({
      item_id: itemId,
      tn_product_id: resultData.id,
      account_id: accountId,
      business_id: businessId,
      updated_at: new Date().toISOString()
    })

    for (const tnVar of resultData.variants) {
      await supabaseClient.schema('core').from('tiendanube_item_variants')
        .update({ tn_variant_id: tnVar.id })
        .eq('item_id', itemId)
        .eq('sku', tnVar.sku)
    }

    return new Response(JSON.stringify({ success: true, tn_product_id: resultData.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
