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

  let queueRecordId: string | null = null;

  try {
    const { queue_id } = await req.json()
    queueRecordId = queue_id

    // 1. Obtener el registro de la cola
    const { data: queueRow, error: queueError } = await supabaseClient
      .schema('logs')
      .from('tiendanube_webhook_queue')
      .select('*')
      .eq('id', queue_id)
      .single()

    if (queueError || !queueRow) throw new Error(`Registro de cola no encontrado: ${queue_id}`)

    // Normalizar el eventType (Tiendanube envía order/created, pero internamente podríamos usar order.created)
    const eventType = queueRow.event_type.replace('/', '.') 
    const event = queueRow.payload
    const storeId = queueRow.store_id

    // 2. Obtener la cuenta y negocio asociada
    // Buscamos la credencial que tenga este store_id externo
    const { data: cred, error: credError } = await supabaseClient
      .schema('core')
      .from('business_credentials')
      .select('id, account_id')
      .eq('external_user_id', storeId)
      .eq('api_name', 'TIENDANUBE')
      .eq('is_deleted', false)
      .maybeSingle()

    if (credError || !cred) throw new Error(`Store ID ${storeId} no vinculado a ninguna credencial activa.`);

    // Buscamos el negocio que tiene asignada esta credencial
    const { data: business, error: bizError } = await supabaseClient
      .schema('core')
      .from('businesses')
      .select('id')
      .eq('credential_id', cred.id)
      .maybeSingle()

    if (bizError || !business) throw new Error(`No hay negocio asociado a la credencial ID ${cred.id}`);

    const accountId = cred.account_id;
    const businessId = business.id;

    console.log(`Procesando ${eventType} para Cuenta: ${accountId}, Negocio: ${businessId}`);

    // 3. Lógica por Evento
    
    // --- ORDEN CREADA ---
    if (eventType === 'order.created') {
        const customerEmail = event.customer.email
        
        // A. Asegurar Cliente
        let { data: customer } = await supabaseClient
          .schema('core')
          .from('customers')
          .select('id')
          .eq('email', customerEmail)
          .eq('account_id', accountId)
          .maybeSingle()

        if (!customer) {
            const { data: newCustomer, error: custError } = await supabaseClient
              .schema('core')
              .from('customers')
              .insert({
                account_id: accountId,
                name: event.customer.name,
                email: customerEmail,
                phone: event.customer.phone,
                address: event.shipping_address?.address,
                city: event.shipping_address?.city
              }).select().single()
            
            if (custError) throw new Error(`Error al crear cliente: ${custError.message}`);
            customer = newCustomer
        }

        // B. Crear Orden Local
        const { data: order, error: orderErr } = await supabaseClient
          .schema('core')
          .from('orders')
          .insert({
            account_id: accountId,
            business_id: businessId,
            client_id: customer?.id,
            total_amount: parseFloat(event.total),
            status: 'PENDING',
            origin: 'TIENDANUBE',
            external_reference: event.id.toString(),
            notes: `Orden TN #${event.number} (${event.id})`
          }).select().single()

        if (orderErr) throw new Error(`Error al crear orden: ${orderErr.message}`);

        // C. Crear Ítems de la Orden
        for (const item of event.products) {
            // Buscamos el mapeo del producto/variante
            // Priorizamos el variant_id si viene, si no el product_id
            const externalVariantId = item.variant_id?.toString() || item.product_id?.toString();
            
            const { data: mapping } = await supabaseClient
              .schema('core')
              .from('item_variants_tn')
              .select('item_id')
              .eq('tn_variant_id', externalVariantId)
              .maybeSingle()

            if (mapping) {
                await supabaseClient.schema('core').from('order_items').insert({
                    order_id: order.id,
                    item_id: mapping.item_id,
                    quantity: item.quantity,
                    unit_price: parseFloat(item.price)
                })
            } else {
                console.warn(`Producto TN ID ${externalVariantId} no tiene mapeo en ERP.`);
            }
        }
    }

    // --- ORDEN PAGADA ---
    if (eventType === 'order.paid' || (eventType === 'order.updated' && event.payment_status === 'paid')) {
        const { data: order, error: findOrderErr } = await supabaseClient
          .schema('core')
          .from('orders')
          .select('id, status, total_amount')
          .eq('external_reference', event.id.toString())
          .eq('origin', 'TIENDANUBE')
          .maybeSingle()

        if (findOrderErr) throw findOrderErr;

        if (order && order.status !== 'PAID') {
            // 1. Actualizar estado de la orden
            await supabaseClient.schema('core').from('orders').update({ status: 'PAID' }).eq('id', order.id)
            
            // 2. Registrar el pago
            await supabaseClient.schema('core').from('payments').insert({
                account_id: accountId,
                business_id: businessId,
                order_id: order.id,
                amount: parseFloat(event.total),
                payment_method: event.payment_details?.method || 'TIENDANUBE',
                status: 'COMPLETED'
            })

            // 3. Descontar Stock
            for (const item of event.products) {
                const externalVariantId = item.variant_id?.toString() || item.product_id?.toString();
                const { data: mapping } = await supabaseClient
                  .schema('core')
                  .from('item_variants_tn')
                  .select('item_id')
                  .eq('tn_variant_id', externalVariantId)
                  .maybeSingle()

                if (mapping) {
                    // Llamamos a la RPC de ajuste de stock (Atómica y segura)
                    const { error: stockErr } = await supabaseClient.rpc('adjust_stock', {
                        p_item_id: mapping.item_id,
                        p_business_id: businessId,
                        p_quantity_change: -Math.abs(item.quantity),
                        p_reason: `VENTA ONLINE TN #${event.number}`,
                        p_user_id: null // Webhook no tiene usuario logueado
                    })
                    if (stockErr) console.error(`Error de stock para ítem ${mapping.item_id}:`, stockErr.message);
                }
            }
        }
    }

    // 4. Marcar como procesado exitosamente
    await supabaseClient.schema('logs').from('tiendanube_webhook_queue').update({
        status: 'PROCESSED',
        processed_at: new Date().toISOString()
    }).eq('id', queue_id)

    return new Response(JSON.stringify({ success: true }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })

  } catch (error) {
    console.error(`Error crítico en Procesador Webhook TN: ${error.message}`);
    if (queueRecordId) {
        await supabaseClient.schema('logs').from('tiendanube_webhook_queue').update({
            status: 'ERROR',
            error_log: error.message
        }).eq('id', queueRecordId)
    }
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
