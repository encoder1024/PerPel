import { serve } from "https://deno.land/std@0.131.0/http/server.ts";

const ALEGRA_USER = Deno.env.get("ALEGRA_USER");
const ALEGRA_TOKEN = Deno.env.get("ALEGRA_TOKEN");
const ALEGRA_AUTH = btoa(`${ALEGRA_USER}:${ALEGRA_TOKEN}`);

serve(async (req) => {
  try {
    const { invoiceId } = await req.json();

    // Consultar el PDF de la factura en Alegra (Punto 6 de la estrategia)
    const response = await fetch(`https://api.alegra.com/api/v1/invoices/${invoiceId}`, {
      method: "GET",
      headers: { "Authorization": `Basic ${ALEGRA_AUTH}`, "Content-Type": "application/json" }
    });

    if (!response.ok) throw new Error("Could not retrieve PDF from Alegra");

    const invoiceData = await response.json();

    // Serve PDF URL or redirect
    return new Response(JSON.stringify({ pdfUrl: invoiceData.pdfUrl }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
