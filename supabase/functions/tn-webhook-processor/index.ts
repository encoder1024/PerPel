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

    const { event_type: eventType, payload: event, store_id: storeId } = queueRow

    // 2. Obtener la cuenta y negocio asociada
    const { data: bizCreds } = await supabaseClient
      .schema('core')
      .from('business_credentials')
      .select('account_id, business_id')
      .eq('external_user_id', storeId)
      .eq('api_name', 'TIENDANUBE')
      .single()

    if (!bizCreds) throw new Error(`Store ID ${storeId} no vinculado a ningún negocio.`);

    const { account_id, business_id } = bizCreds

    // 3. Procesar Eventos
    if (eventType === 'order.created') {
        const customerEmail = event.customer.email
        
        // A. Cliente
        let { data: customer } = await supabaseClient.schema('core').from('customers').select('id').eq('email', customerEmail).eq('account_id', account_id).maybeSingle()
        if (!customer) {
            const { data: newCustomer } = await supabaseClient.schema('core').from('customers').insert({
                account_id, name: event.customer.name, email: customerEmail, phone: event.customer.phone,
                address: event.shipping_address?.address, city: event.shipping_address?.city
            }).select().single()
            customer = newCustomer
        }

        // B. Orden
        const { data: order, error: orderErr } = await supabaseClient.schema('core').from('orders').insert({
            account_id, business_id, client_id: customer?.id, total_amount: parseFloat(event.total),
            status: 'PENDING', origin: 'TIENDANUBE', external_reference: event.id.toString(), notes: `Orden TN #${event.number}`
        }).select().single()

        if (orderErr) throw orderErr

        // C. Ítems
        for (const item of event.products) {
            const { data: mapping } = await supabaseClient.schema('core').from('inventory_items_tn').select('item_id').eq('tn_product_id', item.product_id).maybeSingle()
            if (mapping) {
                await supabaseClient.schema('core').from('order_items').insert({
                    order_id: order.id, item_id: mapping.item_id, quantity: item.quantity, unit_price: parseFloat(item.price)
                })
            }
        }
    }

    if (eventType === 'order.paid') {
        const { data: order } = await supabaseClient.schema('core').from('orders').select('id, status').eq('external_reference', event.id.toString()).maybeSingle()
        if (order && order.status !== 'PAID') {
            await supabaseClient.schema('core').from('orders').update({ status: 'PAID' }).eq('id', order.id)
            await supabaseClient.schema('core').from('payments').insert({
                account_id, business_id, order_id: order.id, amount: parseFloat(event.total), payment_method: event.payment_details?.method || 'TIENDANUBE', status: 'COMPLETED'
            })
            for (const item of event.products) {
                const { data: mapping } = await supabaseClient.schema('core').from('inventory_items_tn').select('item_id').eq('tn_product_id', item.product_id).maybeSingle()
                if (mapping) {
                    await supabaseClient.rpc('adjust_stock', {
                        p_item_id: mapping.item_id, p_business_id: business_id, p_quantity_change: -Math.abs(item.quantity),
                        p_reason: 'VENTA ONLINE TN', p_user_id: null
                    })
                }
            }
        }
    }

    // 4. Marcar como procesado exitosamente
    await supabaseClient.schema('logs').from('tiendanube_webhook_queue').update({
        status: 'PROCESSED',
        processed_at: new Date().toISOString()
    }).eq('id', queue_id)

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error(`Error en Procesador Webhook TN: ${error.message}`);
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
