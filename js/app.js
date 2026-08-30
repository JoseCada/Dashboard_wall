let activoSeleccionado = "NVDA";
let timeframeSeleccionado = "D";
let datosActualesMercado = [];

// Opciones comunes de TradingView para tener SIEMPRE el gráfico completo
// (herramientas de dibujo, rangos de fecha, detalles, etc.) en las 3 pestañas.
function opcionesGraficoCompleto(symbol, interval, containerId, studies) {
  return {
    "autosize": true,
    "symbol": symbol,
    "interval": interval || "D",
    "timezone": "Etc/UTC",
    "theme": "dark",
    "style": "1",
    "locale": "es",
    "toolbar_bg": "#f1f3f6",
    "enable_publishing": false,
    "allow_symbol_change": true,
    "hide_side_toolbar": false,
    "hide_top_toolbar": false,
    "hide_legend": false,
    "withdateranges": true,
    "details": true,
    "hotlist": false,
    "calendar": false,
    "save_image": true,
    "studies": studies || [],
    "container_id": containerId
  };
}

// 1. CARGA MODULAR DE LA PESTAÑA SCANNER (tabs/tab1.html)
async function cargarPestanaScanner() {
  const container = document.getElementById('tab-scanner');
  if (!container) return;

  try {
    const response = await fetch('tabs/tab1.html');
    if (!response.ok) throw new Error('No se pudo cargar tabs/tab1.html');

    const html = await response.text();
    container.innerHTML = html;

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

  const tipoScreener = selElement.value;
  tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#787b86;">Cargando mercado...</td></tr>';

  try {
    const url = `${SUPABASE_URL}/functions/v1/market-screener?type=${tipoScreener}&count=50`;
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${await obtenerTokenSesion()}` }
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

  const targetEstimado = price * 1.15;

  document.getElementById('mb-ticker').innerText = item.symbol;
  document.getElementById('mb-precio').innerText = `$${price.toFixed(2)}`;

  const mbUpside = document.getElementById('mb-upside');
  mbUpside.innerText = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
  mbUpside.className = `val ${change >= 0 ? 'text-pos' : 'text-neg'}`;

  document.getElementById('mb-target').innerText = `$${targetEstimado.toFixed(2)}`;

  renderGraficoTV(item.symbol, timeframeSeleccionado);
}

// 4. RENDERIZAR TRADINGVIEW (Scanner) - gráfico completo con MACD + RSI
function renderGraficoTV(symbol, interval) {
  const container = document.getElementById('tv_chart_container');
  if (!container) return;
  container.innerHTML = '';

  if (typeof TradingView !== 'undefined') {
    new TradingView.widget(
      opcionesGraficoCompleto(symbol, interval, 'tv_chart_container', ["MACD@tv-basicstudies", "RSI@tv-basicstudies"])
    );
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
  } else if (tabId === 'tab-fiscal') {
    cargarPestanaFiscal();
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

// Helper: consulta cotizaciones en lote a la Edge Function (usado por
// watchlist, guardado manual y verificación automática del portafolio)
async function obtenerCotizaciones(tickersArray) {
  const cotizaciones = {};
  if (!tickersArray || tickersArray.length === 0) return cotizaciones;

  try {
    const tickers = [...new Set(tickersArray)].join(',');
    const url = `${SUPABASE_URL}/functions/v1/market-screener?type=quote&symbols=${encodeURIComponent(tickers)}`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${await obtenerTokenSesion()}` } });
    if (res.ok) {
      const quotes = await res.json();
      quotes.forEach(q => { cotizaciones[q.symbol] = q; });
    }
  } catch (error) {
    console.error('Error al obtener cotizaciones:', error);
  }
  return cotizaciones;
}

// 6. PORTAFOLIO (SUPABASE) - accesible desde cualquier equipo
let activoPortafolioSeleccionado = null;

async function guardarEnPortafolio() {
  if (!activoSeguimientoSeleccionado) {
    alert('Selecciona primero un activo de tu Lista de Seguimiento.');
    return;
  }

  const cot = ultimasCotizacionesSeguimiento[activoSeguimientoSeleccionado] || {};

  const posicion = {
    ticker: activoSeguimientoSeleccionado,
    entry: parseFloat(document.getElementById('inp-pe')?.value) || 0,
    sl: parseFloat(document.getElementById('inp-sl')?.value) || 0,
    tp: parseFloat(document.getElementById('inp-tp')?.value) || 0,
    tipo: document.getElementById('op-tipo')?.value || "Long",
    cantidad: parseFloat(document.getElementById('inp-cantidad')?.value) || 1,
    precioCreacion: cot.regularMarketPrice || parseFloat(document.getElementById('inp-pe')?.value) || 0
  };

  try {
    await DB.addPosition(posicion);
    alert(`✅ ${activoSeguimientoSeleccionado} guardado en tu portafolio.`);
    await renderizarPortafolio();
  } catch (error) {
    alert('❌ No se pudo guardar en Supabase. Revisa la consola del navegador.');
  }
}

