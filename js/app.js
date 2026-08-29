let activoSeleccionado = "NVDA";
let timeframeSeleccionado = "D";
let datosActualesMercado = [];

// 1. CARGA MODULAR DE LA PESTAÑA SCANNER (tabs/tab1.html)
async function cargarPestanaScanner() {
  const container = document.getElementById('tab-scanner');
  if (!container) return;

  try {
    const response = await fetch('tabs/tab1.html');
    if (!response.ok) throw new Error('No se pudo cargar tabs/tab1.html');
    
    const html = await response.text();
    container.innerHTML = html;

    // Obtener los datos reales de Yahoo Finance
    cargarListaMercadoReal();
  } catch (error) {
    console.error('Error cargando la pestaña:', error);
    container.innerHTML = '<p style="color:var(--neg-red); padding:20px;">Error al cargar tabs/tab1.html. Revisa la ruta.</p>';
  }
}

// 2. OBTENCIÓN DE DATOS EN TIEMPO REAL (vía Edge Function de Supabase -> FMP)
async function cargarListaMercadoReal() {
  const selElement = document.getElementById('sel-screener');
  const tbody = document.getElementById('tbl-activos-body');
  if (!selElement || !tbody) return;

  const tipoScreener = selElement.value; // day_gainers, day_losers, most_actives
  tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#787b86;">Cargando mercado...</td></tr>';

  try {
    const url = `${SUPABASE_URL}/functions/v1/market-screener?type=${tipoScreener}&count=50`;
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });

    if (!res.ok) {
      const detalle = await res.json().catch(() => ({}));
      throw new Error(detalle.error || `Error ${res.status}`);
    }

    const quotes = await res.json();
    datosActualesMercado = quotes;

    tbody.innerHTML = '';

    if (quotes.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Sin datos disponibles</td></tr>';
      return;
    }

    quotes.forEach((item, index) => {
      const symbol = item.symbol;
      const price = item.regularMarketPrice || 0;
      const change = item.regularMarketChangePercent || 0;

      const tr = document.createElement('tr');
      if (symbol === activoSeleccionado || index === 0) tr.classList.add('active-row');

      const colorClase = change >= 0 ? 'text-pos' : 'text-neg';
      const signo = change >= 0 ? '+' : '';

      tr.innerHTML = `
        <td><b>${symbol}</b></td>
        <td>$${price.toFixed(2)}</td>
        <td class="${colorClase}">${signo}${change.toFixed(2)}%</td>
      `;

      tr.onclick = () => seleccionarFilaActivo(item, tr);
      tbody.appendChild(tr);
    });

    // Seleccionar automáticamente el primer activo recibido
    if (quotes.length > 0) {
      seleccionarFilaActivo(quotes[0]);
    }

  } catch (error) {
    console.error("Error al obtener mercado en tiempo real:", error);
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--neg-red);">Error al conectar con el servidor</td></tr>';
  }
}

// 3. SELECCIÓN DE ACTIVO Y ACTUALIZACIÓN DE MÉTRICAS / GRÁFICO
function seleccionarFilaActivo(item, filaTr) {
  activoSeleccionado = item.symbol;

  document.querySelectorAll('#tbl-activos-body tr').forEach(r => r.classList.remove('active-row'));
  if (filaTr) filaTr.classList.add('active-row');

  const price = item.regularMarketPrice || 0;
  const change = item.regularMarketChangePercent || 0;
  
  // Cálculo de P. Objetivo estimado (+15% por defecto)
  const targetEstimado = price * 1.15;

  document.getElementById('mb-ticker').innerText = item.symbol;
  document.getElementById('mb-precio').innerText = `$${price.toFixed(2)}`;
  
  const mbUpside = document.getElementById('mb-upside');
  mbUpside.innerText = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
  mbUpside.className = `val ${change >= 0 ? 'text-pos' : 'text-neg'}`;

  document.getElementById('mb-target').innerText = `$${targetEstimado.toFixed(2)}`;

  renderGraficoTV(item.symbol, timeframeSeleccionado);
}

