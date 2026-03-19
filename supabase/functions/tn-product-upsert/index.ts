import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const correlationId = crypto.randomUUID();

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const body = await req.json()
    const { itemId, action } = body
    let { businessId, accountId } = body

    if (!itemId) throw new Error('itemId es requerido.')

    // 1. Obtener Datos del Producto
    const { data: product, error: prodError } = await supabaseClient
      .schema('core')
      .from('inventory_items')
      .select(`*, tiendanube_item_variants (*)`)
      .eq('id', itemId)
      .single()

    if (prodError || !product) throw new Error(`Producto no encontrado: ${prodError?.message}`)
    
    accountId = product.account_id
    businessId = product.business_id

    // 2. Obtener Credenciales
    const { data: creds, error: credsError } = await supabaseClient
      .schema('core')
      .rpc('get_business_credentials', { 
        p_business_id: businessId, 
        p_api_name: 'TIENDANUBE' 
      })
    
    const cred = creds?.[0]
    if (credsError || !cred) throw new Error('No se encontraron credenciales de Tiendanube.')

    const storeId = cred.external_user_id
    const accessToken = cred.access_token
    const headers = {
      'Authentication': `bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'User-Agent': 'AppPerPel (soporte@perpel.com)'
    }

    // 3. Verificar existencia local en TN
    const { data: tnMeta } = await supabaseClient
      .schema('core')
      .from('inventory_items_tn')
      .select('tn_product_id')
      .eq('item_id', itemId)
      .maybeSingle()

    let tnProductId = tnMeta?.tn_product_id
    let variant = product.tiendanube_item_variants?.[0]

    // --- MEJORA: AUTO-PREPARACIÓN ROBUSTA CON UPSERT ---
    if (!variant) {
        console.log(`[${correlationId}] Preparando variante TN para item: ${itemId}`);
        const handle = (product.sku || itemId.substring(0, 8)).toLowerCase().replace(/[^a-z0-9]+/g, '-');
        
        const { data: upsertedVar, error: varUpsertError } = await supabaseClient
            .schema('core')
            .from('tiendanube_item_variants')
            .upsert({
                item_id: itemId,
                account_id: accountId,
                business_id: businessId,
                sku: product.sku,
                nombre: product.name,
                precio: product.selling_price,
                costo: product.cost_price,
                identificador_de_url: handle,
                mostrar_en_tienda: true
            }, { onConflict: 'item_id' }) // Usamos la restricción única
            .select()
            .single();
        
        if (varUpsertError) throw new Error(`Error al auto-preparar variante: ${varUpsertError.message}`);
        variant = upsertedVar;
    }

    // --- ACCIÓN: DELETE ---
    if (action === 'DELETE') {
      if (!tnProductId) throw new Error('El producto no está vinculado a TN.')
      const res = await fetch(`https://api.tiendanube.com/v1/${storeId}/products/${tnProductId}`, { method: 'DELETE', headers })
      if (!res.ok && res.status !== 404) throw new Error('Error al eliminar en TN.')
      
      await supabaseClient.schema('core').from('inventory_items_tn').update({ is_deleted: true, tn_product_id: null }).eq('item_id', itemId).throwOnError()
      await supabaseClient.schema('core').from('tiendanube_sync_map').upsert({ item_id: itemId, account_id: accountId, business_id: businessId, sync_status: 'PENDING', tn_product_id: 0, last_sync_at: new Date().toISOString() }).throwOnError()
      return new Response(JSON.stringify({ success: true, message: 'Eliminado.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // --- MEJORA: AUTO-VINCULACIÓN POR HANDLE ---
    if (!tnProductId && variant.identificador_de_url) {
        console.log(`[${correlationId}] Buscando producto existente por handle: ${variant.identificador_de_url}`);
        const searchRes = await fetch(`https://api.tiendanube.com/v1/${storeId}/products?handle=${variant.identificador_de_url}`, { headers });
        const searchData = await searchRes.json();
        
        if (searchRes.ok && searchData.length > 0) {
            tnProductId = searchData[0].id;
            console.log(`[${correlationId}] Producto encontrado en TN. Vinculando ID: ${tnProductId}`);
            
            await supabaseClient.schema('core').from('inventory_items_tn').upsert({
                item_id: itemId, tn_product_id: tnProductId, account_id: accountId, business_id: businessId
            }).eq('item_id', itemId);
            
            if (searchData[0].variants?.[0]?.id) {
                await supabaseClient.schema('core').from('tiendanube_item_variants').update({
                    tn_variant_id: searchData[0].variants[0].id
                }).eq('item_id', itemId);
                variant.tn_variant_id = searchData[0].variants[0].id;
            }
        }
    }

    const propertyNames: string[] = []
    if (variant.nombre_de_propiedad_1?.trim()) propertyNames.push(variant.nombre_de_propiedad_1.trim())
    if (variant.nombre_de_propiedad_2?.trim()) propertyNames.push(variant.nombre_de_propiedad_2.trim())
    if (variant.nombre_de_propiedad_3?.trim()) propertyNames.push(variant.nombre_de_propiedad_3.trim())

    const commonPayload: any = {
      name: { es: (variant.nombre || product.name).trim() },
      description: { es: (variant.descripcion || product.description || "").trim() },
      handle: { es: (variant.identificador_de_url || "").trim() },
      brand: variant.marca?.trim() || null,
      published: variant.mostrar_en_tienda ?? true
    }

    if (variant.categorias?.trim()) {
      commonPayload.categories = variant.categorias.split(',').map(c => parseInt(c.trim())).filter(c => !isNaN(c))
    }

    if (variant.imagen_url?.trim()) {
      commonPayload.images = [{ src: variant.imagen_url.trim() }]
    }

    const variantPayload = {
      price: variant.precio?.toString() || "0.00",
      promotional_price: variant.precio_promocional?.toString() || null,
      stock: variant.stock || 0,
      sku: variant.sku?.trim() || null,
      barcode: variant.codigo_de_barras?.trim() || null,
      cost: variant.costo?.toString() || null,
      weight: variant.peso_kg?.toString() || "0.00",
      width: variant.ancho_cm?.toString() || "0.00",
      height: variant.alto_cm?.toString() || "0.00",
      depth: variant.profundidad_cm?.toString() || "0.00",
      values: propertyNames.map((_, i) => ({ es: (variant[`valor_de_propiedad_${i+1}`] || "").trim() }))
    }

    let resultData;
    let response;

    if (tnProductId) {
      console.log(`[${correlationId}] Actualizando producto existente ID: ${tnProductId}`);
      await fetch(`https://api.tiendanube.com/v1/${storeId}/products/${tnProductId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(commonPayload)
      })

      if (!variant.tn_variant_id) {
          const fullProdRes = await fetch(`https://api.tiendanube.com/v1/${storeId}/products/${tnProductId}`, { headers });
          const fullProd = await fullProdRes.json();
          variant.tn_variant_id = fullProd.variants[0].id;
      }

      response = await fetch(`https://api.tiendanube.com/v1/${storeId}/products/${tnProductId}/variants/${variant.tn_variant_id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(variantPayload)
      })
      resultData = await response.json()
      resultData.id = resultData.product_id || tnProductId 
    } else {
      console.log(`[${correlationId}] Creando nuevo producto en TN`);
      const createPayload = { ...commonPayload, variants: [variantPayload] }
      response = await fetch(`https://api.tiendanube.com/v1/${storeId}/products`, {
        method: 'POST',
        headers,
        body: JSON.stringify(createPayload)
      })
      resultData = await response.json()
    }

    await supabaseClient.schema('logs').from('api_logs').insert({
      account_id: accountId,
      api_name: 'TIENDANUBE',
      operation_name: tnProductId ? 'update_product' : 'create_product',
      status: response.ok ? 'SUCCESS' : 'FAILED',
      request_payload: { itemId, tnProductId, correlationId },
      response_payload: resultData
    })

    if (!response.ok) throw new Error(`Error TN: ${resultData.message || response.statusText}`)

    await supabaseClient.schema('core').from('inventory_items_tn').upsert({
      item_id: itemId, tn_product_id: resultData.id, account_id: accountId, business_id: businessId, updated_at: new Date().toISOString(), is_deleted: false
    }).throwOnError()

    await supabaseClient.schema('core').from('tiendanube_sync_map').upsert({
      item_id: itemId, account_id: accountId, business_id: businessId, tn_product_id: resultData.id, sync_status: 'SYNCED', last_sync_at: new Date().toISOString()
    }).throwOnError()

    const finalVariantId = resultData.variants?.[0]?.id || resultData.id || variant.tn_variant_id;
    if (finalVariantId) {
      await supabaseClient.schema('core').from('tiendanube_item_variants').update({ tn_variant_id: finalVariantId }).eq('item_id', itemId).throwOnError()
    }

    return new Response(JSON.stringify({ success: true, tn_product_id: resultData.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error(`[${correlationId}] ERROR:`, error.message);
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
