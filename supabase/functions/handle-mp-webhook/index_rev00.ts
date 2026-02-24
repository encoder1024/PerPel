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

      // Consultamos directo a la API
      const mpResponse = await fetch(
        `https://api.mercadopago.com/v1/payments/${paymentId}`,
        {
          headers: {
            Authorization: `Bearer ${Deno.env.get("MP_ACCESS_TOKEN")}`,
          },
        },
      );

      const mpPayment = await mpResponse.json();
      const orderId = mpPayment.external_reference;

      // ... dentro de la lógica donde confirmas el pago ...

      if (mpPayment.status === "approved") {

        // 1. Actualizamos la orden a 'paid'
        await supabase
          .schema('core')
          .from("orders")
          .update({ status: "PAID" })
          .eq("id", orderId);

        const { data, error } = await supabase
          .schema('core')
          .from('orders')
          .select('account_id')
          .eq("id", orderId);

        // 2. Registramos el detalle en la tabla 'payments'
        await supabase.schema('core').from("payments").insert({
          order_id: orderId,
          account_id: data?.account_id,
          mp_payment_id: paymentId.toString(),
          amount: mpPayment.transaction_amount,
          status: mpPayment.status,
          payment_method_id: mpPayment.payment_method_id,
          payment_type:
            mpPayment.operation_type === "pos_payment" ? "point" : "online",
          raw_response: mpPayment,
        });
        // NOTA: Aquí es donde en el futuro dispararemos la función de AFIP
        console.log(`Orden ${orderId} pagada con éxito.`);


        // 1. Obtener los detalles de la orden para saber qué plan compró
        const { data: order } = await supabase
          .schema('core')
          .from("orders")
          .select("*, user_id")
          .eq("id", orderId)
          .single();

      }
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (error) {
    console.error("Webhook Error:", error);
    return new Response(error.message, { status: 500 });
  }
});