// Alta manual de una operación directamente desde Mi Portafolio
async function agregarOperacionManual() {
  const ticker = (document.getElementById('man-ticker')?.value || '').trim().toUpperCase();
  const tipo = document.getElementById('man-tipo')?.value || 'Long';
  const cantidad = parseFloat(document.getElementById('man-cantidad')?.value) || 1;
  const entry = parseFloat(document.getElementById('man-entry')?.value) || 0;
  const sl = parseFloat(document.getElementById('man-sl')?.value) || 0;
  const tp = parseFloat(document.getElementById('man-tp')?.value) || 0;

  if (!ticker || entry <= 0) {
    alert('Introduce al menos un ticker y un precio de entrada.');
    return;
  }

  let precioActual = entry;
  const cotizaciones = await obtenerCotizaciones([ticker]);
  if (cotizaciones[ticker]?.regularMarketPrice) {
    precioActual = cotizaciones[ticker].regularMarketPrice;
  }

  try {
    await DB.addPosition({ ticker, tipo, entry, sl, tp, cantidad, precioCreacion: precioActual });
    alert(`✅ Operación de ${ticker} añadida manualmente.`);
    await renderizarPortafolio();
  } catch (error) {
    alert('❌ No se pudo guardar la operación.');
  }
}

// Comprueba el precio actual de cada operación abierta y actualiza su
// estado automáticamente: PENDIENTE -> ACTIVA -> CERRADA (GANADORA/PERDEDORA)
async function verificarEstadoOperaciones() {
  const posiciones = await DB.getPositions();
  const abiertas = posiciones.filter(p => p.estado !== 'CERRADA');
  if (abiertas.length === 0) return;

  const cotizaciones = await obtenerCotizaciones(abiertas.map(p => p.ticker));

  for (const pos of abiertas) {
    const cot = cotizaciones[pos.ticker];
    if (!cot || !cot.regularMarketPrice) continue;

    const precioActual = cot.regularMarketPrice;
    let nuevoEstado = pos.estado;
    let nuevoResultado = pos.resultado;
    let closePrice = null;

    if (nuevoEstado === 'PENDIENTE') {
      const precioBase = Number(pos.precio_creacion) || Number(pos.entry);
      const entry = Number(pos.entry);
      const tocoEntrada = precioBase === entry ||
        (precioBase < entry ? precioActual >= entry : precioActual <= entry);
      if (tocoEntrada) nuevoEstado = 'ACTIVA';
    }

    if (nuevoEstado === 'ACTIVA') {
      const esLong = pos.tipo !== 'Short';
      if (esLong) {
        if (precioActual >= Number(pos.tp)) { nuevoEstado = 'CERRADA'; nuevoResultado = 'GANADORA'; closePrice = precioActual; }
        else if (precioActual <= Number(pos.sl)) { nuevoEstado = 'CERRADA'; nuevoResultado = 'PERDEDORA'; closePrice = precioActual; }
      } else {
        if (precioActual <= Number(pos.tp)) { nuevoEstado = 'CERRADA'; nuevoResultado = 'GANADORA'; closePrice = precioActual; }
        else if (precioActual >= Number(pos.sl)) { nuevoEstado = 'CERRADA'; nuevoResultado = 'PERDEDORA'; closePrice = precioActual; }
      }
    }

    if (nuevoEstado !== pos.estado) {
      await DB.updatePosition(pos.id, {
        estado: nuevoEstado,
        resultado: nuevoResultado,
        close_price: closePrice,
        closed_at: nuevoEstado === 'CERRADA' ? new Date().toISOString() : null
      });
    }
  }
}

function estadoLabel(item) {
  if (item.estado === 'PENDIENTE') return '🕓 Pendiente';
  if (item.estado === 'ACTIVA') return '🟢 Activa';
  if (item.estado === 'CERRADA' && item.resultado === 'GANADORA') return '✅ Ganadora';
  if (item.estado === 'CERRADA' && item.resultado === 'PERDEDORA') return '❌ Perdedora';
  return item.estado || '-';
}

