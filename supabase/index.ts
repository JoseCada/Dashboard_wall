// Supabase Edge Function: market-screener
// Sustituye al scraping directo de Yahoo Finance (que ya exige login/crumb).
// Hace de proxy hacia Financial Modeling Prep, ocultando la API key y
// resolviendo CORS de raíz.

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

// Deno.serve es global en el runtime de Edge Functions, no requiere import.
Deno.serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const tipo = url.searchParams.get("type") || "day_gainers";

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

    // Modo "quote": cotizaciones puntuales para tickers concretos
    // (usado por la Lista de Seguimiento, cuyos tickers no siempre
    // aparecen en gainers/losers/actives).
    if (tipo === "quote") {
      const symbolsParam = url.searchParams.get("symbols");
      if (!symbolsParam) {
        return new Response(
          JSON.stringify({ error: "Falta el parámetro symbols" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const quoteUrl = `https://financialmodelingprep.com/stable/batch-quote?symbols=${encodeURIComponent(
        symbolsParam
      )}&apikey=${apiKey}`;
      const quoteRes = await fetch(quoteUrl);

      if (!quoteRes.ok) {
        throw new Error(`Financial Modeling Prep respondió ${quoteRes.status}`);
      }

      const quoteData = await quoteRes.json();
      const quoteLista = Array.isArray(quoteData) ? quoteData : [quoteData];

      const quoteNormalizado = quoteLista.map((item: any) => {
        const price = Number(item.price) || 0;
        let cambioPct = item.changePercentage ?? item.changesPercentage;

        // Si el endpoint no trae el % directamente, lo calculamos con
        // el cambio absoluto (change) y el precio actual.
        if (cambioPct === undefined || cambioPct === null) {
          const cambioAbs = Number(item.change) || 0;
          const precioAnterior = price - cambioAbs;
          cambioPct = precioAnterior !== 0 ? (cambioAbs / precioAnterior) * 100 : 0;
        }

        return {
          symbol: item.symbol,
          regularMarketPrice: price,
          regularMarketChangePercent: Number(cambioPct) || 0,
        };
      });

      return new Response(JSON.stringify(quoteNormalizado), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Modo screener normal: day_gainers / day_losers / most_actives
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