// 4. RENDEREIZAR TRADINGVIEW
function renderGraficoTV(symbol, interval) {
  const container = document.getElementById('tv_chart_container');
  if (!container) return;
  container.innerHTML = ''; 

  if (typeof TradingView !== 'undefined') {
    new TradingView.widget({
      "autosize": true,
      "symbol": symbol,
      "interval": interval,
      "timezone": "Etc/UTC",
      "theme": "dark",
      "style": "1",
      "locale": "es",
      "toolbar_bg": "#f1f3f6",
      "enable_publishing": false,
      "allow_symbol_change": true,
      "studies": ["MACD@tv-basicstudies", "RSI@tv-basicstudies"],
      "container_id": "tv_chart_container"
    });
  }
}

function cambiarTimeframe(tf) {
  timeframeSeleccionado = tf;
  renderGraficoTV(activoSeleccionado, timeframeSeleccionado);
}

// 5. NAVEGACIÓN Y CÁLCULO DE RIESGO
function cambiarPestana(tabId, btn) {
  document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(tb => tb.classList.remove('active'));

  const targetTab = document.getElementById(tabId);
  if (targetTab) targetTab.classList.add('active');
  if (btn) btn.classList.add('active');

  if (tabId === 'tab-scanner') {
    renderGraficoTV(activoSeleccionado, timeframeSeleccionado);
  } else if (tabId === 'tab-seguimiento') {
    cargarPestanaSeguimiento();
  } else if (tabId === 'tab-portafolio') {
    renderizarPortafolio();
  }
}

function recalcularRisk() {
  const pe = parseFloat(document.getElementById('inp-pe')?.value) || 0;
  const sl = parseFloat(document.getElementById('inp-sl')?.value) || 0;
  const tp = parseFloat(document.getElementById('inp-tp')?.value) || 0;

  if (pe > 0 && sl > 0 && tp > 0) {
    const riesgo = Math.abs(pe - sl);
    const beneficio = Math.abs(tp - pe);

    if (riesgo === 0) return;

    const rr = (beneficio / riesgo).toFixed(2);

    const txtRr = document.getElementById('txt-rr');
    const mbRr = document.getElementById('mb-rr');

    if (txtRr) {
      txtRr.innerText = `1:${rr}`;
      txtRr.style.color = rr >= 2 ? 'var(--pos-green)' : 'var(--neg-red)';
    }
    if (mbRr) {
      mbRr.innerText = `1:${rr}`;
    }
  }
}

// 6. PORTAFOLIO (SUPABASE) - accesible desde cualquier equipo
async function guardarEnPortafolio() {
  if (!activoSeguimientoSeleccionado) {
    alert('Selecciona primero un activo de tu Lista de Seguimiento.');
    return;
  }

  const posicion = {
    ticker: activoSeguimientoSeleccionado,
    entry: parseFloat(document.getElementById('inp-pe')?.value) || 0,
    sl: parseFloat(document.getElementById('inp-sl')?.value) || 0,
    tp: parseFloat(document.getElementById('inp-tp')?.value) || 0,
    tipo: document.getElementById('op-tipo')?.value || "Long"
  };

  try {
    await DB.addPosition(posicion);
    alert(`✅ ${activoSeguimientoSeleccionado} guardado en tu portafolio.`);
    await renderizarPortafolio();
  } catch (error) {
    alert('❌ No se pudo guardar en Supabase. Revisa la consola del navegador.');
  }
}

