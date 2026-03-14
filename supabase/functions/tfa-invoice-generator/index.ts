import { serve } from "https://deno.land/std@0.131.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.1";

const TFA_API_KEY = "70970"; 

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const tfaHeaders = {
  "Content-Type": "application/json",
  "User-Agent": "PerPel-ERP/1.0",
  "Accept": "application/json"
};

const formatDateTFA = (date: Date) => {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
};

const tfaToIsoDate = (tfaDate: string) => {
  if (!tfaDate || !tfaDate.includes('/')) return null;
  const parts = tfaDate.split('/');
  if (parts.length !== 3) return null;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  let correlationId = crypto.randomUUID();
  let currentOrderId = null;
  let currentAccountId = null;

  const tfaFetch = async (url: string, body: any) => {
    console.log(`[${correlationId}] >>> INICIANDO FETCH a: ${url}`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: tfaHeaders,
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      console.log(`[${correlationId}] <<< RESPUESTA RECIBIDA. Status: ${res.status} ${res.statusText}`);

      const text = await res.text();
      try {
        const parsed = JSON.parse(text);
        if (parsed.error === "S") {
          console.error(`[${correlationId}] Error detectado en respuesta de TFA:`);
          console.error(`- errores: ${JSON.stringify(parsed.errores || [])}`);
        }
        return { json: parsed, status: res.status };
      } catch (e) {
        throw new Error(`Error de formato en TFA (Status: ${res.status})`);
      }
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  };

  try {
    const body = await req.json();
    const { action = 'create', orderId, invoiceOptions = {}, businessId } = body;
    currentOrderId = orderId;

    const getCredentials = async (bId) => {
      console.log(`[${correlationId}] [STEP 1] Buscando asignación para Business: ${bId}`);
      const { data: assign, error: err1 } = await supabase.schema('core').from('business_asign_credentials').select('credential_id').eq('business_id', bId).eq('api_name', 'TUS_FACTURAS_APP').eq('is_active', true).eq('is_deleted', false).maybeSingle();
      if (err1) throw new Error(`Error DB Asignación: ${err1.message}`);
      if (!assign) throw new Error("Sin credencial TFA activa.");

      const { data: cred, error: err2 } = await supabase.schema('core').from('business_credentials').select('*').eq('id', assign.credential_id).eq('is_deleted', false).single();
      if (err2) throw new Error(`Error DB Credencial: ${err2.message}`);
      
      console.log(`[${correlationId}] [STEP 2] Desencriptando para: ${cred.name}`);
      const { data: apiToken } = await supabase.schema('core').rpc('decrypt_token', { encrypted_base64: cred.access_token });
      const { data: userToken } = await supabase.schema('core').rpc('decrypt_token', { encrypted_base64: cred.refresh_token });

      return { apikey: TFA_API_KEY, apitoken: apiToken, usertoken: userToken };
    };

    if (['alicuotas_iva', 'provincias', 'comprobantes_tipos', 'condiciones_venta', 'condiciones_iva', 'documentos_tipos'].includes(action)) {
      const auth = await getCredentials(businessId);
      const { json } = await tfaFetch(`https://www.tusfacturas.app/app/api/v2/tablas_referencia/${action}`, auth);
      return new Response(JSON.stringify(json), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === 'create') {
      const { data: order, error: orderError } = await supabase.schema('core').from('orders').select('*, order_items(*, inventory_items(*)), customers(*), businesses(*), payments(*)').eq('id', orderId).single();
      if (orderError || !order) throw new Error("Orden no encontrada");
      
      currentAccountId = order.account_id;
      const auth = await getCredentials(order.business_id);

      const rawType = String(invoiceOptions.comprobante_tipo).toUpperCase();
      const isFacturaA = rawType === '1' || rawType.includes('FACTURA A');
      const isFacturaB = rawType === '6' || rawType.includes('FACTURA B');
      const isFacturaC = rawType === '11' || rawType.includes('FACTURA C');
      const tfaTipoId = isFacturaA ? 1 : (isFacturaB ? 6 : 11);
      const vatValue = (isFacturaB || isFacturaC) ? 0 : 21;

      // --- DEBUG NOMBRE DEL CLIENTE ---
      console.log(`[${correlationId}] DEBUG: Recibido de Modal: "${invoiceOptions.customer_name}"`);
      console.log(`[${correlationId}] DEBUG: Recibido de Orden: "${order.customer_name}"`);

      const clienteData = {
        documento_tipo: invoiceOptions.customer_doc_type || "OTRO",
        documento_nro: invoiceOptions.customer_doc_type === "OTRO" ? "0" : (invoiceOptions.customer_doc_number || "0"),
        razon_social: invoiceOptions.customer_name || order.customer_name || "Consumidor Final",
        email: order.customers?.email || "",
        domicilio: order.customers?.address || order.businesses?.street || "S/D",
        provincia: order.businesses?.tfa_provincia_id || 1,
        condicion_iva: invoiceOptions.iva_condition_id || 'CF',
        envia_por_mail: "N"
      };

      console.log(`[${correlationId}] DEBUG: Enviando a TFA Razon Social: "${clienteData.razon_social}"`);

      // Mapeo quirúrgico de formas de pago PerPel -> TFA
      const mapPerPelToTFA = (perpelMethod: string) => {
        const m = String(perpelMethod).toUpperCase();
        if (m === 'CASH') return 'Efectivo';
        if (m === 'CARD') return 'Tarjeta de crédito';
        if (m === 'ONLINE') return 'MercadoPago';
        return 'Efectivo';
      };

      let formsPagos = order.payments?.map(p => ({
        descripcion: mapPerPelToTFA(p.payment_method_id),
        importe: parseFloat(p.amount)
      })) || [];

      // Validar que la suma coincida con el total de la factura
      const sumaTotalPagos = formsPagos.reduce((acc, curr) => acc + curr.importe, 0);
      if (formsPagos.length === 0 || Math.abs(sumaTotalPagos - parseFloat(order.total_amount)) > 0.01) {
        formsPagos = [{ descripcion: 'Efectivo', importe: parseFloat(order.total_amount) }];
      }

      // --- CÁLCULO DE ÍTEMS CON PRORRATEO DE DESCUENTOS ---
      const totalOrden = parseFloat(order.total_amount);
      const subtotalItemsRaw = order.order_items.reduce((acc, oi) => acc + (parseFloat(oi.unit_price) * oi.quantity), 0);
      
      // Factor de corrección: si la orden tiene descuentos globales (ej: Tiendanube 3%)
      // lo aplicamos proporcionalmente a cada precio unitario para que la suma sea exacta.
      const factorCorreccion = subtotalItemsRaw > 0 ? (totalOrden / subtotalItemsRaw) : 1;

      console.log(`[${correlationId}] Total Orden: ${totalOrden}, Subtotal Raw: ${subtotalItemsRaw}, Factor: ${factorCorreccion}`);

      const itemsDetalle = order.order_items.map(oi => {
        const precioOriginal = parseFloat(oi.unit_price);
        // Precio unitario ajustado con el descuento de la orden
        const precioAjustado = precioOriginal * factorCorreccion;
        
        // El precio unitario que enviamos a TFA debe ser el final (con IVA incluido para Factura B/C)
        // TFA luego hace el cálculo inverso si es Factura A.
        const unitPriceFinal = isFacturaA ? (precioAjustado / 1.21) : precioAjustado;

        return {
          cantidad: oi.quantity,
          producto: {
            descripcion: oi.inventory_items.name,
            precio_unitario_sin_iva: parseFloat(unitPriceFinal.toFixed(2)),
            alicuota: vatValue,
            codigo: oi.inventory_items.sku || "S/C",
            unidad_bulto: 1
          }
        };
      });

      const today = new Date();
      const formattedDate = formatDateTFA(today);
      
      // Definimos una fecha de vencimiento de pago razonable (ej: hoy mismo o +10 días)
      // para que AFIP/TFA no devuelvan fechas inconsistentes.
      const dueDate = new Date();
      dueDate.setDate(today.getDate() + 10); // 10 días de vencimiento por defecto
      const formattedDueDate = formatDateTFA(dueDate);

      const invoicePayload = {
        ...auth,
        operacion: "V",
        cliente: clienteData,
        comprobante: {
          fecha: formattedDate,
          vencimiento: formattedDueDate,
          operacion: "V",
          tipo: isFacturaA ? "FACTURA A" : (isFacturaB ? "FACTURA B" : "FACTURA C"),
          comprobante_tipo: tfaTipoId,
          punto_venta: String(invoiceOptions.punto_venta || 1).padStart(4, '0'),
          rubro: order.businesses?.tfa_rubro || "Ventas",
          moneda: "PES",
          cotizacion: 1,
          detalle: itemsDetalle,
          condicion_pago: parseInt(invoiceOptions.condicion_pago_id) || 1,
          periodo_facturado_desde: formattedDate,
          periodo_facturado_hasta: formattedDate,
          fecha_vencimiento_pago: formattedDueDate,
          total: totalOrden,
          pagos: {
            formas_pago: formsPagos,
            total: totalOrden
          }
        }
      };

      const { json: invData } = await tfaFetch("https://www.tusfacturas.app/app/api/v2/facturacion/nuevo", invoicePayload);
      if (invData.respuesta === "ERROR" || invData.error === "S") throw new Error(`TFA: ${JSON.stringify(invData.error_details || invData.errores)}`);

      console.log(`[${correlationId}] Factura aprobada. CAE: ${invData.cae}. Vencimiento Pago TFA: ${invData.vencimiento_pago}`);

      let storagePath = null;
      if (invData.comprobante_pdf_url) {
        try {
          const pdfRes = await fetch(invData.comprobante_pdf_url);
          if (pdfRes.ok) {
            const pdfBlob = await pdfRes.blob();
            storagePath = `${order.account_id}/${order.business_id}/invoices/invoice_${invData.comprobante_nro}.pdf`;
            await supabase.storage.from('perpel_data').upload(storagePath, pdfBlob, { contentType: 'application/pdf', upsert: true });
          }
        } catch (e) {}
      }

      await supabase.schema('core').from('invoices').insert({
        account_id: order.account_id, order_id: order.id,
        client_id: order.client_id, business_id: order.business_id,
        total_amount: order.total_amount, arca_cae: invData.cae?.trim() || null,
        cae_vencimiento: tfaToIsoDate(invData.vencimiento_cae),
        cbte_tipo: String(tfaTipoId), punto_venta: parseInt(invoiceOptions.punto_venta),
        cbte_nro: parseInt(invData.comprobante_nro.split('-')[1]) || 0,
        full_pdf_url: storagePath, arca_status: 'APPROVED',
        fch_serv_vto_pago: tfaToIsoDate(invData.vencimiento_pago)
      });

      const condPagoId = parseInt(invoiceOptions.condicion_pago_id);
      const isImmediate = [1, 201, 202].includes(condPagoId);
      if (isImmediate) {
        await supabase.schema('core').from('orders').update({ status: 'PAID' }).eq('id', order.id);
      }

      return new Response(JSON.stringify({ success: true, invoiceId: invData.comprobante_nro, storagePath }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  } catch (error) {
    console.error(`[${correlationId}] ERROR:`, error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
