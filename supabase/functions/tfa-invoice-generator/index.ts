import { serve } from "https://deno.land/std@0.131.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.1";

const TFA_API_KEY = "70970"; 

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// User-Agent simplificado para evitar bloqueos
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
    
    // Timeout de 15 segundos para no dejar la función colgada
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
      console.log(`[${correlationId}] <<< RESPUESTA RECIBIDA. Status: ${res.status}`);

      const text = await res.text();
      try {
        const parsed = JSON.parse(text);
        console.log(`[${correlationId}] JSON Keys: ${Object.keys(parsed).join(', ')}`);
        // Log parcial de los datos si es un array o tiene una propiedad provincias
        if (parsed.provincias) console.log(`[${correlationId}] Provincias count: ${parsed.provincias.length}`);
        return { json: parsed, status: res.status };
      } catch (e) {
        console.error(`[${correlationId}] Error parsing JSON. Recibido: ${text.substring(0, 200)}`);
        throw new Error(`Error de formato en TFA (Status: ${res.status})`);
      }
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error("Tiempo de espera agotado al conectar con TusFacturasApp (Timeout 15s)");
      }
      throw err;
    }
  };

  try {
    const body = await req.json();
    const { action = 'create', orderId, invoiceOptions = {}, businessId } = body;
    currentOrderId = orderId;

    const getCredentials = async (bId) => {
      console.log(`[${correlationId}] [STEP 1] Buscando asignación para Business: ${bId}`);
      
      const { data: assign, error: err1 } = await supabase
        .schema('core')
        .from('business_asign_credentials')
        .select('credential_id')
        .eq('business_id', bId)
        .eq('api_name', 'TUS_FACTURAS_APP')
        .eq('is_active', true)
        .eq('is_deleted', false)
        .maybeSingle();

      if (err1) throw new Error(`Error DB Asignación: ${err1.message}`);
      if (!assign) throw new Error("No hay credencial TFA activa.");

      const { data: cred, error: err2 } = await supabase
        .schema('core')
        .from('business_credentials')
        .select('*')
        .eq('id', assign.credential_id)
        .eq('is_deleted', false)
        .single();

      if (err2) throw new Error(`Error DB Credencial: ${err2.message}`);

      console.log(`[${correlationId}] [STEP 2] Desencriptando para: ${cred.name}`);
      
      const { data: apiToken } = await supabase.schema('core').rpc('decrypt_token', { encrypted_base64: cred.access_token });
      const { data: userToken } = await supabase.schema('core').rpc('decrypt_token', { encrypted_base64: cred.refresh_token });

      if (!apiToken || !userToken) throw new Error("Tokens vacíos tras desencriptación.");

      console.log(`[${correlationId}] [STEP 3] Credenciales OK.`);
      return { apikey: TFA_API_KEY, apitoken: apiToken, usertoken: userToken };
    };

    // --- TABLAS DE REFERENCIA ---
    const refTables = ['alicuotas_iva', 'provincias', 'comprobantes_tipos', 'condiciones_venta', 'condiciones_iva'];
    if (refTables.includes(action)) {
      const auth = await getCredentials(businessId);
      const { json } = await tfaFetch(`https://www.tusfacturas.app/app/api/v2/tablas_referencia/${action}`, auth);
      return new Response(JSON.stringify(json), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // --- CREAR COMPROBANTE ---
    if (action === 'create') {
      const { data: order, error: orderError } = await supabase
        .schema('core')
        .from('orders')
        .select('*, order_items(*, inventory_items(*)), customers(*), businesses(*), core.payments(*)')
        .eq('id', orderId)
        .single();

      if (orderError || !order) throw new Error("Orden no encontrada");
      currentAccountId = order.account_id;
      const auth = await getCredentials(order.business_id);

      const isFacturaA = String(invoiceOptions.comprobante_tipo) === '1';

      // 1. Cliente
      const getTFAClientId = async (customer) => {
        if (customer?.tfa_client_id) return customer.tfa_client_id;
        const { json: data } = await tfaFetch("https://www.tusfacturas.app/app/api/v2/clientes/nuevo", {
          ...auth,
          cliente: {
            nombre: invoiceOptions.customer_name || order.customer_name || "Consumidor Final",
            documento_tipo: (invoiceOptions.customer_doc_type || order.customer_doc_type) === '80' ? 'CUIT' : 'DNI',
            documento_numero: invoiceOptions.customer_doc_number || order.customer_doc_number || "0",
            provincia: order.businesses?.tfa_provincia_id || 1, 
            email: customer?.email || "",
            domicilio: customer?.address || order.businesses?.street || "S/D",
            condicion_iva: invoiceOptions.iva_condition_id || 'CF',
            envia_por_mail: "N"
          }
        });
        if (data.respuesta === "ERROR") throw new Error(`TFA Cliente: ${data.errores?.join(", ")}`);
        if (customer?.id) await supabase.schema('core').from('customers').update({ tfa_client_id: data.cliente_id }).eq('id', customer.id);
        return data.cliente_id;
      };

      const tfaClientId = await getTFAClientId(order.customers);

      // 2. Items
      const vatValue = invoiceOptions.iva_id === "5" ? 21 : (invoiceOptions.iva_id === "4" ? 10.5 : 0);
      const items = order.order_items.map(oi => {
        const finalPrice = oi.unit_price;
        const netPrice = isFacturaA ? (finalPrice / (1 + (vatValue / 100))) : finalPrice;
        return {
          cantidad: oi.quantity,
          producto: {
            descripcion: oi.inventory_items.name,
            precio_unitario_sin_iva: parseFloat(netPrice.toFixed(2)),
            alicuota: vatValue,
            codigo: oi.inventory_items.sku || "S/C"
          }
        };
      });

      // 3. Payload
      const today = new Date();
      const invoicePayload = {
        ...auth,
        operacion: "V",
        comprobante: {
          fecha: formatDateTFA(today),
          comprobante_tipo: parseInt(invoiceOptions.comprobante_tipo) || 11,
          punto_venta: String(invoiceOptions.punto_venta).padStart(4, '0'),
          cliente_id: tfaClientId,
          rubro: order.businesses?.tfa_rubro || "Ventas",
          moneda: "PES",
          cotizacion: 1,
          detalle: items,
          condicion_pago: parseInt(invoiceOptions.condicion_pago_id) || 1,
          periodo_facturado_desde: formatDateTFA(today),
          periodo_facturado_hasta: formatDateTFA(today),
          fecha_vencimiento_pago: formatDateTFA(today),
          total: parseFloat(order.total_amount),
          pagos: {
            formas_pago: order.payments?.map(p => ({ descripcion: p.payment_method_id || "Efectivo", importe: parseFloat(p.amount) })) || [{ descripcion: "Efectivo", importe: parseFloat(order.total_amount) }],
            total: parseFloat(order.total_amount)
          },
          observaciones: invoiceOptions.observaciones || ""
        }
      };

      const { json: invData } = await tfaFetch("https://www.tusfacturas.app/app/api/v2/facturacion/nuevo", invoicePayload);
      
      if (invData.respuesta === "ERROR") throw new Error(`TFA Factura: ${invData.errores?.join(", ")}`);

      // 4. PDF y DB
      let storagePath = null;
      if (invData.cae_pdf) {
        const pdfRes = await fetch(invData.cae_pdf);
        if (pdfRes.ok) {
          const pdfBlob = await pdfRes.blob();
          storagePath = `${order.account_id}/${order.business_id}/invoices/invoice_${invData.comprobante_numero}.pdf`;
          await supabase.storage.from('perpel_data').upload(storagePath, pdfBlob, { contentType: 'application/pdf', upsert: true });
        }
      }

      await supabase.schema('core').from('invoices').insert({
        account_id: order.account_id, order_id: order.id,
        client_id: order.customers?.id || order.client_id,
        business_id: order.business_id, total_amount: order.total_amount,
        arca_cae: invData.cae, cae_vencimiento: invData.cae_vencimiento,
        cbte_tipo: String(invoiceOptions.comprobante_tipo),
        punto_venta: parseInt(invoiceOptions.punto_venta),
        cbte_nro: invData.comprobante_numero,
        full_pdf_url: storagePath, arca_status: 'APPROVED'
      });

      return new Response(JSON.stringify({ success: true, invoiceId: invData.comprobante_id }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

  } catch (error) {
    console.error(`[${correlationId}] ERROR:`, error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