async function renderizarPortafolio() {
  const contenedor = document.getElementById('tab-portafolio');
  if (!contenedor) return;

  contenedor.innerHTML = '<p style="color:#787b86; padding:20px;">Cargando portafolio...</p>';

  const portafolio = await DB.getPositions();

  if (portafolio.length === 0) {
    contenedor.innerHTML = `
      <h3>💼 Mi Portafolio</h3>
      <p style="color: #787b86;">No tienes posiciones guardadas aún.</p>
    `;
    return;
  }

  let html = `
    <h3>💼 Mi Portafolio / Guardados</h3>
    <table class="mini-table" style="max-width:800px; margin-top:15px;">
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Ticker</th>
          <th>Tipo</th>
          <th>Entrada</th>
          <th>Stop Loss</th>
          <th>Take Profit</th>
          <th>Acción</th>
        </tr>
      </thead>
      <tbody>
  `;

  portafolio.forEach(item => {
    const fecha = item.created_at ? new Date(item.created_at).toLocaleDateString() : '-';
    html += `
      <tr>
        <td>${fecha}</td>
        <td><b>${item.ticker}</b></td>
        <td>${item.tipo}</td>
        <td>$${Number(item.entry).toFixed(2)}</td>
        <td class="text-neg">$${Number(item.sl).toFixed(2)}</td>
        <td class="text-pos">$${Number(item.tp).toFixed(2)}</td>
        <td><button style="background:var(--neg-red); color:#fff; border:none; padding:4px 8px; border-radius:3px; cursor:pointer;" onclick="eliminarDelPortafolio(${item.id})">Eliminar</button></td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  contenedor.innerHTML = html;
}

async function eliminarDelPortafolio(id) {
  await DB.deletePosition(id);
  await renderizarPortafolio();
}

// 7. LISTA DE SEGUIMIENTO (WATCHLIST) - independiente del portafolio
let seguimientoTabCargada = false;
let activoSeguimientoSeleccionado = null;
let ultimasCotizacionesSeguimiento = {};

// Cargada la primera vez que se entra a la pestaña (fetch de tabs/tab2.html)
async function cargarPestanaSeguimiento() {
  const container = document.getElementById('tab-seguimiento');
  if (!container) return;

  if (!seguimientoTabCargada) {
    try {
      const response = await fetch('tabs/tab2.html');
      if (!response.ok) throw new Error('No se pudo cargar tabs/tab2.html');
      container.innerHTML = await response.text();
      seguimientoTabCargada = true;
    } catch (error) {
      console.error('Error cargando la pestaña de seguimiento:', error);
      container.innerHTML = '<p style="color:var(--neg-red); padding:20px;">Error al cargar tabs/tab2.html. Revisa la ruta.</p>';
      return;
    }
  }

  await cargarListaSeguimiento();
}

// Llamado desde el botón "👁 Seguir" en el Scanner
async function agregarASeguimiento() {
  if (!activoSeleccionado) return;
  try {
    await DB.addToWatchlist(activoSeleccionado);
    alert(`👀 ${activoSeleccionado} añadido a tu Lista de Seguimiento.`);
  } catch (error) {
    alert('❌ No se pudo añadir a la lista de seguimiento.');
  }
}

// Refresca la tabla de la watchlist con precios/cambio en vivo
async function cargarListaSeguimiento() {
  const tbody = document.getElementById('tbl-seguimiento-body');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#787b86;">Cargando...</td></tr>';

  const items = await DB.getWatchlist();

  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#787b86;">Aún no sigues ningún activo. Añádelo desde el Scanner.</td></tr>';
    return;
  }

  // Traer todas las cotizaciones en una sola llamada
  const tickers = items.map(i => i.ticker).join(',');
  let cotizaciones = {};
  try {
    const url = `${SUPABASE_URL}/functions/v1/market-screener?type=quote&symbols=${encodeURIComponent(tickers)}`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${SUPABASE_KEY}` } });
    if (res.ok) {
      const quotes = await res.json();
      quotes.forEach(q => { cotizaciones[q.symbol] = q; });
    }
  } catch (error) {
    console.error('Error al obtener cotizaciones de la lista de seguimiento:', error);
  }

  tbody.innerHTML = '';

  const filasPorTicker = {};

  items.forEach((item, index) => {
    const cot = cotizaciones[item.ticker] || {};
    const price = cot.regularMarketPrice || 0;
    const change = cot.regularMarketChangePercent || 0;
    const colorClase = change >= 0 ? 'text-pos' : 'text-neg';
    const signo = change >= 0 ? '+' : '';

    const tr = document.createElement('tr');
    if (item.ticker === activoSeguimientoSeleccionado || (index === 0 && !activoSeguimientoSeleccionado)) {
      tr.classList.add('active-row');
    }

    tr.innerHTML = `
      <td>
        <button class="star-btn" onclick="event.stopPropagation(); toggleFavoritoSeguimiento('${item.ticker}', ${!!item.favorito})">
          ${item.favorito ? '⭐' : '☆'}
        </button>
      </td>
      <td><b>${item.ticker}</b></td>
      <td>$${price.toFixed(2)}</td>
      <td class="${colorClase}">${signo}${change.toFixed(2)}%</td>
      <td><button style="background:var(--neg-red); color:#fff; border:none; padding:4px 8px; border-radius:3px; cursor:pointer;" onclick="event.stopPropagation(); eliminarDeSeguimiento('${item.ticker}')">Eliminar</button></td>
    `;

    tr.onclick = () => seleccionarActivoSeguimiento(item.ticker, tr);
    filasPorTicker[item.ticker] = tr;
    tbody.appendChild(tr);
  });

  ultimasCotizacionesSeguimiento = cotizaciones;

  const tickerActivo = activoSeguimientoSeleccionado || items[0].ticker;
  seleccionarActivoSeguimiento(tickerActivo, filasPorTicker[tickerActivo]);
}

