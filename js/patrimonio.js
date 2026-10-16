(() => {
  const KEY = 'dashboard_plan_patrimonial_v1';
  let cargada = false;
  let trades = [];
  let settings = { capital: 10000, goal: 100 };
  const $ = id => document.getElementById(id);
  const num = id => Number.parseFloat($(id)?.value || '0');
  const money = n => Number(n || 0).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' $';
  const safe = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function load(){try{const d=JSON.parse(localStorage.getItem(KEY)||'{}');trades=Array.isArray(d.trades)?d.trades:[];settings={...settings,...(d.settings||{})};}catch(e){trades=[];settings={capital:10000,goal:100};}}
  function save(){localStorage.setItem(KEY,JSON.stringify({version:1,settings,trades}));}
  function calc(){
    const cap=num('pat-capital')||settings.capital||10000, entry=num('pat-entry'), stop=num('pat-stop'), target=num('pat-target'), allocation=num('pat-allocation'), riskPct=num('pat-risk-pct'), fees=num('pat-fees');
    const riskCash=cap*riskPct/100; let shares=0, used=0, risk=0, rr=0, targetPct=0; const valid=entry>0&&stop>0&&target>entry&&stop<entry&&allocation>0&&cap>0;
    if(valid){shares=Math.max(0,Math.floor(Math.min(riskCash/(entry-stop),(cap*0.20)/entry,allocation/entry)));used=shares*entry;risk=shares*(entry-stop)+fees;rr=(target-entry)/(entry-stop);targetPct=(target/entry-1)*100;}
    return {cap,entry,stop,target,allocation,riskPct,fees,riskCash,shares,used,risk,rr,targetPct,valid};
  }
  function renderMetrics(){
    const closed=trades.filter(t=>t.status!=='OPEN'), wins=closed.filter(t=>Number(t.pnl)>0), losses=closed.filter(t=>Number(t.pnl)<=0), open=trades.filter(t=>t.status==='OPEN');
    const net=closed.reduce((s,t)=>s+Number(t.pnl||0),0), equity=Number(settings.capital)+net, goal=Math.max(1,Number(settings.goal)||100), pct=Math.min(100,closed.length/goal*100);
    $('pat-capital').value=settings.capital; $('pat-meta').value=goal;
    $('pat-progress-label').textContent=`${closed.length} / ${goal}`; $('pat-progress-bar').style.width=pct+'%'; $('pat-progress-pct').textContent=pct.toFixed(0)+' % completado';
    $('pat-equity').textContent=money(equity); $('pat-net').textContent='Resultado neto: '+money(net); $('pat-closed').textContent=closed.length; $('pat-open').textContent='Abiertas: '+open.length;
    $('pat-winrate').textContent=closed.length?(wins.length/closed.length*100).toFixed(1)+' %':'—'; $('pat-wl').textContent=`Ganadoras: ${wins.length} · Perdedoras: ${losses.length}`; $('pat-risk-cash').textContent=money(equity*0.005);
  }
  function renderTrades(){
    const body=$('pat-trades-body'); if(!body)return;
    if(!trades.length){body.innerHTML='<tr><td colspan="10" class="pat-empty">Todavía no hay operaciones registradas.</td></tr>';return;}
    body.innerHTML=trades.slice().sort((a,b)=>(b.created||'').localeCompare(a.created||'')).map(t=>{
      const status=t.status==='OPEN'?'<span class="pat-state pat-state-open">Abierta</span>':t.status==='WIN'?'<span class="pat-state pat-state-win">Ganadora</span>':'<span class="pat-state pat-state-loss">Perdedora</span>';
      const pnl=t.status==='OPEN'?'—':money(t.pnl);
      const close=t.status==='OPEN'?`<button class="pat-btn" onclick="patCerrarOperacion('${t.id}')">Cerrar</button>`:'';
      return `<tr><td>${safe(t.date)}</td><td><b>${safe(t.ticker)}</b></td><td>${Number(t.entry).toFixed(2)} $</td><td>${Number(t.stop).toFixed(2)} $</td><td>${Number(t.target).toFixed(2)} $</td><td>${t.shares}</td><td>${money(t.risk)}</td><td>${pnl}</td><td>${status}</td><td>${close}<button class="pat-btn" onclick="patEliminarOperacion('${t.id}')">Eliminar</button></td></tr>`;
    }).join('');
  }
  function render(){renderMetrics();renderTrades();}
  window.cargarPestanaPatrimonio=async function(){
    const container=$('tab-patrimonio');if(!container)return;
    if(!cargada){try{const res=await fetch('tabs/tab6.html');if(!res.ok)throw new Error('No se pudo cargar tabs/tab6.html');container.innerHTML=await res.text();cargada=true;load();$('pat-date').value=new Date().toISOString().slice(0,10);container.querySelectorAll('[data-score]').forEach(el=>el.addEventListener('change',patActualizarPuntuacion));renderMetrics();renderTrades();patCalcularPlan();}catch(e){container.innerHTML='<p style="padding:20px;color:#ff7373">Error al cargar la pestaña Plan Patrimonial. Revisa la ruta de tabs/tab6.html.</p>';console.error(e);}}
    else {load();render();}
  };
  window.patGuardarAjustes=function(){const capital=num('pat-capital'),goal=Math.floor(num('pat-meta'));if(!(capital>0)||!(goal>0)){alert('Introduce un capital y una meta válidos.');return;}settings={capital,goal};save();renderMetrics();};
  window.patActualizarPuntuacion=function(){let score=0;document.querySelectorAll('#tab-patrimonio [data-score]:checked').forEach(x=>score+=Number(x.dataset.score));const el=$('pat-score'),status=$('pat-score-status');if(!el||!status)return;el.textContent=score+' / 100';status.className='pat-score-status '+(score>=70?'pat-status-good':score>=50?'pat-status-warn':'pat-status-bad');status.textContent=score>=70?'Candidata apta para análisis final':score>=50?'Faltan criterios importantes':'No alcanza el mínimo';};
  window.patResetScore=function(){document.querySelectorAll('#tab-patrimonio [data-score]').forEach(x=>x.checked=false);patActualizarPuntuacion();};
  window.patCalcularPlan=function(){const d=calc();if(!$('pat-calc-risk'))return;$('pat-calc-risk').textContent=money(d.riskCash);$('pat-calc-shares').textContent=d.valid?String(d.shares):'—';$('pat-calc-used').textContent=money(d.used);$('pat-calc-rr').textContent=d.valid?d.rr.toFixed(2)+':1':'—';$('pat-calc-target-pct').textContent=d.valid?d.targetPct.toFixed(1)+' %':'—';};
  window.patGuardarOperacion=function(ev){ev.preventDefault();const d=calc(),ticker=$('pat-ticker').value.trim().toUpperCase(),date=$('pat-date').value,reason=$('pat-reason').value.trim();if(!ticker||!date||!d.valid){$('pat-form-notice').textContent='Revisa ticker, fecha, entrada, stop y objetivo (stop < entrada < objetivo).';return;}if(d.shares<1){$('pat-form-notice').textContent='Con esos límites no cabe una acción. Reduce el tamaño o descarta la operación; no acerques el stop artificialmente.';return;}const score=[...document.querySelectorAll('#tab-patrimonio [data-score]:checked')].reduce((s,x)=>s+Number(x.dataset.score),0);if(!confirm(`Guardar ${ticker} como operación abierta con ${d.shares} acciones, riesgo previsto ${money(d.risk)} y objetivo +${d.targetPct.toFixed(1)} %?\nLa puntuación de selección actual es ${score}/100.`))return;trades.push({id:Date.now().toString(36)+Math.random().toString(36).slice(2,7),ticker,date,entry:d.entry,stop:d.stop,target:d.target,shares:d.shares,allocation:d.used,risk:d.risk,rr:d.rr,targetPct:d.targetPct,fees:d.fees,reason,status:'OPEN',pnl:0,created:new Date().toISOString(),selectionScore:score});save();render();$('pat-form-notice').textContent='Operación guardada.';$('pat-trade-form').reset();$('pat-date').value=new Date().toISOString().slice(0,10);$('pat-allocation').value='2000';$('pat-risk-pct').value='0.5';$('pat-fees').value='0';patCalcularPlan();};
  window.patCerrarOperacion=function(id){const t=trades.find(x=>x.id===id);if(!t||t.status!=='OPEN')return;const raw=prompt(`Precio de salida para ${t.ticker} (entrada ${t.entry} $):`);if(raw===null)return;const close=Number.parseFloat(raw.replace(',','.'));if(!(close>0)){alert('Precio de salida no válido.');return;}const feeRaw=prompt('Costes totales de la operación en $ (comisiones y otros costes):',String(t.fees||0));if(feeRaw===null)return;const fees=Number.parseFloat(feeRaw.replace(',','.'));if(!(fees>=0)){alert('Costes no válidos.');return;}const gross=(close-t.entry)*t.shares;t.close=close;t.closeDate=new Date().toISOString().slice(0,10);t.pnl=gross-fees;t.fees=fees;t.status=t.pnl>0?'WIN':'LOSS';save();render();};
  window.patEliminarOperacion=function(id){if(!confirm('¿Eliminar esta operación del registro? Esta acción no se puede deshacer salvo que tengas una copia JSON.'))return;trades=trades.filter(t=>t.id!==id);save();render();};
  window.patLimpiarFormulario=function(){$('pat-trade-form').reset();$('pat-date').value=new Date().toISOString().slice(0,10);$('pat-allocation').value='2000';$('pat-risk-pct').value='0.5';$('pat-fees').value='0';$('pat-form-notice').textContent='';patCalcularPlan();};
  window.patExportar=function(){const blob=new Blob([JSON.stringify({version:1,settings,trades},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='plan_patrimonial_operaciones.json';a.click();URL.revokeObjectURL(url);};
  window.patImportar=function(){const inp=document.createElement('input');inp.type='file';inp.accept='.json,application/json';inp.onchange=()=>{const f=inp.files&&inp.files[0];if(!f)return;const reader=new FileReader();reader.onload=()=>{try{const d=JSON.parse(reader.result);if(!Array.isArray(d.trades)||!d.settings)throw new Error('Formato no válido');if(!confirm(`Importar ${d.trades.length} operaciones y sustituir el registro actual? Exporta una copia antes si la necesitas.`))return;trades=d.trades;settings={...settings,...d.settings};save();render();}catch(e){alert('No se pudo importar: el archivo no tiene el formato esperado.');}};reader.readAsText(f);};inp.click();};
})();
