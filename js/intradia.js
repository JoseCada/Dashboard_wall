/* Operativa Intradía: diario y contabilidad simulada local, sin Supabase. */
(() => {
  'use strict';
  const STORAGE_KEY = 'dashboard_intradia_trades_v1';
  const CAPITAL_KEY = 'dashboard_intradia_capital_v1';
  let loaded = false;
  let trades = [];
  let capital = 10000;

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
    } catch (e) {
      alert('No se pudieron guardar los datos en este navegador. Exporta una copia de seguridad y comprueba el almacenamiento disponible.');
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
        renderizarIntradia();
      } catch (e) {
        console.error(e);
        container.innerHTML = '<section class="side-card" style="padding:20px;color:var(--neg-red)">No se pudo cargar tabs/tab5.html. Comprueba que el archivo esté en la carpeta tabs.</section>';
      }
    } else {
      renderizarIntradia();
    }
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
    $('id-qty').value = '1';
    $('id-fees').value = '0';
    $('id-date').value = nowLocalInput();
    $('id-form-title').textContent = '➕ Registrar operación simulada';
  };
  window.guardarOperacionIntradia = function(event) {
    event?.preventDefault();
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
    const trade = {
      id: (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`),
      ticker, market: $('id-market').value, side: $('id-side').value, date,
      entry, stop: stop > 0 ? stop : null, target: target > 0 ? target : null,
      qty, fees, current: currentRaw !== '' && currentRaw != null && num(currentRaw) > 0 ? num(currentRaw) : entry,
      notes: ($('id-notes')?.value || '').trim(), status:'open', exit:null, closeDate:null, closeReason:''
    };
    trades.unshift(trade);
    persist();
    const chartInput = $('id-chart-ticker');
    if (chartInput && !chartInput.value) chartInput.value = ticker;
    renderizarIntradia();
    window.limpiarFormularioIntradia();
  };
  window.renderizarIntradia = function() {
    if (!$('id-trades-body')) return;
    const closed = trades.filter(t => t.status === 'closed');
    const opened = trades.filter(t => t.status === 'open');
    const realized = closed.reduce((sum,t) => sum + num(t.realized), 0);
    const unrealized = opened.reduce((sum,t) => sum + pnl(t, t.current), 0);
    const winners = closed.filter(t => num(t.realized) > 0);
    const losers = closed.filter(t => num(t.realized) < 0);
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
    const list = trades.filter(t => filter === 'all' || (filter === 'open' ? t.status === 'open' : t.status === 'closed'));
    $('id-count').textContent = `${list.length} operación${list.length === 1 ? '' : 'es'}`;
    if (!list.length) {
      $('id-trades-body').innerHTML = '<tr><td colspan="11" class="id-empty">No hay operaciones en esta vista.</td></tr>';
      return;
    }
    $('id-trades-body').innerHTML = list.map(t => {
      const result = t.status === 'closed' ? num(t.realized) : pnl(t,t.current);
      const resultClass = result >= 0 ? 'text-pos' : 'text-neg';
      const stopTarget = `${t.stop == null ? '—' : esc(t.stop)} / ${t.target == null ? '—' : esc(t.target)}`;
      const date = esc(String(t.date || '').replace('T',' '));
      const note = t.notes ? esc(t.notes) : '—';
      const actions = t.status === 'open'
        ? `<button class="btn-secondary id-small-btn" onclick="actualizarPrecioIntradia('${esc(t.id)}')">Precio</button> <button class="btn-primary id-small-btn" onclick="cerrarOperacionIntradia('${esc(t.id)}')">Cerrar</button>`
        : `<button class="btn-secondary id-small-btn" onclick="verDetalleIntradia('${esc(t.id)}')">Ver</button>`;
      return `<tr><td>${date}</td><td><strong>${esc(t.ticker)}</strong></td><td>${esc(t.market)}</td><td>${t.side === 'Long' ? '📈 Long' : '📉 Short'}</td><td>${money(t.entry)}</td><td>${stopTarget}</td><td>${money(t.qty)}</td><td class="${resultClass}">${result > 0 ? '+' : ''}${money(result)} €</td><td><span class="id-status ${t.status}">${t.status === 'open' ? 'Abierta' : 'Cerrada'}</span></td><td class="id-note-cell" title="${note}">${note}</td><td class="id-action-cell">${actions}</td></tr>`;
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
    t.exit = exit; t.closeDate = nowLocalInput(); t.closeReason = reason; t.status = 'closed';
    t.realized = pnl(t, exit);
    persist(); renderizarIntradia();
  };
  window.verDetalleIntradia = function(id) {
    const t = trades.find(x => x.id === id);
    if (!t) return;
    alert(`${t.ticker} · ${t.side}\nEntrada: ${t.entry}\nCierre: ${t.exit}\nCantidad: ${t.qty}\nResultado: ${money(t.realized)} €\nFecha: ${t.date}\nCierre: ${t.closeDate || '—'}\nMotivo: ${t.closeReason || '—'}\n\nNotas:\n${t.notes || 'Sin notas'}`);
  };
  window.cargarGraficoIntradia = function() {
    const raw = ($('id-chart-ticker')?.value || $('id-ticker')?.value || '').trim().toUpperCase();
    if (!raw) return alert('Introduce un ticker. Ejemplos: OANDA:EURUSD, NASDAQ:AAPL, CME_MINI:ES1!');
    const symbol = raw.includes(':') ? raw : raw;
    const wrap = $('id-tv-wrap');
    if (!wrap) return;
    $('id-chart-symbol').textContent = symbol;
    const frame = document.createElement('iframe');
    frame.title = `Gráfico TradingView de ${symbol}`;
    frame.loading = 'lazy';
    frame.referrerPolicy = 'no-referrer-when-downgrade';
    frame.src = `https://s.tradingview.com/widgetembed/?frameElementId=tv_intradia_${Date.now()}&symbol=${encodeURIComponent(symbol)}&interval=5&hidesidetoolbar=0&symboledit=1&saveimage=0&toolbarbg=%231e222d&studies=%5B%5D&theme=dark&style=1&timezone=Europe%2FMadrid&withdateranges=1&hideideas=1&locale=es`;
    wrap.replaceChildren(frame);
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
