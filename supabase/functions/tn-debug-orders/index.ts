import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { businessId } = await req.json()
    if (!businessId) throw new Error('businessId es requerido.')

    // 1. Obtener Credenciales
    const { data: creds, error: credsError } = await supabaseClient
      .schema('core')
      .rpc('get_business_credentials', { 
        p_business_id: businessId, 
        p_api_name: 'TIENDANUBE' 
      })
    
    const cred = creds?.[0]
    if (credsError || !cred) throw new Error('Credenciales no encontradas.');

    // 2. Consultar últimas órdenes a Tiendanube
    const response = await fetch(`https://api.tiendanube.com/v1/${cred.external_user_id}/orders?per_page=20`, {
      headers: {
        'Authentication': `bearer ${cred.access_token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'AppPerPel-Monitor (admin@appperpel.com)'
      }
    })

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Error Tiendanube API: ${errText}`);
    }

    const tnOrders = await response.json();

    // 3. Cruzar con el ERP para ver cuáles ya existen
    const tnOrderIds = tnOrders.map(o => o.id.toString());
    
    const { data: erpOrders } = await supabaseClient
        .schema('core')
        .from('orders')
        .select('external_reference')
        .in('external_reference', tnOrderIds)
        .eq('origin', 'TIENDANUBE');

    const erpRefs = new Set(erpOrders?.map(o => o.external_reference) || []);

    // 4. Preparar respuesta
    const ordersResult = tnOrders.map(o => ({
        id: o.id,
        number: o.number,
        contact_name: o.contact_name,
        total: o.total,
        payment_status: o.payment_status,
        created_at: o.created_at,
        exists_in_erp: erpRefs.has(o.id.toString())
    }));

    return new Response(JSON.stringify({ 
        success: true, 
        orders: ordersResult 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error("Error en tn-debug-orders:", error.message);
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
