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
// --- Cálculo de MACD / RSI y detección de divergencias ---
function calcularEMA(precios: number[], periodo: number): number[] {
  const k = 2 / (periodo + 1);
  const ema: number[] = [precios[0]];
  for (let i = 1; i < precios.length; i++) {
    ema.push(precios[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

function calcularRSI(precios: number[], periodo = 14): number[] {
  const rsi: number[] = new Array(precios.length).fill(50);
  if (precios.length <= periodo) return rsi;

  let gainSum = 0, lossSum = 0;
  for (let i = 1; i <= periodo; i++) {
    const diff = precios[i] - precios[i - 1];
    if (diff >= 0) gainSum += diff; else lossSum -= diff;
  }
  let avgGain = gainSum / periodo;
  let avgLoss = lossSum / periodo;
  rsi[periodo] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = periodo + 1; i < precios.length; i++) {
    const diff = precios[i] - precios[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (periodo - 1) + gain) / periodo;
    avgLoss = (avgLoss * (periodo - 1) + loss) / periodo;
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return rsi;
}

function encontrarExtremosGenerico(valores: number[], tipo: "min" | "max"): number[] {
  const indices: number[] = [];
  for (let i = 3; i < valores.length - 3; i++) {
    const ventana = valores.slice(i - 3, i + 4);
    const esExtremo = tipo === "min"
      ? valores[i] === Math.min(...ventana)
      : valores[i] === Math.max(...ventana);
    if (esExtremo) indices.push(i);
  }
  return indices;
}

function detectarDivergenciaGenerica(precios: number[], indicador: number[]): string | null {
  const desde = Math.max(0, precios.length - 60);
  const preciosRecientes = precios.slice(desde);
  const indicadorReciente = indicador.slice(desde);

  const minimos = encontrarExtremosGenerico(preciosRecientes, "min");
  if (minimos.length >= 2) {
    const [i1, i2] = minimos.slice(-2);
    if (preciosRecientes[i2] < preciosRecientes[i1] && indicadorReciente[i2] > indicadorReciente[i1]) {
      return "ALCISTA";
    }
  }

  const maximos = encontrarExtremosGenerico(preciosRecientes, "max");
  if (maximos.length >= 2) {
    const [i1, i2] = maximos.slice(-2);
    if (preciosRecientes[i2] > preciosRecientes[i1] && indicadorReciente[i2] < indicadorReciente[i1]) {
      return "BAJISTA";
    }
  }

  return null;
}

const FMP_ENDPOINTS: Record<string, string> = {
  day_gainers: "biggest-gainers",
  day_losers: "biggest-losers",
  most_actives: "most-active",
};

// Tercera fuente EXTRA opcional: Alpha Vantage (gratis, 25 llamadas/día
// en total). Si se agota la cuota diaria, simplemente no aporta tickers
// extra ese día - no rompe nada.
const AV_CAMPO: Record<string, string> = {
  day_gainers: "top_gainers",
  day_losers: "top_losers",
  most_actives: "most_actively_traded",
};

async function intentarAlphaVantageExtra(tipo: string) {
  const avKey = Deno.env.get("ALPHA_VANTAGE_API_KEY");
  if (!avKey) return [];

  try {
    const avUrl = `https://www.alphavantage.co/query?function=TOP_GAINERS_LOSERS&apikey=${avKey}`;
    const res = await fetch(avUrl);
    if (!res.ok) return [];

    const data = await res.json();
    const campo = AV_CAMPO[tipo];
    const items = data?.[campo];
    if (!Array.isArray(items)) return []; // p.ej. cuota agotada, viene "Note" en vez de datos

    return items
      .map((it: any) => ({
        symbol: it.ticker,
        price: parseFloat(it.price),
        changesPercentage: parseFloat(String(it.change_percentage).replace("%", "")),
      }))
      .filter((it: any) => it.symbol && !isNaN(it.price));
  } catch (_) {
    return [];
  }
}

// Fuente EXTRA opcional (best-effort): Yahoo Finance no tiene soporte
// oficial y ya nos falló una vez en este proyecto (por eso migramos a
// FMP). La usamos solo para sumar tickers que FMP no traiga; si falla,
// no rompe nada, simplemente no aporta tickers extra.
async function intentarYahooExtra(scrId: string, count: number) {
  try {
    const yahooUrl = `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=false&scrIds=${scrId}&count=${count}`;
    const res = await fetch(yahooUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const quotes = data?.finance?.result?.[0]?.quotes || [];
    return quotes
      .filter((q: any) => q.symbol && typeof q.regularMarketPrice === "number")
      .map((q: any) => ({
        symbol: q.symbol,
        price: q.regularMarketPrice,
        changesPercentage: q.regularMarketChangePercent || 0,
      }));
  } catch (_) {
    return [];
  }
}

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

      const symbolsArray = symbolsParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 30); // límite de seguridad para no disparar la cuota diaria

      const resultados = await Promise.all(
        symbolsArray.map(async (sym) => {
          try {
            const singleUrl = `https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(
              sym
            )}&apikey=${apiKey}`;
            const singleRes = await fetch(singleUrl);
            if (!singleRes.ok) {
              const cuerpoError = await singleRes.text();
              console.error(`quote individual de ${sym} respondió ${singleRes.status}: ${cuerpoError.slice(0, 200)}`);
              return null;
            }

            const singleData = await singleRes.json();
            const item = Array.isArray(singleData) ? singleData[0] : singleData;
            if (!item) {
              console.error(`quote individual de ${sym}: respuesta vacía`, JSON.stringify(singleData).slice(0, 200));
              return null;
            }

            const price = Number(item.price) || 0;
            let cambioPct = item.changePercentage ?? item.changesPercentage;
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
          } catch (_) {
            return null;
          }
        })
      );

      const quoteNormalizado = resultados.filter((r) => r !== null);

      return new Response(JSON.stringify(quoteNormalizado), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Modo "universo": listado completo de NASDAQ + NYSE/NYSE American/ARCA
    // (ficheros públicos de NASDAQ Trader, sin clave ni límite de cuota).
    // Se usa para buscar cualquier ticker real, sin depender de que
    // aparezca en el top de ganadores/perdedores del día.
    if (tipo === "universo") {
      try {
        const [nasdaqRes, otherRes] = await Promise.all([
          fetch("https://www.nasdaqtrader.com/dynamic/symdir/nasdaqlisted.txt"),
          fetch("https://www.nasdaqtrader.com/dynamic/symdir/otherlisted.txt"),
        ]);

        const parsear = (texto: string, esNasdaq: boolean) => {
          const lineas = texto.split("\n").slice(1); // quita la cabecera
          const resultado: { symbol: string; name: string }[] = [];
          for (const linea of lineas) {
            if (!linea || linea.startsWith("File Creation Time")) continue;
            const campos = linea.split("|");
            const symbol = esNasdaq ? campos[0] : campos[0];
            const name = campos[1];
            const testIssue = esNasdaq ? campos[3] : campos[4];
            if (!symbol || !name) continue;
            if (testIssue === "Y") continue; // descarta issues de prueba
            resultado.push({ symbol: symbol.trim(), name: name.trim() });
          }
          return resultado;
        };

        const nasdaqTxt = nasdaqRes.ok ? await nasdaqRes.text() : "";
        const otherTxt = otherRes.ok ? await otherRes.text() : "";

        const universo = [
          ...parsear(nasdaqTxt, true),
          ...parsear(otherTxt, false),
        ];

        return new Response(JSON.stringify(universo), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (error) {
        return new Response(
          JSON.stringify({ error: `No se pudo obtener el universo: ${(error as Error).message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // MODO DEBUG TEMPORAL: comprobar si el perfil de empresa (con fecha de
    // salida a bolsa) está disponible en el plan gratuito
    if (tipo === "debug_historico") {
      const symbol = url.searchParams.get("symbol") || "AAPL";
      const histUrl = `https://financialmodelingprep.com/stable/historical-price-eod/light?symbol=${symbol}&apikey=${apiKey}`;
      const hRes = await fetch(histUrl);
      const hData = await hRes.json();
      const lista = Array.isArray(hData) ? hData : [];
      return new Response(
        JSON.stringify({
          status: hRes.status,
          num_dias: lista.length,
          primero: lista[0],
          ultimo: lista[lista.length - 1],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (tipo === "debug_profile") {
      const symbol = url.searchParams.get("symbol") || "AAPL";
      const profileUrl = `https://financialmodelingprep.com/stable/profile?symbol=${symbol}&apikey=${apiKey}`;
      const pRes = await fetch(profileUrl);
      const pData = await pRes.json();
      const item = Array.isArray(pData) ? pData[0] : pData;
      return new Response(
        JSON.stringify({
          status: pRes.status,
          isEtf: item?.isEtf,
          isFund: item?.isFund,
          isAdr: item?.isAdr,
          marketCap: item?.marketCap,
          industry: item?.industry,
          sector: item?.sector,
          country: item?.country,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // MODO DEBUG TEMPORAL: comprobar si la página principal trae volumen
    // y/o precio objetivo a 12 meses
    if (tipo === "debug_google_volumen") {
      const symbol = url.searchParams.get("symbol") || "AAPL";
      const googleUrl = `https://www.google.com/finance/quote/${symbol}:NASDAQ`;
      const gRes = await fetch(googleUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        },
      });
      const gBody = await gRes.text();
      const idxVolumen = gBody.indexOf(">Volume<");
      const tablaEstadisticas = idxVolumen >= 0 ? gBody.slice(idxVolumen, idxVolumen + 2000) : null;
      return new Response(
        JSON.stringify({ status: gRes.status, tabla_estadisticas: tablaEstadisticas }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // MODO DEBUG TEMPORAL: comprobar la página de valoraciones de analistas
    if (tipo === "debug_google_analistas") {
      const symbol = url.searchParams.get("symbol") || "MDB";
      const googleUrl = `https://www.google.com/finance/beta/quote/${symbol}:NASDAQ?hl=es&tab=analysis`;
      const gRes = await fetch(googleUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        },
      });
      const gBody = await gRes.text();
      const claves = ["analistas", "analyst", "Compra fuerte", "Strong Buy", "recommendation"];
      const encontradas: Record<string, any> = {};
      for (const clave of claves) {
        const idx = gBody.indexOf(clave);
        encontradas[clave] = idx >= 0 ? gBody.slice(Math.max(0, idx - 150), idx + 400) : null;
      }
      return new Response(
        JSON.stringify({
          status: gRes.status,
          longitud_html: gBody.length,
          encontradas,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // MODO DEBUG TEMPORAL: comprobar si Google Finance trae el precio en
    // el HTML crudo (sin ejecutar JS), o si haría falta un navegador real.
    if (tipo === "debug_google") {
      const symbol = url.searchParams.get("symbol") || "AAPL";
      const googleUrl = `https://www.google.com/finance/beta/quote/${symbol}:NASDAQ?hl=es&tab=analysis`;
      const gRes = await fetch(googleUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        },
      });
      const gBody = await gRes.text();
      const idxAnalyst = gBody.toLowerCase().indexOf("compra fuerte");
      const contexto = idxAnalyst >= 0 ? gBody.slice(idxAnalyst - 100, idxAnalyst + 800) : null;
      return new Response(
        JSON.stringify({
          status: gRes.status,
          longitud_html: gBody.length,
          encontrado: idxAnalyst >= 0,
          contexto,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // "Más Activos" ahora muestra tu propia lista de broker (Revolut) en vez
    // del listado genérico de FMP, usando los precios que scrapea a diario
    // la función scrape-google-finance.
    if (tipo === "most_actives") {
      const authHeader = req.headers.get("Authorization") || "";
      const apiKeysJson = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
      let publishableKey = "";
      if (apiKeysJson) {
        try {
          const keys = JSON.parse(apiKeysJson);
          publishableKey = Object.values(keys)[0] as string;
        } catch (_) {
          // se deja vacío, la petición fallará y se capturará abajo
        }
      }

      const SUPABASE_URL_INTERNO = Deno.env.get("SUPABASE_URL");
      const headersReq = { apikey: publishableKey, Authorization: authHeader };

      const [tickersRes, preciosRes] = await Promise.all([
        fetch(`${SUPABASE_URL_INTERNO}/rest/v1/broker_tickers?select=ticker`, { headers: headersReq }),
        fetch(`${SUPABASE_URL_INTERNO}/rest/v1/google_finance_prices?select=*`, { headers: headersReq }),
      ]);

      const tickersData = tickersRes.ok ? await tickersRes.json() : [];
      const preciosData = preciosRes.ok ? await preciosRes.json() : [];
      const mapaPrecios: Record<string, any> = {};
      preciosData.forEach((p: any) => { mapaPrecios[p.ticker] = p; });

      // Divergencias MACD/RSI: SOLO LECTURA de lo que ya calculó el escaneo
      // diario (scan-macd-divergence). Cero llamadas nuevas a FMP aquí.
      const simbolosBroker = tickersData.map((t: any) => t.ticker);
      const divergenciasBroker: Record<string, any> = {};

      if (simbolosBroker.length > 0) {
        try {
          const cacheDivRes = await fetch(
            `${SUPABASE_URL_INTERNO}/rest/v1/divergence_cache?ticker=in.(${simbolosBroker.join(",")})&select=*`,
            { headers: headersReq }
          );
          if (cacheDivRes.ok) {
            const cacheDivData = await cacheDivRes.json();
            cacheDivData.forEach((c: any) => { divergenciasBroker[c.ticker] = c; });
          }
        } catch (_) {
          // sin caché disponible, se mostrará sin divergencia por ahora
        }
      }

      const listaBroker = tickersData
        .map((t: any) => {
          const info = mapaPrecios[t.ticker];
          const divergencia = divergenciasBroker[t.ticker];
          return {
            symbol: t.ticker,
            name: "",
            regularMarketPrice: info ? Number(info.precio) || 0 : 0,
            regularMarketChangePercent: info ? Number(info.cambio_pct) || 0 : 0,
            divergenciaMacd: divergencia?.divergencia_macd || null,
            divergenciaRsi: divergencia?.divergencia_rsi || null,
          };
        })
        .sort((a: any, b: any) => a.symbol.localeCompare(b.symbol));

      return new Response(JSON.stringify(listaBroker), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // MODO DEBUG TEMPORAL: comprobar si la pestaña de análisis (analistas)
    // de Google Finance trae los datos en el HTML crudo.
    if (tipo === "debug_google_analistas") {
      const symbol = url.searchParams.get("symbol") || "MDB";
      const gUrl = `https://www.google.com/finance/beta/quote/${symbol}:NASDAQ?tab=analysis`;
      const gRes = await fetch(gUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        },
      });
      const gBody = await gRes.text();
      const idx = gBody.toLowerCase().indexOf("strong buy");
      const idxEs = gBody.toLowerCase().indexOf("compra fuerte");
      const contexto = idx >= 0
        ? gBody.slice(idx - 100, idx + 600)
        : (idxEs >= 0 ? gBody.slice(idxEs - 100, idxEs + 600) : null);
      return new Response(
        JSON.stringify({
          status: gRes.status,
          longitud_html: gBody.length,
          encontrado: idx >= 0 || idxEs >= 0,
          contexto,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Modo screener normal: day_gainers / day_losers
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
      if (fmpRes.status === 429) {
        return new Response(
          JSON.stringify({
            error: "Has agotado el límite de peticiones de tu plan de FMP por ahora. Espera unos minutos (o hasta mañana si es el límite diario) y vuelve a intentarlo.",
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`Financial Modeling Prep respondió ${fmpRes.status}`);
    }

    const data = await fmpRes.json();
    // Solo FMP: Yahoo y Alpha Vantage se probaron como fuentes extra, pero
    // devolvían datos incorrectos (precios y % de cambio erróneos), así que
    // se han quitado del listado de ganadores/perdedores.
    const lista = Array.isArray(data) ? data : [];

    // Enriquecimiento con perfil de empresa (capitalización real, volumen,
    // fecha de salida a bolsa). Este endpoint SÍ funciona por ticker
    // individual incluso para small caps, pero no en lote, así que usamos
    // una caché propia de 24h en Supabase para no gastar cuota de FMP en
    // cada refresco del Scanner.
    const authHeaderPerfil = req.headers.get("Authorization") || "";
    const apiKeysJsonPerfil = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
    let publishableKeyPerfil = "";
    if (apiKeysJsonPerfil) {
      try {
        const keys = JSON.parse(apiKeysJsonPerfil);
        publishableKeyPerfil = Object.values(keys)[0] as string;
      } catch (_) {
        // se deja vacío, el fetch a la caché fallará y se seguirá sin ella
      }
    }
    const SUPABASE_URL_PERFIL = Deno.env.get("SUPABASE_URL");
    const headersPerfil = { apikey: publishableKeyPerfil, Authorization: authHeaderPerfil };

    const simbolos = lista.map((it: any) => it.symbol);
    const perfiles: Record<string, any> = {};

    if (simbolos.length > 0 && SUPABASE_URL_PERFIL) {
      try {
        const cacheRes = await fetch(
          `${SUPABASE_URL_PERFIL}/rest/v1/fmp_profile_cache?ticker=in.(${simbolos.join(",")})&select=*`,
          { headers: headersPerfil }
        );
        if (cacheRes.ok) {
          const cacheData = await cacheRes.json();
          cacheData.forEach((c: any) => { perfiles[c.ticker] = c; });
        }
      } catch (_) {
        // sin caché disponible, se pedirá todo directo a FMP
      }
    }

    const hace24h = Date.now() - 24 * 60 * 60 * 1000;
    const faltantes = simbolos.filter((s: string) => {
      const p = perfiles[s];
      if (!p) return true;
      return new Date(p.updated_at).getTime() < hace24h;
    });

    if (faltantes.length > 0) {
      // Límite de seguridad: no pedir perfil de más de 10 tickers nuevos
      // en una sola petición, para no disparar el límite de velocidad de FMP.
      const aProcesar = faltantes.slice(0, 20);
      const resultadosPerfil: any[] = [];
      const TAMANO_LOTE = 3;

      for (let i = 0; i < aProcesar.length; i += TAMANO_LOTE) {
        const lote = aProcesar.slice(i, i + TAMANO_LOTE);
        const resultadosLote = await Promise.all(
          lote.map(async (sym: string) => {
            try {
              const pUrl = `https://financialmodelingprep.com/stable/profile?symbol=${encodeURIComponent(sym)}&apikey=${apiKey}`;
              const pRes = await fetch(pUrl);
              if (!pRes.ok) {
                // Se guarda igualmente como "sin datos" para no reintentarlo
                // en cada carga (gasta cuota sin necesidad, ej. fondos de
                // inversión que no tienen perfil de empresa en FMP).
                return { ticker: sym, market_cap: null, volume: null, average_volume: null, ipo_date: null, is_fund: null };
              }
              const pData = await pRes.json();
              const item = Array.isArray(pData) ? pData[0] : pData;
              if (!item) {
                return { ticker: sym, market_cap: null, volume: null, average_volume: null, ipo_date: null, is_fund: null };
              }
              return {
                ticker: sym,
                market_cap: Number(item.marketCap) || null,
                volume: Number(item.volume) || null,
                average_volume: Number(item.averageVolume) || null,
                ipo_date: item.ipoDate || null,
                is_fund: item.isFund === true,
              };
            } catch (_) {
              return { ticker: sym, market_cap: null, volume: null, average_volume: null, ipo_date: null, is_fund: null };
            }
          })
        );
        resultadosPerfil.push(...resultadosLote);
        // Pausa entre lotes para no superar el límite de velocidad
        if (i + TAMANO_LOTE < aProcesar.length) {
          await new Promise((r) => setTimeout(r, 800));
        }
      }

      for (const r of resultadosPerfil) {
        if (!r) continue;
        const registro = { ...r, updated_at: new Date().toISOString() };
        perfiles[r.ticker] = registro;
        // Guardar en caché en segundo plano (no bloquea la respuesta si falla)
        fetch(`${SUPABASE_URL_PERFIL}/rest/v1/fmp_profile_cache`, {
          method: "POST",
          headers: { ...headersPerfil, Prefer: "resolution=merge-duplicates" },
          body: JSON.stringify(registro),
        }).catch(() => {});
      }
    }

    // Filtro por precio mínimo (evita chicharros de céntimos)
    const minPrice = parseFloat(url.searchParams.get("min_price") || "1");
    // Cambio diario máximo razonable: valores por encima suelen ser fallos
    // de datos (ej. reverse splits no ajustados a tiempo), no oportunidades
    // reales. Ajustable con el parámetro max_change.
    const maxChange = parseFloat(url.searchParams.get("max_change") || "200");
    // Capitalización mínima real (ahora sí disponible vía profile). Por
    // defecto 300 millones. Ajustable con min_market_cap.
    const minMarketCap = parseFloat(url.searchParams.get("min_market_cap") || "300000000");
    // Antigüedad mínima cotizando en bolsa, en años. Por defecto 5.
    // Ajustable con min_years_listed.
    const minYearsListed = parseFloat(url.searchParams.get("min_years_listed") || "5");
    const hoy = Date.now();

    const filtrada = lista.filter((it: any) => {
      const precio = Number(it.price) || 0;
      let cambioPct = it.changesPercentage ?? it.changePercentage ?? 0;
      if (typeof cambioPct === "string") cambioPct = parseFloat(cambioPct.replace("%", ""));
      if (precio < minPrice || Math.abs(Number(cambioPct) || 0) > maxChange) return false;

      // Si ya intentamos conseguir el perfil (está en caché, aunque sea con
      // datos vacíos) y no hay capitalización, lo excluimos: normalmente
      // son fondos de inversión u otros instrumentos sin perfil de empresa,
      // no acciones normales. Si todavía no lo hemos intentado (pendiente
      // de cuota), lo dejamos pasar por ahora.
      const perfil = perfiles[it.symbol];
      if (perfil) {
        if (perfil.is_fund) return false;
        if (!perfil.market_cap || perfil.market_cap < minMarketCap) return false;
        if (perfil.ipo_date) {
          const anios = (hoy - new Date(perfil.ipo_date).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
          if (anios < minYearsListed) return false;
        }
      }
      return true;
    });

    // Divergencias MACD/RSI: SOLO LECTURA de lo que ya calculó el escaneo
    // diario (scan-macd-divergence). No se piden datos nuevos aquí - eso
    // es justo lo que agotaba la cuota de FMP en cada carga del Scanner.
    const simbolosDiv = filtrada.map((it: any) => it.symbol);
    const divergencias: Record<string, any> = {};

    if (simbolosDiv.length > 0 && SUPABASE_URL_PERFIL) {
      try {
        const cacheDivRes = await fetch(
          `${SUPABASE_URL_PERFIL}/rest/v1/divergence_cache?ticker=in.(${simbolosDiv.join(",")})&select=*`,
          { headers: headersPerfil }
        );
        if (cacheDivRes.ok) {
          const cacheDivData = await cacheDivRes.json();
          cacheDivData.forEach((c: any) => { divergencias[c.ticker] = c; });
        }
      } catch (_) {
        // sin caché disponible, se mostrará sin divergencia por ahora
      }
    }

    const recortada = filtrada.slice(0, count);

    // Normalizamos al mismo formato que ya esperaba tu app.js
    // (regularMarketPrice / regularMarketChangePercent), añadiendo volumen
    // y años cotizando como datos nuevos.
    const normalizado = recortada.map((item: any) => {
      let cambio = item.changesPercentage ?? item.changePercentage ?? 0;
      if (typeof cambio === "string") {
        cambio = parseFloat(cambio.replace("%", ""));
      }
      const perfil = perfiles[item.symbol];
      const aniosListado = perfil?.ipo_date
        ? Math.floor((hoy - new Date(perfil.ipo_date).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
        : null;
      const divergencia = divergencias[item.symbol];
      return {
        symbol: item.symbol,
        name: item.name || "",
        regularMarketPrice: Number(item.price) || 0,
        regularMarketChangePercent: Number(cambio) || 0,
        volumen: perfil?.volume || null,
        volumenRelativo: perfil?.volume && perfil?.average_volume
          ? perfil.volume / perfil.average_volume
          : null,
        aniosListado,
        divergenciaMacd: divergencia?.divergencia_macd || null,
        divergenciaRsi: divergencia?.divergencia_rsi || null,
      };
    });

    // Orden explícito: ganadores de mayor a menor %, perdedores del más
    // negativo al menos negativo. FMP ya suele venir así, pero lo forzamos
    // para garantizarlo siempre, incluso si su orden cambia algún día.
    if (tipo === "day_gainers") {
      normalizado.sort((a, b) => b.regularMarketChangePercent - a.regularMarketChangePercent);
    } else if (tipo === "day_losers") {
      normalizado.sort((a, b) => a.regularMarketChangePercent - b.regularMarketChangePercent);
    }

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