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

    const body = await req.json().catch(() => ({}));
    const { businessId } = body;

    if (!businessId) {
        return new Response(JSON.stringify({ success: false, message: 'businessId es requerido.' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    // 1. Obtener Credenciales
    const { data: creds, error: credsError } = await supabaseClient
      .schema('core')
      .rpc('get_business_credentials', { 
        p_business_id: businessId, 
        p_api_name: 'TIENDANUBE' 
      })
    
    const cred = creds?.[0]
    if (credsError || !cred) throw new Error('Credenciales no encontradas.');

    // 2. Llamar a Tiendanube API (Datos Crudos)
    const response = await fetch(`https://api.tiendanube.com/v1/${cred.external_user_id}/products`, {
      headers: {
        'Authentication': `bearer ${cred.access_token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'AppPerPel-Debug (admin@appperpel.com)'
      }
    })

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Tiendanube API Error: ${errText}`);
    }

    const products = await response.json();

    // 3. Devolver TODO el JSON para análisis exhaustivo
    return new Response(JSON.stringify({ 
        success: true, 
        count: products.length,
        raw_data: products 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
