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
    
    const { data: creds, error: credError } = await supabaseClient
      .schema('core')
      .rpc('get_business_credentials', { 
        p_business_id: businessId, 
        p_api_name: 'TIENDANUBE' 
      })
    
    const cred = creds?.[0]
    if (credError || !cred) throw new Error('Credenciales de Tiendanube no encontradas.')

    const storeId = cred.external_user_id;
    const accessToken = cred.access_token;

    const { data: variants, error: varError } = await supabaseClient
      .schema('core')
      .from('tiendanube_item_variants')
      .select('*')
      .eq('business_id', businessId)
      .eq('account_id', accountId)
      .is('tn_variant_id', null)
      .eq('is_deleted', false);

    if (varError) throw varError;
    if (!variants || variants.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No hay nuevos productos para sincronizar.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const results = [];

    for (const v of variants) {
      try {
        const productPayload = {
          name: { es: v.nombre },
          description: { es: v.descripcion || '' },
          handle: { es: v.identificador_de_url },
          brand: v.marca,
          published: v.mostrar_en_tienda,
          images: v.imagen_url ? [{ src: v.imagen_url }] : [],
          variants: [
            {
              sku: v.sku,
              price: v.precio,
              promotional_price: v.precio_promocional,
              cost: v.costo,
              stock: v.stock,
              weight: v.peso_kg || 0,
              width: v.ancho_cm || 0,
              height: v.alto_cm || 0,
              depth: v.profundidad_cm || 0,
              barcode: v.codigo_de_barras
            }
          ]
        };

        const tnRes = await fetch(`https://api.tiendanube.com/v1/${storeId}/products`, {
          method: 'POST',
          headers: {
            'Authentication': `bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(productPayload)
        });

        const tnData = await tnRes.json();

        if (tnRes.ok) {
          const tnProductId = tnData.id;
          const tnVariantId = tnData.variants[0].id;
          const now = new Date().toISOString(); // CORRECCIÓN: Usar fecha ISO válida

          // Actualizar tablas locales con los IDs externos
          await supabaseClient.schema('core').from('tiendanube_item_variants').update({
            tn_variant_id: tnVariantId,
            updated_at: now
          }).eq('id', v.id);

          await supabaseClient.schema('core').from('inventory_items_tn').update({
            tn_product_id: tnProductId,
            updated_at: now
          }).eq('item_id', v.item_id);

          await supabaseClient.schema('core').from('tiendanube_sync_map').upsert({
            item_id: v.item_id,
            tn_product_id: tnProductId,
            account_id: accountId,
            business_id: businessId,
            sync_status: 'SYNCED',
            last_sync_at: now
          });

          results.push({ sku: v.sku, status: 'SUCCESS' });
        } else {
          results.push({ sku: v.sku, status: 'FAILED', error: tnData.message });
        }

        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (itemErr) {
        results.push({ sku: v.sku, status: 'ERROR', error: itemErr.message });
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      processed: results.length,
      details: results 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
