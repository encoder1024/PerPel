import { serve } from "https://deno.land/std@0.131.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.1";

const ALEGRA_USER = Deno.env.get("ALEGRA_USER");
const ALEGRA_TOKEN = Deno.env.get("ALEGRA_TOKEN");
const ALEGRA_AUTH = btoa(`${ALEGRA_USER}:${ALEGRA_TOKEN}`);

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  let requestBody;
  let correlationId = crypto.randomUUID();

  try {
    requestBody = await req.json();
    const { orderId } = requestBody;

    // 1. Obtener detalles de la orden y el cliente
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*, order_items(*, inventory_items(*)), user_profiles(*)')
      .eq('id', orderId)
      .single();

    if (orderError) throw orderError;

    // 2. Mapear o crear contacto en Alegra (Punto 3)
    let contactId = order.user_profiles.alegra_contact_id;
    if (!contactId) {
      const contactResponse = await fetch("https://api.alegra.com/api/v1/contacts", {
        method: "POST",
        headers: { "Authorization": `Basic ${ALEGRA_AUTH}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: order.user_profiles.full_name,
          identification: order.user_profiles.dni || order.user_profiles.cuil_cuit,
          email: order.user_profiles.email,
          type: ["client"],
        }),
      });
      const contactData = await contactResponse.json();
      contactId = contactData.id;
      // Guardar el ID para futuras facturas
      await supabase.from('user_profiles').update({ alegra_contact_id: contactId }).eq('id', order.client_id);
    }

    // 3. Preparar items para la factura (Punto 4, 5)
    const items = order.order_items.map(oi => ({
      id: oi.inventory_items.alegra_item_id, // Asumimos sincronizados previamente (Punto 4)
      price: oi.unit_price,
      quantity: oi.quantity,
      tax: [{ id: 1 }] // Configurar lógica de impuestos real (Punto 5)
    }));

    // 4. Crear factura electrónica en Alegra (Punto 2)
    const invoiceResponse = await fetch("https://api.alegra.com/api/v1/invoices", {
      method: "POST",
      headers: { "Authorization": `Basic ${ALEGRA_AUTH}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        date: new Date().toISOString().split('T')[0],
        dueDate: new Date().toISOString().split('T')[0],
        client: contactId,
        items: items,
        paymentMethod: "cash", // Mapear según order.payment_method
        stamp: { generateStamp: true } // Para factura electrónica real
      }),
    });

    const invoiceData = await invoiceResponse.json();

    if (!invoiceResponse.ok) {
      // Punto 9: Queue de errores
      await supabase.from('pending_invoices').insert({ order_id: orderId, payload: requestBody, last_error: JSON.stringify(invoiceData) });
      throw new Error("Error en API de Alegra: " + JSON.stringify(invoiceData));
    }

    // 5. Guardar resultado en core.invoices (Cumpliendo con ANEXO I)
    await supabase.from('invoices').insert({
      account_id: order.account_id,
      order_id: orderId,
      client_id: order.client_id,
      business_id: order.business_id, // Campo obligatorio en el esquema
      total_amount: order.total_amount,
      arca_cae: invoiceData.stamp?.cufe || invoiceData.id,
      full_pdf_url: invoiceData.pdfUrl,
      cbte_nro: invoiceData.number,
      arca_status: 'APPROVED',
      cbte_tipo: '11' // Factura C por defecto, mapear según sea necesario
    });

    // 6. Log detailed API activity
    await supabase.from('api_logs', { schema: 'logs' }).insert({
      account_id: order.account_id,
      api_name: 'INVOICING_API',
      endpoint: '/invoices',
      order_id: orderId,
      operation_name: 'CREATE_INVOICE_ALEGRA',
      correlation_id: correlationId,
      request_payload: requestBody,
      response_payload: invoiceData,
      status: "SUCCESS"
    });

    return new Response(JSON.stringify({ success: true, invoiceId: invoiceData.id }), { status: 200 });

  } catch (error) {
    console.error(error);
    await supabase.from('api_logs', { schema: 'logs' }).insert({
      api_name: 'INVOICING_API',
      operation_name: 'CREATE_INVOICE_ERROR',
      correlation_id: correlationId,
      request_payload: requestBody,
      response_payload: { error: error.message },
      status: "ERROR"
    });
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
