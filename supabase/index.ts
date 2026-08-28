// Supabase Edge Function: market-screener
// Sustituye al scraping directo de Yahoo Finance (que ya exige login/crumb).
// Hace de proxy hacia Financial Modeling Prep, ocultando la API key y
// resolviendo CORS de raíz.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mapeo de los valores que ya usa tu <select id="sel-screener"> a los
// endpoints "stable" de Financial Modeling Prep.
const FMP_ENDPOINTS: Record<string, string> = {
  day_gainers: "biggest-gainers",
  day_losers: "biggest-losers",
  most_actives: "most-active",
};

serve(async (req) => {
  // Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const tipo = url.searchParams.get("type") || "day_gainers";
    const count = Math.min(
      Math.max(parseInt(url.searchParams.get("count") || "50", 10), 1),
      100
    );

    const endpoint = FMP_ENDPOINTS[tipo];
    if (!endpoint) {
      return new Response(
        JSON.stringify({ error: `Tipo de screener no válido: ${tipo}` }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const apiKey = Deno.env.get("FMP_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Falta configurar el secret FMP_API_KEY" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const fmpUrl = `https://financialmodelingprep.com/stable/${endpoint}?apikey=${apiKey}`;
    const fmpRes = await fetch(fmpUrl);

    if (!fmpRes.ok) {
      throw new Error(`Financial Modeling Prep respondió ${fmpRes.status}`);
    }

    const data = await fmpRes.json();
    const lista = Array.isArray(data) ? data : [];

    // Normalizamos al mismo formato que ya esperaba tu app.js
    // (regularMarketPrice / regularMarketChangePercent), para no tener
    // que tocar el resto del código.
    const normalizado = lista.slice(0, count).map((item: any) => {
      let cambio = item.changesPercentage ?? item.changePercentage ?? 0;
      if (typeof cambio === "string") {
        cambio = parseFloat(cambio.replace("%", ""));
      }
      return {
        symbol: item.symbol,
        regularMarketPrice: Number(item.price) || 0,
        regularMarketChangePercent: Number(cambio) || 0,
      };
    });

    return new Response(JSON.stringify(normalizado), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});