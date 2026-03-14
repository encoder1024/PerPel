import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const correlationId = crypto.randomUUID();
  let queueRecordId: string | null = null;

  try {
    const { queue_id } = await req.json();
    queueRecordId = queue_id;

    // 1. Obtener el registro de la cola
    const { data: queueRow, error: queueError } = await supabaseClient
      .schema("logs")
      .from("tiendanube_webhook_queue")
      .select("*")
      .eq("id", queue_id)
      .single();

    if (queueError || !queueRow)
      throw new Error(`Registro de cola no encontrado: ${queue_id}`);

    const eventType = queueRow.event_type.replace("/", ".");
    const storeId = queueRow.store_id;
    const resourceId = queueRow.resource_id;

    console.log(
      `[${correlationId}] Procesando ${eventType} para Store: ${storeId}, Recurso: ${resourceId}`,
    );

    // 2. Obtener Credenciales y Negocio
    const { data: cred } = await supabaseClient
      .schema("core")
      .from("business_credentials")
      .select("id")
      .eq("external_user_id", storeId)
      .eq("api_name", "TIENDANUBE")
      .single();

    if (!cred)
      throw new Error(
        `No se encontró credencial activa para Store ID: ${storeId}`,
      );

    const { data: bizAssign } = await supabaseClient
      .schema("core")
      .from("business_asign_credentials")
      .select("business_id, account_id")
      .eq("credential_id", cred.id)
      .eq("is_active", true)
      .single();

    if (!bizAssign)
      throw new Error(`No hay negocio asignado a la credencial ID: ${cred.id}`);

    const businessId = bizAssign.business_id;
    const accountId = bizAssign.account_id;

    // --- NUEVO: Obtener un usuario OWNER para autorizar la RPC de stock ---
    const { data: ownerProfile } = await supabaseClient
      .schema("core")
      .from("user_profiles")
      .select("id")
      .eq("account_id", accountId)
      .eq("app_role", "OWNER")
      .limit(1)
      .maybeSingle();

    const systemUserId = ownerProfile?.id;
    console.log(`[${correlationId}] Usuario autorizado para stock: ${systemUserId || 'No encontrado'}`);

    // 3. Obtener el Access Token desencriptado
    const { data: decrypted } = await supabaseClient
      .schema("core")
      .rpc("get_credential_by_id", { p_credential_id: cred.id })
      .single();
    if (!decrypted?.access_token)
      throw new Error("No se pudo obtener el Access Token.");

    // 4. Consultar datos reales a Tiendanube
    const tnResponse = await fetch(
      `https://api.tiendanube.com/v1/${storeId}/orders/${resourceId}`,
      {
        headers: {
          Authentication: `bearer ${decrypted.access_token}`,
          "User-Agent": "AppPerPel (admin@appperpel.com)",
        },
      },
    );

    if (!tnResponse.ok)
      throw new Error(`Tiendanube API Error: ${tnResponse.statusText}`);
    const orderData = await tnResponse.json();

    // 5. PROCESAMIENTO

    // --- EVENTO: ORDEN CREADA ---
    if (eventType === "order.created") {
      const { data: existingOrder } = await supabaseClient
        .schema("core")
        .from("orders")
        .select("id")
        .eq("external_reference", resourceId)
        .eq("origin", "TIENDANUBE")
        .maybeSingle();

      if (!existingOrder) {
        // A. Asegurar Cliente
        const customerEmail = orderData.contact_email;
        let { data: customer } = await supabaseClient
          .schema("core")
          .from("customers")
          .select("id")
          .eq("email", customerEmail)
          .eq("account_id", accountId)
          .maybeSingle();

        if (!customer) {
          const { data: newCustomer } = await supabaseClient
            .schema("core")
            .from("customers")
            .insert({
              account_id: accountId,
              business_id: businessId,
              full_name: orderData.contact_name,
              category: "NEW_TN",
              email: customerEmail,
              phone_number: orderData.contact_phone || "",
              doc_type: "96",
              doc_number: orderData.contact_identification || "",
              address: orderData.billing_address || "",
              city: orderData.billing_city || "",
            })
            .select()
            .single();
          customer = newCustomer;
        }

        // B. Crear Orden
        const { data: order, error: orderErr } = await supabaseClient
          .schema("core")
          .from("orders")
          .insert({
            account_id: accountId,
            business_id: businessId,
            client_id: customer?.id,
            total_amount: parseFloat(orderData.total),
            status: orderData.payment_status === "paid" ? "PAID" : "PENDING",
            origin: "TIENDANUBE",
            external_reference: resourceId,
            notes: `Orden TN #${orderData.number}`,
          })
          .select()
          .single();

        if (orderErr) throw orderErr;

        // C. Ítems y DESCUENTO DE STOCK INMEDIATO
        console.log(`[${correlationId}] Procesando ${orderData.products.length} productos para stock...`);
        for (const item of orderData.products) {
          const productId = item.product_id?.toString();
          
          const { data: mapping } = await supabaseClient
            .schema("core")
            .from("inventory_items_tn")
            .select("item_id")
            .eq("tn_product_id", productId)
            .maybeSingle();

          if (mapping) {
            // Guardar item de orden
            await supabaseClient
              .schema("core")
              .from("order_items")
              .insert({
                order_id: order.id,
                account_id: accountId,
                item_id: mapping.item_id,
                quantity: item.quantity,
                unit_price: parseFloat(item.price),
              });

            // Descontar Stock inmediatamente al crear
            const { data: stockResult, error: stockErr } = await supabaseClient.rpc("adjust_stock", {
              p_item_id: mapping.item_id,
              p_business_id: businessId,
              p_account_id: accountId,
              p_quantity_change: -Math.abs(item.quantity),
              p_movement_type: 'RESERVE_OUT',
              p_reason: `VENTA TN #${orderData.number} (ERP ID: ${order.id})`,
              p_user_id: systemUserId || null, // Usamos el OWNER encontrado
            });

            if (stockErr) {
                console.error(`[${correlationId}] ERROR RPC adjust_stock:`, stockErr.message);
            } else {
                console.log(`[${correlationId}] Resultado RPC adjust_stock:`, JSON.stringify(stockResult));
            }
          }
        }

        // D. Si la orden ya viene pagada, registrar pago
        if (orderData.payment_status === "paid") {
          console.log(`[${correlationId}] Registrando pago inmediato para Orden TN #${orderData.number}`);
          await supabaseClient
            .schema("core")
            .from("payments")
            .insert({
              account_id: accountId,
              business_id: businessId,
              order_id: order.id,
              created_by: systemUserId,
              amount: parseFloat(orderData.total),
              payment_method_id: "TIENDANUBE",
              status: "approved",
              payment_type: "online",
            });
        }
      }
    }

    // --- EVENTO: ORDEN PAGADA ---
    if (
      eventType === "order.paid" ||
      (eventType === "order.updated" && orderData.payment_status === "paid")
    ) {
      const { data: order } = await supabaseClient
        .schema("core")
        .from("orders")
        .select("id, status")
        .eq("external_reference", resourceId)
        .eq("origin", "TIENDANUBE")
        .maybeSingle();

      if (order && order.status !== "PAID") {
        console.log(`[${correlationId}] Actualizando orden a PAID y registrando pago diferido.`);
        await supabaseClient
          .schema("core")
          .from("orders")
          .update({ status: "PAID" })
          .eq("id", order.id);

        await supabaseClient
          .schema("core")
          .from("payments")
          .insert({
            account_id: accountId,
            order_id: order.id,
            created_by: systemUserId,
            amount: parseFloat(orderData.total),
            payment_method_id: "TIENDANUBE",
            status: "approved",
            payment_type: "online",
          });
      }
    }

    // 6. Finalizar
    await supabaseClient
      .schema("logs")
      .from("tiendanube_webhook_queue")
      .update({
        status: "PROCESSED",
        processed_at: new Date().toISOString(),
      })
      .eq("id", queue_id);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(`[${correlationId}] ERROR:`, error.message);
    if (queueRecordId) {
      await supabaseClient
        .schema("logs")
        .from("tiendanube_webhook_queue")
        .update({
          status: "ERROR",
          error_log: error.message,
        })
        .eq("id", queueRecordId);
    }
    return new Response(
      JSON.stringify({ success: false, message: error.message }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