async function renderizarPortafolio() {
  const contenedor = document.getElementById('tab-portafolio');
  if (!contenedor) return;

  contenedor.innerHTML = '<p style="color:#787b86; padding:20px;">Comprobando precios y cargando portafolio...</p>';

  await verificarEstadoOperaciones();
  const portafolio = await DB.getPositions();

  let html = `
    <div style="display:flex; flex-direction:column; gap:15px; height: calc(100vh - 110px);">
      <div class="side-card" style="flex:0 0 auto;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h4 style="margin:0; color:#fff;">➕ Añadir operación manual</h4>
          <button onclick="renderizarPortafolio()" style="background:none; border:none; color:#787b86; cursor:pointer;" title="Verificar precios ahora">🔄</button>
        </div>
        <div class="risk-bar" style="margin:0;">
          <label>Ticker:</label>
          <input type="text" id="man-ticker" placeholder="AAPL" style="text-transform:uppercase;">
          <label>Tipo:</label>
          <select id="man-tipo">
            <option value="Long">📈 Long</option>
            <option value="Short">📉 Short</option>
          </select>
          <label>Cantidad:</label>
          <input type="number" id="man-cantidad" step="1" min="1" value="1">
          <label>Entrada:</label>
          <input type="number" id="man-entry" step="0.01">
          <label>Stop Loss:</label>
          <input type="number" id="man-sl" step="0.01">
          <label>Take Profit:</label>
          <input type="number" id="man-tp" step="0.01">
          <button class="btn-primary" onclick="agregarOperacionManual()" style="margin-left:auto;">➕ Añadir</button>
        </div>
      </div>
  `;

  if (portafolio.length === 0) {
    html += `
      <div class="side-card" style="flex:1;">
        <p style="color: #787b86;">No tienes posiciones guardadas aún.</p>
      </div>
    </div>`;
    contenedor.innerHTML = html;
    return;
  }

  html += `
      <div class="side-card" style="flex:0 1 auto; max-height:40%;">
        <div class="table-scroll">
          <table class="mini-table" style="min-width:900px;">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Ticker</th>
                <th>Tipo</th>
                <th>Cantidad</th>
                <th>Entrada</th>
                <th>Stop Loss</th>
                <th>Take Profit</th>
                <th>Estado</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody id="tbl-portafolio-body">
  `;

  portafolio.forEach(item => {
    const fecha = item.created_at ? new Date(item.created_at).toLocaleDateString() : '-';
    html += `
      <tr data-ticker="${item.ticker}" onclick="seleccionarOperacionPortafolio('${item.ticker}')">
        <td>${fecha}</td>
        <td><b>${item.ticker}</b></td>
        <td>${item.tipo}</td>
        <td>${item.cantidad}</td>
        <td>$${Number(item.entry).toFixed(2)}</td>
        <td class="text-neg">$${Number(item.sl).toFixed(2)}</td>
        <td class="text-pos">$${Number(item.tp).toFixed(2)}</td>
        <td>${estadoLabel(item)}</td>
        <td><button style="background:var(--neg-red); color:#fff; border:none; padding:4px 8px; border-radius:3px; cursor:pointer;" onclick="event.stopPropagation(); eliminarDelPortafolio(${item.id})">Eliminar</button></td>
      </tr>
    `;
  });

  html += `
            </tbody>
          </table>
        </div>
      </div>

      <div class="chart-card" style="flex:1; min-height:0;">
        <div class="metrics-bar">
          <div class="m-item"><span class="lbl">OPERACIÓN</span><span class="val" id="pf-ticker">---</span></div>
        </div>
        <div id="tv_chart_portafolio" class="tv-chart"></div>
      </div>
    </div>
  `;

  contenedor.innerHTML = html;

  const tickerAMostrar = activoPortafolioSeleccionado || portafolio[0].ticker;
  seleccionarOperacionPortafolio(tickerAMostrar);
}

function seleccionarOperacionPortafolio(ticker) {
  activoPortafolioSeleccionado = ticker;

  document.querySelectorAll('#tbl-portafolio-body tr').forEach(r => {
    r.classList.toggle('active-row', r.getAttribute('data-ticker') === ticker);
  });

  const tickerEl = document.getElementById('pf-ticker');
  if (tickerEl) tickerEl.innerText = ticker;

  renderGraficoPortafolio(ticker);
}

function renderGraficoPortafolio(symbol) {
  const container = document.getElementById('tv_chart_portafolio');
  if (!container) return;
  container.innerHTML = '';

  if (typeof TradingView !== 'undefined') {
    new TradingView.widget(
      opcionesGraficoCompleto(symbol, 'D', 'tv_chart_portafolio')
    );
  }
}

