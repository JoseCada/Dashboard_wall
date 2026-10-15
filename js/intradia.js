/* Operativa Intradía: diario y contabilidad simulada local, sin Supabase. */
(() => {
  'use strict';
  const STORAGE_KEY = 'dashboard_intradia_trades_v1';
  const CAPITAL_KEY = 'dashboard_intradia_capital_v1';
  let loaded = false;
  let trades = [];
  let capital = 10000;
  const ASSETS = {
    'GC1!': { market: 'Futuros', tv: 'COMEX:GC1!' },
    'CL1!': { market: 'Futuros', tv: 'NYMEX:CL1!' },
    'NQ1!': { market: 'Futuros', tv: 'CME_MINI:NQ1!' },
    'ES1!': { market: 'Futuros', tv: 'CME_MINI:ES1!' },
    'MNQ1!': { market: 'Futuros', tv: 'CME_MINI:MNQ1!' },
    'EURUSD': { market: 'Forex', tv: 'FX:EURUSD' }
  };

  const $ = id => document.getElementById(id);
  const num = value => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };
  const money = value => num(value).toLocaleString('es-ES', {minimumFractionDigits:2, maximumFractionDigits:2});
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const nowLocalInput = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0,16);
  };
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      trades = Array.isArray(saved) ? saved : [];
      const savedCapital = Number(localStorage.getItem(CAPITAL_KEY));
      if (Number.isFinite(savedCapital) && savedCapital >= 0) capital = savedCapital;
    } catch (e) {
      console.warn('No se pudieron leer los datos locales de intradía', e);
      trades = [];
    }
  }
  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
      localStorage.setItem(CAPITAL_KEY, String(capital));
      return true;
    } catch (e) {
      console.error('Error guardando el diario de intradía:', e);
      alert('No se pudieron guardar los datos en este navegador. Comprueba que el sitio permita almacenamiento local y que no estés en navegación privada.');
      return false;
    }
  }
  function pnl(trade, price, includeFees = true) {
    const diff = trade.side === 'Short' ? num(trade.entry) - num(price) : num(price) - num(trade.entry);
    return diff * num(trade.qty) - (includeFees ? num(trade.fees) : 0);
  }
  window.cargarPestanaIntradia = async function() {
    const container = $('tab-intradia');
    if (!container) return;
    if (!loaded) {
      try {
        const response = await fetch('tabs/tab5.html');
        if (!response.ok) throw new Error('No se pudo cargar tabs/tab5.html');
        container.innerHTML = await response.text();
        loaded = true;
        load();
        $('id-capital').value = String(capital);
        $('id-date').value = nowLocalInput();
        window.seleccionarActivoIntradia();
        renderizarIntradia();
        ['id-entry','id-stop','id-target','id-side'].forEach(id => $(id)?.addEventListener('input', window.calcularRiesgoBeneficioIntradia));
        $('id-side')?.addEventListener('change', window.calcularRiesgoBeneficioIntradia);
        window.calcularRiesgoBeneficioIntradia();
      } catch (e) {
        console.error(e);
        container.innerHTML = '<section class="side-card" style="padding:20px;color:var(--neg-red)">No se pudo cargar tabs/tab5.html. Comprueba que el archivo esté en la carpeta tabs.</section>';
      }
    } else {
      renderizarIntradia();
    }
  };
  window.seleccionarActivoIntradia = function() {
    const ticker = $('id-ticker')?.value || 'GC1!';
    const asset = ASSETS[ticker] || { market: 'Otro', tv: ticker };
    const marketSelect = $('id-market');
    if (marketSelect) marketSelect.value = asset.market;
    const chartLabel = $('id-chart-symbol');
    if (chartLabel) chartLabel.textContent = asset.tv;
    const chartButton = document.querySelector('.intradia-chart-card .id-chart-heading button');
    // Carga el gráfico al cambiar de activo, si el panel ya está montado.
    if ($('id-tv-wrap')) window.cargarGraficoIntradia();
  };
  function ratioRiesgoBeneficio(side, entry, stop, target) {
    if (!(entry > 0) || !(stop > 0) || !(target > 0)) return null;
    const risk = side === 'Short' ? stop - entry : entry - stop;
    const reward = side === 'Short' ? entry - target : target - entry;
    if (!(risk > 0) || !(reward > 0)) return null;
    return { risk, reward, ratio: reward / risk };
  }
  window.calcularRiesgoBeneficioIntradia = function() {
    const box = $('id-rb-value');
    const detail = $('id-rb-detail');
    if (!box || !detail) return;
    const entry = Number($('id-entry')?.value);
    const stop = Number($('id-stop')?.value);
    const target = Number($('id-target')?.value);
    const side = $('id-side')?.value || 'Long';
    const rb = ratioRiesgoBeneficio(side, entry, stop, target);
    box.className = '';
    if (!rb) {
      box.textContent = 'No disponible';
      detail.textContent = 'Introduce entrada, stop y objetivo válidos para la dirección elegida.';
      return;
    }
    box.textContent = `1 : ${rb.ratio.toFixed(2).replace('.', ',')}`;
    box.className = rb.ratio >= 2 ? 'id-rb-good' : 'id-rb-bad';
    detail.textContent = `Riesgo: ${money(rb.risk)} · Beneficio potencial: ${money(rb.reward)} por unidad de precio.`;
  };
  window.guardarCapitalIntradia = function() {
    const value = Number($('id-capital')?.value);
    if (!Number.isFinite(value) || value < 0) return alert('Introduce un capital inicial válido (0 o superior).');
    capital = value; persist(); renderizarIntradia();
  };
  window.limpiarFormularioIntradia = function() {
    const form = $('id-trade-form');
    if (!form) return;
    form.reset();
    $('id-ticker').value = 'GC1!';
    window.seleccionarActivoIntradia();
    window.calcularRiesgoBeneficioIntradia();
    $('id-qty').value = '1';
    $('id-fees').value = '0';
    $('id-date').value = nowLocalInput();
    $('id-form-title').textContent = '➕ Registrar operación simulada';
  };
  window.guardarOperacionIntradia = function(event) {
    event?.preventDefault();
    const notice = $('id-save-notice');
    if (notice) { notice.hidden = true; notice.textContent = ''; }
    try {
    const ticker = ($('id-ticker')?.value || '').trim().toUpperCase();
    const entry = Number($('id-entry')?.value);
    const qty = Number($('id-qty')?.value);
    const date = $('id-date')?.value;
    const fees = Number($('id-fees')?.value || 0);
    if (!ticker || !date || !Number.isFinite(entry) || entry <= 0 || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(fees) || fees < 0) {
      alert('Revisa ticker, fecha, precio de entrada, cantidad y comisión.'); return;
    }
    const stop = num($('id-stop')?.value);
    const target = num($('id-target')?.value);
    const currentRaw = $('id-current')?.value;
    const asset = ASSETS[ticker] || { market: 'Otro', tv: ticker };
    const trade = {
      id: (window.crypto && typeof window.crypto.randomUUID === 'function' ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`),
      ticker, market: asset.market, side: $('id-side')?.value || 'Long', date,
      entry, stop: stop > 0 ? stop : null, target: target > 0 ? target : null,
      qty, fees, current: currentRaw !== '' && currentRaw != null && num(currentRaw) > 0 ? num(currentRaw) : entry,
      notes: ($('id-notes')?.value || '').trim(), status:'open', exit:null, closeDate:null, closeReason:''
    };
    trades.unshift(trade);
    if (!persist()) { trades.shift(); return; }
    // Confirma visualmente que el registro se guardó y actualiza la tabla.
    renderizarIntradia();
    window.seleccionarActivoIntradia();
    window.limpiarFormularioIntradia();
    if (notice) { notice.textContent = `Operación ${ticker} guardada correctamente.`; notice.hidden = false; notice.style.color = '#39c98a'; }
    else alert(`Operación ${ticker} guardada correctamente.`);
    } catch (error) {
      console.error('No se pudo guardar la operación intradía:', error);
      if (notice) {
        notice.textContent = `No se pudo guardar la operación: ${error?.message || error}`;
        notice.hidden = false;
        notice.style.color = '#ff7373';
      } else {
        alert(`No se pudo guardar la operación: ${error?.message || error}`);
      }
    }
  };
  window.renderizarIntradia = function() {
    if (!$('id-trades-body')) return;
    const closed = trades.filter(t => t.status !== 'open');
    const opened = trades.filter(t => t.status === 'open');
    const realized = closed.reduce((sum,t) => sum + num(t.realized), 0);
    const unrealized = opened.reduce((sum,t) => sum + pnl(t, t.current), 0);
    const winners = closed.filter(t => num(t.realized) > 0 || t.status === 'closed_win');
    const losers = closed.filter(t => num(t.realized) < 0 || t.status === 'closed_loss');
    const grossWin = winners.reduce((sum,t) => sum + num(t.realized), 0);
    const grossLoss = Math.abs(losers.reduce((sum,t) => sum + num(t.realized), 0));
    $('id-equity').textContent = `${money(capital + realized)} €`;
    $('id-net').textContent = `${realized > 0 ? '+' : ''}${money(realized)} €`;
    $('id-net').className = `val ${realized >= 0 ? 'text-pos' : 'text-neg'}`;
    $('id-closed').textContent = String(closed.length);
    $('id-winrate').textContent = closed.length ? `${(winners.length / closed.length * 100).toFixed(1).replace('.',',')}%` : '—';
    $('id-openpnl').textContent = `${unrealized > 0 ? '+' : ''}${money(unrealized)} €`;
    $('id-openpnl').className = `val ${unrealized >= 0 ? 'text-pos' : 'text-neg'}`;
    $('id-pf').textContent = grossLoss ? (grossWin / grossLoss).toFixed(2) : (grossWin ? '∞' : '—');
    const filter = $('id-filter')?.value || 'all';
    const list = trades.filter(t => filter === 'all' || (filter === 'open' ? t.status === 'open' : t.status !== 'open'));
    $('id-count').textContent = `${list.length} operación${list.length === 1 ? '' : 'es'}`;
    if (!list.length) {
      $('id-trades-body').innerHTML = '<tr><td colspan="11" class="id-empty">No hay operaciones en esta vista.</td></tr>';
      return;
    }
    $('id-trades-body').innerHTML = list.map(t => {
      const result = t.status === 'closed' ? num(t.realized) : pnl(t,t.current);
      const resultClass = result >= 0 ? 'text-pos' : 'text-neg';
      const stopTarget = `${t.stop == null ? '—' : esc(t.stop)} / ${t.target == null ? '—' : esc(t.target)}`;
      const rb = ratioRiesgoBeneficio(t.side, num(t.entry), num(t.stop), num(t.target));
      const rbText = rb ? `1:${rb.ratio.toFixed(2)}` : '—';
      const date = esc(String(t.date || '').replace('T',' '));
      const note = t.notes ? esc(t.notes) : '—';
      const actions = t.status === 'open'
        ? `<button class="btn-secondary id-small-btn" onclick="actualizarPrecioIntradia('${esc(t.id)}')">Precio</button> <button class="btn-primary id-small-btn" onclick="cerrarOperacionIntradia('${esc(t.id)}')">Cerrar</button> <button class="btn-secondary id-small-btn" onclick="cambiarEstadoOperacionIntradia('${esc(t.id)}')">Estado</button>`
        : `<button class="btn-secondary id-small-btn" onclick="verDetalleIntradia('${esc(t.id)}')">Ver</button> <button class="btn-secondary id-small-btn" onclick="cambiarEstadoOperacionIntradia('${esc(t.id)}')">Estado</button>`;
      const statusLabel = t.status === 'open' ? 'Abierta' : t.status === 'closed_win' ? 'Cerrada con ganancias' : t.status === 'closed_loss' ? 'Cerrada con pérdidas' : (num(t.realized) >= 0 ? 'Cerrada con ganancias' : 'Cerrada con pérdidas');
      return `<tr><td>${date}</td><td><strong>${esc(t.ticker)}</strong></td><td>${esc(t.market)}</td><td>${t.side === 'Long' ? '📈 Long' : '📉 Short'}</td><td>${money(t.entry)}</td><td>${stopTarget}</td><td>${rbText}</td><td>${money(t.qty)}</td><td class="${resultClass}">${result > 0 ? '+' : ''}${money(result)} €</td><td><span class="id-status ${t.status}">${statusLabel}</span></td><td class="id-note-cell" title="${note}">${note}</td><td class="id-action-cell">${actions}</td></tr>`;
    }).join('');
  };
  window.actualizarPrecioIntradia = function(id) {
    const t = trades.find(x => x.id === id && x.status === 'open');
    if (!t) return;
    const value = prompt(`Precio actual para ${t.ticker}:`, String(t.current ?? t.entry));
    if (value === null) return;
    const price = Number(value);
    if (!Number.isFinite(price) || price <= 0) return alert('Introduce un precio válido mayor que cero.');
    t.current = price; persist(); renderizarIntradia();
  };
  window.cerrarOperacionIntradia = function(id) {
    const t = trades.find(x => x.id === id && x.status === 'open');
    if (!t) return;
    const raw = prompt(`Precio de cierre para ${t.ticker}:`, String(t.current ?? t.entry));
    if (raw === null) return;
    const exit = Number(raw);
    if (!Number.isFinite(exit) || exit <= 0) return alert('Introduce un precio válido mayor que cero.');
    const reason = prompt('Motivo de cierre (opcional):', 'Cierre manual') ?? 'Cierre manual';
    t.exit = exit; t.closeDate = nowLocalInput(); t.closeReason = reason;
    t.realized = pnl(t, exit); t.status = t.realized >= 0 ? 'closed_win' : 'closed_loss';
    persist(); renderizarIntradia();
  };
  window.cambiarEstadoOperacionIntradia = function(id) {
    const t = trades.find(x => x.id === id);
    if (!t) return;
    const choice = prompt('Estado de la operación:\n1 = Abierta\n2 = Cerrada con ganancias\n3 = Cerrada con pérdidas', t.status === 'open' ? '1' : (num(t.realized) >= 0 ? '2' : '3'));
    if (choice === null) return;
    if (!['1','2','3'].includes(choice.trim())) return alert('Elige 1, 2 o 3.');
    if (choice.trim() === '1') {
      t.status = 'open'; t.exit = null; t.realized = null; t.closeDate = null; t.closeReason = '';
    } else {
      const raw = prompt('Introduce el precio de cierre para calcular el resultado:', String(t.exit ?? t.current ?? t.entry));
      if (raw === null) return;
      const exit = Number(raw);
      if (!Number.isFinite(exit) || exit <= 0) return alert('Introduce un precio de cierre válido.');
      const realized = pnl(t, exit);
      if (choice.trim() === '2' && realized <= 0) return alert('Con ese precio la operación no tiene ganancias. Revisa el precio o selecciona pérdidas.');
      if (choice.trim() === '3' && realized >= 0) return alert('Con ese precio la operación no tiene pérdidas. Revisa el precio o selecciona ganancias.');
      t.exit = exit; t.current = exit; t.realized = realized; t.closeDate = nowLocalInput();
      t.status = choice.trim() === '2' ? 'closed_win' : 'closed_loss';
      t.closeReason = choice.trim() === '2' ? 'Cerrada con ganancias' : 'Cerrada con pérdidas';
    }
    persist(); renderizarIntradia();
  };
  window.verDetalleIntradia = function(id) {
    const t = trades.find(x => x.id === id);
    if (!t) return;
    alert(`${t.ticker} · ${t.side}\nEntrada: ${t.entry}\nCierre: ${t.exit}\nCantidad: ${t.qty}\nResultado: ${money(t.realized)} €\nFecha: ${t.date}\nCierre: ${t.closeDate || '—'}\nMotivo: ${t.closeReason || '—'}\n\nNotas:\n${t.notes || 'Sin notas'}`);
  };
  window.abrirTradingViewIntradia = function() {
    const ticker = ($('id-ticker')?.value || 'GC1!').trim().toUpperCase();
    const symbol = (ASSETS[ticker] || {tv:ticker}).tv;
    const url = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };
  window.cargarGraficoIntradia = function() {
    const ticker = ($('id-ticker')?.value || 'GC1!').trim().toUpperCase();
    const symbol = (ASSETS[ticker] || {tv:ticker}).tv;
    const wrap = $('id-tv-wrap');
    if (!wrap) return;
    const label = $('id-chart-symbol');
    if (label) label.textContent = `${ticker} · ${symbol}`;

    // No intentamos incrustar los futuros continuos: TradingView restringe
    // algunos símbolos en widgets embebidos. El diario permanece en esta pestaña
    // y el análisis se abre en la web completa de TradingView.
    const message = document.createElement('div');
    message.className = 'id-tv-placeholder';
    message.innerHTML = `<strong>${esc(ticker)}</strong><p>El diario de operaciones permanece aquí. Abre el gráfico completo de este activo en una pestaña nueva de TradingView para analizar el precio.</p><button type="button" class="btn-primary">Abrir gráfico en TradingView ↗</button>`;
    message.querySelector('button').addEventListener('click', window.abrirTradingViewIntradia);
    wrap.replaceChildren(message);
  };
  function download(name, content, type) {
    const blob = new Blob([content], {type});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  window.exportarIntradiaJSON = function() {
    download(`diario_intradia_${new Date().toISOString().slice(0,10)}.json`, JSON.stringify({version:1,capital,trades},null,2), 'application/json;charset=utf-8');
  };
  window.exportarIntradiaCSV = function() {
    const columns = ['date','closeDate','ticker','market','side','entry','stop','target','qty','fees','current','exit','realized','status','closeReason','notes'];
    const cell = v => `"${String(v ?? '').replace(/"/g,'""')}"`;
    const csv = [columns.join(';'), ...trades.map(t => columns.map(c => cell(t[c])).join(';'))].join('\r\n');
    download(`diario_intradia_${new Date().toISOString().slice(0,10)}.csv`, '\ufeff'+csv, 'text/csv;charset=utf-8');
  };
  window.importarIntradiaJSON = function() {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!data || !Array.isArray(data.trades)) throw new Error('Formato no válido');
        if (!confirm(`Se importarán ${data.trades.length} operaciones y se reemplazará el diario actual. ¿Continuar?`)) return;
        trades = data.trades.filter(t => t && t.id && t.ticker && Number.isFinite(Number(t.entry)) && ['open','closed'].includes(t.status));
        if (Number.isFinite(Number(data.capital)) && Number(data.capital) >= 0) capital = Number(data.capital);
        persist(); if ($('id-capital')) $('id-capital').value = String(capital); renderizarIntradia();
        alert(`Importadas ${trades.length} operaciones.`);
      } catch(e) { alert('No se pudo importar el archivo JSON: '+e.message); }
    };
    input.click();
  };
})();
