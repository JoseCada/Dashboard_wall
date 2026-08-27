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

// 2. OBTENCIÓN DE DATOS EN TIEMPO REAL CON PROXY DE RESPALDO
async function cargarListaMercadoReal() {
  const selElement = document.getElementById('sel-screener');
  const tbody = document.getElementById('tbl-activos-body');
  if (!tbody) return;

  const tipoScreener = selElement ? selElement.value : 'day_gainers';
  tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#787b86;">Cargando mercado...</td></tr>';

  const targetUrl = `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=false&scrIds=${tipoScreener}&count=25`;
  let quotes = [];

  // Intento 1: Proxy Corsproxy.io (Más rápido y directo)
  try {
    const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(targetUrl)}`);
    if (res.ok) {
      const data = await res.json();
      quotes = data?.finance?.result[0]?.quotes || [];
    }
  } catch (e) {
    console.warn("Proxy 1 falló, intentando Proxy de respaldo...");
  }

  // Intento 2: Proxy AllOrigins (Respaldo si el primero falla)
  if (quotes.length === 0) {
    try {
      const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`);
      if (res.ok) {
        const data = await res.json();
        const parsed = JSON.parse(data.contents);
        quotes = parsed?.finance?.result[0]?.quotes || [];
      }
    } catch (e) {
      console.error("Error en ambos proxies:", e);
    }
  }

  tbody.innerHTML = '';

  // Si ambos proxies fallan o no hay datos
  if (!quotes || quotes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--neg-red);">Error al obtener datos del mercado</td></tr>';
    return;
  }

  datosActualesMercado = quotes;

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
}

// 3. SELECCIÓN DE ACTIVO Y ACTUALIZACIÓN DE MÉTRICAS / GRÁFICO
function seleccionarFilaActivo(item, filaTr) {
  activoSeleccionado = item.symbol;

  document.querySelectorAll('#tbl-activos-body tr').forEach(r => r.classList.remove('active-row'));
  if (filaTr) filaTr.classList.add('active-row');

  const price = item.regularMarketPrice || 0;
  const change = item.regularMarketChangePercent || 0;
  
  const targetEstimado = price * 1.15;

  const elTicker = document.getElementById('mb-ticker');
  const elPrecio = document.getElementById('mb-precio');
  const elTarget = document.getElementById('mb-target');
  
  if (elTicker) elTicker.innerText = item.symbol;
  if (elPrecio) elPrecio.innerText = `$${price.toFixed(2)}`;
  if (elTarget) elTarget.innerText = `$${targetEstimado.toFixed(2)}`;
  
  const mbUpside = document.getElementById('mb-upside');
  if (mbUpside) {
    mbUpside.innerText = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
    mbUpside.className = `val ${change >= 0 ? 'text-pos' : 'text-neg'}`;
  }

  const inpPe = document.getElementById('inp-pe');
  const inpSl = document.getElementById('inp-sl');
  const inpTp = document.getElementById('inp-tp');

  if (inpPe) inpPe.value = price.toFixed(2);
  if (inpSl) inpSl.value = (price * 0.95).toFixed(2);
  if (inpTp) inpTp.value = targetEstimado.toFixed(2);

  recalcularRisk();
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

// 6. PORTAFOLIO Y LOCALSTORAGE
function guardarEnPortafolio() {
  const operacion = {
    id: Date.now(),
    ticker: activoSeleccionado,
    entry: document.getElementById('inp-pe')?.value || "0",
    sl: document.getElementById('inp-sl')?.value || "0",
    tp: document.getElementById('inp-tp')?.value || "0",
    tipo: document.getElementById('op-tipo')?.value || "Long",
    fecha: new Date().toLocaleDateString()
  };

  let portafolio = JSON.parse(localStorage.getItem('mi_portafolio') || '[]');
  portafolio.push(operacion);
  localStorage.setItem('mi_portafolio', JSON.stringify(portafolio));

  alert(`✅ ${activoSeleccionado} guardado en tu portafolio.`);
  renderizarPortafolio();
}

function renderizarPortafolio() {
  const contenedor = document.getElementById('tab-portafolio');
  if (!contenedor) return;

  const portafolio = JSON.parse(localStorage.getItem('mi_portafolio') || '[]');

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
    html += `
      <tr>
        <td>${item.fecha}</td>
        <td><b>${item.ticker}</b></td>
        <td>${item.tipo}</td>
        <td>$${item.entry}</td>
        <td class="text-neg">$${item.sl}</td>
        <td class="text-pos">$${item.tp}</td>
        <td><button style="background:var(--neg-red); color:#fff; border:none; padding:4px 8px; border-radius:3px; cursor:pointer;" onclick="eliminarDelPortafolio(${item.id})">Eliminar</button></td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  contenedor.innerHTML = html;
}

function eliminarDelPortafolio(id) {
  let portafolio = JSON.parse(localStorage.getItem('mi_portafolio') || '[]');
  portafolio = portafolio.filter(item => item.id !== id);
  localStorage.setItem('mi_portafolio', JSON.stringify(portafolio));
  renderizarPortafolio();
}

// INICIALIZACIÓN
window.addEventListener('DOMContentLoaded', () => {
  cargarPestanaScanner();
});