async function eliminarDelPortafolio(id) {
  await DB.deletePosition(id);
  await renderizarPortafolio();
}

// 7. LISTA DE SEGUIMIENTO (WATCHLIST) - independiente del portafolio
let seguimientoTabCargada = false;
let activoSeguimientoSeleccionado = null;
let ultimasCotizacionesSeguimiento = {};

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

// Alta manual de un ticker directamente desde la Lista de Seguimiento
async function agregarManualSeguimiento() {
  const input = document.getElementById('inp-ticker-manual-seg');
  const ticker = (input?.value || '').trim().toUpperCase();
  if (!ticker) return;

  try {
    await DB.addToWatchlist(ticker);
    if (input) input.value = '';
    await cargarListaSeguimiento();
  } catch (error) {
    alert('❌ No se pudo añadir el ticker.');
  }
}

async function cargarListaSeguimiento() {
  const tbody = document.getElementById('tbl-seguimiento-body');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#787b86;">Cargando...</td></tr>';

  const items = await DB.getWatchlist();

  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#787b86;">Aún no sigues ningún activo. Añádelo desde el Scanner o escribe un ticker arriba.</td></tr>';
    return;
  }

  const cotizaciones = await obtenerCotizaciones(items.map(i => i.ticker));

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

// Gráfico TradingView completo para la pestaña de seguimiento, con MACD + RSI
function renderGraficoSeguimiento(symbol) {
  const container = document.getElementById('tv_chart_seguimiento');
  if (!container) return;
  container.innerHTML = '';

  if (typeof TradingView !== 'undefined') {
    new TradingView.widget(
      opcionesGraficoCompleto(symbol, 'D', 'tv_chart_seguimiento', ["MACD@tv-basicstudies", "RSI@tv-basicstudies"])
    );
  }
}

// 8. CONTROL FISCAL (IRPF - España)
let fiscalTabCargada = false;
let ultimoInformeFiscal = [];

async function cargarPestanaFiscal() {
  const container = document.getElementById('tab-fiscal');
  if (!container) return;

  if (!fiscalTabCargada) {
    try {
      const response = await fetch('tabs/tab3.html');
      if (!response.ok) throw new Error('No se pudo cargar tabs/tab3.html');
      container.innerHTML = await response.text();
      fiscalTabCargada = true;

      const selAnio = document.getElementById('sel-fiscal-anio');
      const anioActual = new Date().getFullYear();
      for (let a = anioActual; a >= anioActual - 5; a--) {
        const opt = document.createElement('option');
        opt.value = a;
        opt.textContent = a;
        selAnio.appendChild(opt);
      }
    } catch (error) {
      console.error('Error cargando la pestaña fiscal:', error);
      container.innerHTML = '<p style="color:var(--neg-red); padding:20px;">Error al cargar tabs/tab3.html. Revisa la ruta.</p>';
      return;
    }
  }

  await cargarInformeFiscal();
}

async function cargarInformeFiscal() {
  const tbody = document.getElementById('tbl-fiscal-body');
  const selAnio = document.getElementById('sel-fiscal-anio');
  if (!tbody || !selAnio) return;

  const anio = parseInt(selAnio.value, 10);
  const todas = await DB.getPositions();

  const cerradas = todas.filter(p => {
    if (p.estado !== 'CERRADA' || !p.closed_at) return false;
    return new Date(p.closed_at).getFullYear() === anio;
  });

  ultimoInformeFiscal = cerradas.map(p => {
    const factor = p.tipo === 'Short' ? -1 : 1;
    const importe = (Number(p.close_price) - Number(p.entry)) * Number(p.cantidad) * factor;
    return { ...p, importe };
  });

  tbody.innerHTML = '';

  if (ultimoInformeFiscal.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:#787b86;">No hay operaciones cerradas en este año.</td></tr>';
  } else {
    ultimoInformeFiscal.forEach(op => {
      const fechaCierre = op.closed_at ? new Date(op.closed_at).toLocaleDateString() : '-';
      const colorClase = op.importe >= 0 ? 'text-pos' : 'text-neg';
      tbody.innerHTML += `
        <tr>
          <td>${fechaCierre}</td>
          <td><b>${op.ticker}</b></td>
          <td>${op.tipo}</td>
          <td>${op.cantidad}</td>
          <td>$${Number(op.entry).toFixed(2)}</td>
          <td>$${Number(op.close_price).toFixed(2)}</td>
          <td>${op.resultado === 'GANADORA' ? '✅ Ganadora' : '❌ Perdedora'}</td>
          <td class="${colorClase}">${op.importe >= 0 ? '+' : ''}${op.importe.toFixed(2)} €</td>
        </tr>
      `;
    });
  }

  const ganancias = ultimoInformeFiscal.filter(o => o.importe > 0).reduce((s, o) => s + o.importe, 0);
  const perdidas = ultimoInformeFiscal.filter(o => o.importe < 0).reduce((s, o) => s + o.importe, 0);
  const neto = ganancias + perdidas;

  document.getElementById('fis-ganancias').innerText = `${ganancias.toFixed(2)} €`;
  document.getElementById('fis-perdidas').innerText = `${perdidas.toFixed(2)} €`;
  const netoEl = document.getElementById('fis-neto');
  netoEl.innerText = `${neto.toFixed(2)} €`;
  netoEl.className = `val ${neto >= 0 ? 'text-pos' : 'text-neg'}`;
  document.getElementById('fis-num').innerText = ultimoInformeFiscal.length;
}

