// DATOS DE PRUEBA
const mockData = {
  gainers: [
    { ticker: "NVDA", price: 130.00, change: 4.25, target: 154.00, upside: 18.5 },
    { ticker: "AAPL", price: 224.50, change: 1.80, target: 250.00, upside: 11.35 },
    { ticker: "MSFT", price: 448.00, change: 2.10, target: 500.00, upside: 11.60 },
    { ticker: "AMZN", price: 186.30, change: 3.15, target: 220.00, upside: 18.08 }
  ],
  losers: [
    { ticker: "TSLA", price: 210.20, change: -3.40, target: 240.00, upside: 14.17 },
    { ticker: "INTC", price: 20.50, change: -2.15, target: 25.00, upside: 21.95 },
    { ticker: "NKE", price: 82.10, change: -1.90, target: 95.00, upside: 15.71 }
  ]
};

let activoSeleccionado = "NVDA";
let timeframeSeleccionado = "D";

// CAMBIO DE PESTAÑAS
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

// GRÁFICO TRADINGVIEW
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

// CÓDIGO DE MERCADO Y TABLA
function cargarListaMercado() {
  const selElement = document.getElementById('sel-screener');
  if (!selElement) return;

  const filtro = selElement.value;
  const tbody = document.getElementById('tbl-activos-body');
  const lista = mockData[filtro] || [];

  tbody.innerHTML = '';
  lista.forEach((item) => {
    const tr = document.createElement('tr');
    if (item.ticker === activoSeleccionado) tr.classList.add('active-row');

    const colorClase = item.change >= 0 ? 'text-pos' : 'text-neg';
    const signo = item.change >= 0 ? '+' : '';

    tr.innerHTML = `
      <td><b>${item.ticker}</b></td>
      <td>$${item.price.toFixed(2)}</td>
      <td class="${colorClase}">${signo}${item.change.toFixed(2)}%</td>
    `;

    tr.onclick = () => seleccionarFilaActivo(item, tr);
    tbody.appendChild(tr);
  });

  if (lista.length > 0) {
    seleccionarFilaActivo(lista[0]);
  }
}

function seleccionarFilaActivo(item, filaTr) {
  activoSeleccionado = item.ticker;

  document.querySelectorAll('#tbl-activos-body tr').forEach(r => r.classList.remove('active-row'));
  if (filaTr) filaTr.classList.add('active-row');

  document.getElementById('mb-ticker').innerText = item.ticker;
  document.getElementById('mb-precio').innerText = `$${item.price.toFixed(2)}`;
  document.getElementById('mb-target').innerText = `$${item.target.toFixed(2)}`;
  document.getElementById('mb-upside').innerText = `+${item.upside}%`;

  document.getElementById('inp-pe').value = item.price.toFixed(2);
  document.getElementById('inp-sl').value = (item.price * 0.95).toFixed(2);
  document.getElementById('inp-tp').value = item.target.toFixed(2);

  recalcularRisk();
  renderGraficoTV(item.ticker, timeframeSeleccionado);
}

function cambiarTimeframe(tf) {
  timeframeSeleccionado = tf;
  renderGraficoTV(activoSeleccionado, timeframeSeleccionado);
}

// CÁLCULO DE RIESGO / BENEFICIO
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

// PERSISTENCIA EN LOCALSTORAGE (GUARDA FAVORITOS/PORTAFOLIO)
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
  cargarListaMercado();
});