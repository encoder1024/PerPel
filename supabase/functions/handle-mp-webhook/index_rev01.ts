import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { MercadoPagoConfig, Payment } from "https://esm.sh/mercadopago@2.1.0";

serve(async (req) => {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  // Solo procesamos si es el webhook
  if (action !== "webhook") {
    return new Response("Not a webhook", { status: 400 });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const client = new MercadoPagoConfig({
      accessToken: Deno.env.get("MP_ACCESS_TOKEN") || "",
    });

    const body = await req.json();

    // Mercado Pago envía notificaciones por varios eventos.
    // Solo nos interesa cuando un pago fue creado o actualizado.
    if (body.type === "payment") {
      const paymentId = body.data.id;

      // Consultamos directo a la API de MercadoPago para obtener detalles completos
      const mpResponse = await fetch(
        `https://api.mercadopago.com/v1/payments/${paymentId}`,
        {
          headers: {
            Authorization: `Bearer ${Deno.env.get("MP_ACCESS_TOKEN")}`,
          },
        },
      );

      const mpPayment = await mpResponse.json();
      const orderId = mpPayment.external_reference; // Usamos external_reference para encontrar nuestra orden

      // --- STOCK CONTROL INTEGRATION START ---
      // Fetch the order and its items early to have account_id, business_id and order_items readily available
      const { data: orderWithItems, error: orderFetchError } = await supabase
        .schema('core')
        .from('orders')
        .select(`
          id,
          status,
          account_id,
          business_id,
          order_items(item_id, quantity)
        `)
        .eq('id', orderId)
        .single();

      if (orderFetchError) throw orderFetchError;
      if (!orderWithItems) {
          console.warn(`Order not found for external_reference: ${orderId}`);
          return new Response(JSON.stringify({ error: "Order not found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
          });
      }

      const { id: dbOrderId, status: currentOrderStatus, account_id, business_id, order_items } = orderWithItems;
      let newOrderStatus = currentOrderStatus; // Initialize with current status

      if (mpPayment.status === "approved") {
        newOrderStatus = "PAID";
        console.log(`Orden ${dbOrderId} pagada con éxito.`);
        // Stock was already reserved as RESERVE_OUT by usePOS. No further stock adjustment needed.
        // The RESERVE_OUT movement effectively becomes the final SALE_OUT.

      } else if (['rejected', 'cancelled', 'refunded', 'charged_back'].includes(mpPayment.status)) {
        // Handle payment failure/cancellation/refund scenarios
        newOrderStatus = "ABANDONED"; // Or map to 'CANCELLED', 'REFUNDED' etc. as per your order status enum
        console.log(`Pago ${mpPayment.status} para la orden ${dbOrderId}. Liberando stock reservado.`);

        // --- Release Reserved Stock ---
        for (const item of order_items) {
            const { data: adjResult, error: adjError } = await supabase.rpc('adjust_stock', {
                p_item_id: item.item_id,
                p_business_id: business_id,
                p_account_id: account_id,
                p_quantity_change: item.quantity, // Positive quantity to release reservation
                p_movement_type: 'RESERVE_RELEASE_IN',
                p_reason: `Reserva liberada: Pago ${mpPayment.status} para orden MP ${mpPayment.id}`,
                p_user_id: null // System action
            });
            if (adjError) {
                console.error(`Error liberando stock para item ${item.item_id}:`, adjError.message);
            }
            if (adjResult.status === 'error') {
                console.error(`Error liberando stock para item ${item.item_id}:`, adjResult.message);
            }
        }
      }
      // --- STOCK CONTROL INTEGRATION END ---

      // 1. Actualizamos la orden a su nuevo estado
      if (newOrderStatus !== currentOrderStatus) { // Only update if status actually changed
        await supabase
          .schema('core')
          .from("orders")
          .update({ status: newOrderStatus })
          .eq("id", dbOrderId);
      }
      
      // 2. Registramos el detalle en la tabla 'payments'
      await supabase.schema('core').from("payments").insert({
        order_id: dbOrderId,
        account_id: account_id,
        mp_payment_id: paymentId.toString(),
        amount: mpPayment.transaction_amount,
        status: mpPayment.status,
        payment_method_id: mpPayment.payment_method_id,
        payment_type:
          mpPayment.operation_type === "pos_payment" ? "point" : "online",
        raw_response: mpPayment,
      });

      // NOTA: Aquí es donde en el futuro dispararemos la función de AFIP
      console.log(`Proceso de webhook para orden ${dbOrderId} finalizado.`);

    } else {
        console.log(`Ignored webhook type: ${body.type}`);
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (error) {
    console.error("Webhook Error:", error);
    return new Response(error.message, { status: 500 });
  }
});