function descargarPDFFiscal() {
  if (ultimoInformeFiscal.length === 0) {
    alert('No hay operaciones para exportar en este año.');
    return;
  }

  if (typeof window.jspdf === 'undefined') {
    alert('No se pudo cargar la librería de PDF. Revisa tu conexión e inténtalo de nuevo.');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const selAnio = document.getElementById('sel-fiscal-anio');
  const anio = selAnio?.value || new Date().getFullYear();

  const ganancias = ultimoInformeFiscal.filter(o => o.importe > 0).reduce((s, o) => s + o.importe, 0);
  const perdidas = ultimoInformeFiscal.filter(o => o.importe < 0).reduce((s, o) => s + o.importe, 0);
  const neto = ganancias + perdidas;

  doc.setFontSize(16);
  doc.text(`Informe de operaciones cerradas - ${anio}`, 14, 18);

  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    'Documento generado a partir de las operaciones registradas en el dashboard.\n' +
    'No sustituye el asesoramiento de un gestor o asesor fiscal para presentar la declaración.',
    14, 26
  );

  doc.autoTable({
    startY: 38,
    head: [['Fecha cierre', 'Ticker', 'Tipo', 'Cantidad', 'Entrada', 'Cierre', 'Resultado', 'Importe (EUR)']],
    body: ultimoInformeFiscal.map(op => [
      op.closed_at ? new Date(op.closed_at).toLocaleDateString() : '-',
      op.ticker,
      op.tipo,
      op.cantidad,
      `$${Number(op.entry).toFixed(2)}`,
      `$${Number(op.close_price).toFixed(2)}`,
      op.resultado === 'GANADORA' ? 'Ganadora' : 'Perdedora',
      `${op.importe >= 0 ? '+' : ''}${op.importe.toFixed(2)} €`
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [41, 98, 255] }
  });

  const finalY = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(11);
  doc.setTextColor(0);
  doc.text(`Ganancias totales: ${ganancias.toFixed(2)} €`, 14, finalY);
  doc.text(`Pérdidas totales: ${perdidas.toFixed(2)} €`, 14, finalY + 7);
  doc.setFont(undefined, 'bold');
  doc.text(`Resultado neto: ${neto.toFixed(2)} €`, 14, finalY + 14);

  doc.save(`operaciones_fiscal_${anio}.pdf`);
}

// AUTENTICACIÓN (acceso privado con Supabase Auth)
async function obtenerTokenSesion() {
  const { data } = await supabaseClient.auth.getSession();
  return data?.session?.access_token || SUPABASE_KEY;
}

function mostrarApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-content').style.display = 'block';
  cargarPestanaScanner();
}

async function iniciarSesion() {
  const email = document.getElementById('login-email')?.value || '';
  const password = document.getElementById('login-password')?.value || '';
  const errorEl = document.getElementById('login-error');
  if (errorEl) errorEl.style.display = 'none';

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    if (errorEl) {
      errorEl.textContent = 'Email o contraseña incorrectos.';
      errorEl.style.display = 'block';
    }
    return;
  }

  mostrarApp();
}

async function cerrarSesion() {
  await supabaseClient.auth.signOut();
  document.getElementById('app-content').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
}

// INICIALIZACIÓN
window.addEventListener('DOMContentLoaded', async () => {
  const { data } = await supabaseClient.auth.getSession();
  if (data?.session) {
    mostrarApp();
  } else {
    document.getElementById('login-screen').style.display = 'flex';
  }
});