function seleccionarActivoSeguimiento(ticker, filaTr) {
  activoSeguimientoSeleccionado = ticker;

  document.querySelectorAll('#tbl-seguimiento-body tr').forEach(r => r.classList.remove('active-row'));
  if (filaTr) filaTr.classList.add('active-row');

  const tickerEl = document.getElementById('sg-ticker');
  if (tickerEl) tickerEl.innerText = ticker;

  const cot = ultimasCotizacionesSeguimiento[ticker] || {};
  const price = cot.regularMarketPrice || 0;
  const change = cot.regularMarketChangePercent || 0;

  const precioEl = document.getElementById('sg-precio');
  if (precioEl) precioEl.innerText = `$${price.toFixed(2)}`;

  const cambioEl = document.getElementById('sg-cambio');
  if (cambioEl) {
    cambioEl.innerText = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
    cambioEl.className = `val ${change >= 0 ? 'text-pos' : 'text-neg'}`;
  }

  // Autocompletar la calculadora de riesgo con el precio real del activo
  if (price > 0) {
    const targetEstimado = price * 1.15;
    const peEl = document.getElementById('inp-pe');
    const slEl = document.getElementById('inp-sl');
    const tpEl = document.getElementById('inp-tp');
    if (peEl) peEl.value = price.toFixed(2);
    if (slEl) slEl.value = (price * 0.95).toFixed(2);
    if (tpEl) tpEl.value = targetEstimado.toFixed(2);
    recalcularRisk();
  }

  renderGraficoSeguimiento(ticker);
}

async function toggleFavoritoSeguimiento(ticker, favoritoActual) {
  await DB.toggleFavorito(ticker, !favoritoActual);
  await cargarListaSeguimiento();
}

async function eliminarDeSeguimiento(ticker) {
  await DB.removeFromWatchlist(ticker);
  if (activoSeguimientoSeleccionado === ticker) activoSeguimientoSeleccionado = null;
  await cargarListaSeguimiento();
}

// Gráfico TradingView independiente para la pestaña de seguimiento, con MACD + RSI
function renderGraficoSeguimiento(symbol) {
  const container = document.getElementById('tv_chart_seguimiento');
  if (!container) return;
  container.innerHTML = '';

  if (typeof TradingView !== 'undefined') {
    new TradingView.widget({
      "autosize": true,
      "symbol": symbol,
      "interval": "S",
      "timezone": "Etc/UTC",
      "theme": "dark",
      "style": "1",
      "locale": "es",
      "toolbar_bg": "#f1f3f6",
      "enable_publishing": false,
      "allow_symbol_change": true,
      "studies": ["MACD@tv-basicstudies", "RSI@tv-basicstudies"],
      "container_id": "tv_chart_seguimiento"
    });
  }
}

// INICIALIZACIÓN
window.addEventListener('DOMContentLoaded', () => {
  cargarPestanaScanner();
});