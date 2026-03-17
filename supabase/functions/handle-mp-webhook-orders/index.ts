import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

Deno.serve(async (req) => {
  const correlationId = crypto.randomUUID();

  try {
    const supabase = createClient(
      SUPABASE_URL ?? "",
      SUPABASE_SERVICE_ROLE_KEY ?? ""
    );

    const body = await req.json();
    console.log(`[${correlationId}] WEBHOOK RECIBIDO:`, JSON.stringify(body));

    // Validamos el tipo de notificación para el flujo de Point Orders
    if (body.type !== "order" || body.action !== "order.processed") {
      console.log(`[${correlationId}] Ignorando notificación: ${body.type}.${body.action}`);
      return new Response("OK", { status: 200 });
    }

    const orderData = body.data;
    const orderId = orderData.external_reference; // UUID de nuestra orden ERP
    const mpOrderId = orderData.id;

    if (!orderId) {
      console.warn(`[${correlationId}] Orden MP ${mpOrderId} sin external_reference. Ignorando.`);
      return new Response("No ERP Reference", { status: 200 });
    }

    // 1. Buscar la orden en el ERP
    const { data: order, error: orderError } = await supabase
      .schema('core')
      .from('orders')
      .select('id, status, account_id, business_id')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      console.error(`[${correlationId}] Orden ERP ${orderId} no encontrada.`);
      return new Response("Order Not Found", { status: 200 });
    }

    // 2. Extraer datos del pago (asumimos el primer pago del array de transacciones)
    const firstPayment = orderData.transactions?.payments?.[0];
    if (!firstPayment) {
        throw new Error("No se encontró información de pago en la orden procesada.");
    }

    // 3. Determinar nuevo estado basado en status_detail de MP
    let newStatus = order.status;
    if (orderData.status === "processed" && orderData.status_detail === "accredited") {
      newStatus = "PAID";
    }

    console.log(`[${correlationId}] Procesando Pago ${firstPayment.id} para Orden ERP ${orderId}. Estado: ${newStatus}`);

    // 4. Actualizar Orden y Registrar Pago en paralelo
    const updatePromise = supabase
      .schema('core')
      .from('orders')
      .update({ status: newStatus })
      .eq('id', orderId);

    const paymentPromise = supabase.schema('core').from('payments').insert({
      account_id: order.account_id,
      order_id: order.id,
      amount: parseFloat(firstPayment.amount),
      payment_method_id: firstPayment.payment_method?.id || 'unknown',
      payment_type: 'point',
      status: firstPayment.status_detail || firstPayment.status,
      mp_payment_id: firstPayment.id.toString(),
      card_last_four: firstPayment.payment_method?.last_four_digits || null,
      installments: firstPayment.payment_method?.installments || 1,
      raw_response: orderData
    });

    const [updateRes, paymentRes] = await Promise.all([updatePromise, paymentPromise]);

    if (updateRes.error) throw new Error("Error actualizando orden: " + updateRes.error.message);
    if (paymentRes.error) throw new Error("Error registrando pago: " + paymentRes.error.message);

    // 5. Trigger AFIP/Invoice (Opcional por ahora)
    if (newStatus === "PAID") {
       console.log(`[${correlationId}] Flujo completado con éxito para orden ${orderId}`);
    }

    return new Response(JSON.stringify({ success: true, erpOrderId: orderId }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error(`[${correlationId}] ERROR Webhook Orders:`, err.message);
    return new Response(err.message, { status: 500 });
  }
});
