// Supabase Edge Function: check-positions
// Comprueba el precio de mercado de cada operación abierta y actualiza
// su estado automáticamente: PENDIENTE -> ACTIVA -> CERRADA (GANADORA/PERDEDORA).
// No la llama el navegador: la invoca un Cron Job de Supabase cada X minutos,
// así que la lógica funciona aunque el dashboard esté cerrado.

Deno.serve(async (_req: Request) => {
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const FMP_API_KEY = Deno.env.get("FMP_API_KEY");

    // Clave con permisos de servidor (bypassa RLS). Probamos primero el
    // sistema de claves nuevo, y si no existe, el legado.
    let SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SERVICE_KEY) {
      const secretsJson = Deno.env.get("SUPABASE_SECRET_KEYS");
      if (secretsJson) {
        try {
          const secrets = JSON.parse(secretsJson);
          SERVICE_KEY = Object.values(secrets)[0] as string;
        } catch (_) {
          // se valida más abajo
        }
      }
    }

    if (!SUPABASE_URL || !SERVICE_KEY || !FMP_API_KEY) {
      return new Response(
        JSON.stringify({
          error:
            "Faltan variables de entorno (SUPABASE_URL, clave de servicio o FMP_API_KEY)",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const headers = {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    };

    // 1. Traer operaciones abiertas (PENDIENTE o ACTIVA)
    const posRes = await fetch(
      `${SUPABASE_URL}/rest/v1/positions?estado=neq.CERRADA&select=*`,
      { headers }
    );
    if (!posRes.ok) throw new Error(`Error leyendo positions: ${posRes.status}`);
    const abiertas = await posRes.json();

    if (!Array.isArray(abiertas) || abiertas.length === 0) {
      return new Response(JSON.stringify({ mensaje: "Sin operaciones abiertas" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // 2. Cotizaciones en lote desde Financial Modeling Prep
    const tickers = [...new Set(abiertas.map((p: any) => p.ticker))].join(",");
    const quoteRes = await fetch(
      `https://financialmodelingprep.com/stable/batch-quote?symbols=${encodeURIComponent(
        tickers
      )}&apikey=${FMP_API_KEY}`
    );
    if (!quoteRes.ok) throw new Error(`Error de FMP: ${quoteRes.status}`);
    const quotes = await quoteRes.json();

    const precios: Record<string, number> = {};
    (Array.isArray(quotes) ? quotes : []).forEach((q: any) => {
      precios[q.symbol] = Number(q.price) || 0;
    });

    // 3. Evaluar y actualizar cada operación que cambie de estado
    let actualizadas = 0;

    for (const pos of abiertas) {
      const precioActual = precios[pos.ticker];
      if (!precioActual) continue;

      let nuevoEstado = pos.estado;
      let nuevoResultado = pos.resultado;
      let closePrice: number | null = null;

      if (nuevoEstado === "PENDIENTE") {
        const precioBase = Number(pos.precio_creacion) || Number(pos.entry);
        const entry = Number(pos.entry);
        const tocoEntrada =
          precioBase === entry ||
          (precioBase < entry ? precioActual >= entry : precioActual <= entry);
        if (tocoEntrada) nuevoEstado = "ACTIVA";
      }

      if (nuevoEstado === "ACTIVA") {
        const esLong = pos.tipo !== "Short";
        if (esLong) {
          if (precioActual >= Number(pos.tp)) {
            nuevoEstado = "CERRADA";
            nuevoResultado = "GANADORA";
            closePrice = precioActual;
          } else if (precioActual <= Number(pos.sl)) {
            nuevoEstado = "CERRADA";
            nuevoResultado = "PERDEDORA";
            closePrice = precioActual;
          }
        } else {
          if (precioActual <= Number(pos.tp)) {
            nuevoEstado = "CERRADA";
            nuevoResultado = "GANADORA";
            closePrice = precioActual;
          } else if (precioActual >= Number(pos.sl)) {
            nuevoEstado = "CERRADA";
            nuevoResultado = "PERDEDORA";
            closePrice = precioActual;
          }
        }
      }

      if (nuevoEstado !== pos.estado) {
        const updateRes = await fetch(
          `${SUPABASE_URL}/rest/v1/positions?id=eq.${pos.id}`,
          {
            method: "PATCH",
            headers: { ...headers, Prefer: "return=minimal" },
            body: JSON.stringify({
              estado: nuevoEstado,
              resultado: nuevoResultado,
              close_price: closePrice,
              closed_at:
                nuevoEstado === "CERRADA" ? new Date().toISOString() : null,
            }),
          }
        );
        if (updateRes.ok) actualizadas++;
      }
    }

    return new Response(
      JSON.stringify({ revisadas: abiertas.length, actualizadas }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});