(() => {
    let currentTicker = 'NASDAQ:AAPL';

    // Lista por defecto de activos predefinidos
    const initialAssets = [
        { ticker: 'NASDAQ:AAPL', name: 'Apple Inc.', market: 'NASDAQ' },
        { ticker: 'NASDAQ:NVDA', name: 'NVIDIA Corp.', market: 'NASDAQ' },
        { ticker: 'NASDAQ:MSFT', name: 'Microsoft Corp.', market: 'NASDAQ' },
        { ticker: 'NASDAQ:AMZN', name: 'Amazon.com Inc.', market: 'NASDAQ' },
        { ticker: 'BME:SAN', name: 'Banco Santander', market: 'BME' },
        { ticker: 'BME:ITX', name: 'Inditex S.A.', market: 'BME' },
        { ticker: 'BME:BBVA', name: 'BBVA', market: 'BME' },
        { ticker: 'CRYPTO:BTCUSD', name: 'Bitcoin / US Dollar', market: 'CRYPTO' }
    ];

    function init() {
        renderList(initialAssets);
        renderTradingViewChart('tv-chart-tab1', currentTicker);
        setupEventListeners();
    }

    function setupEventListeners() {
        // Buscador en tiempo real
        const searchInput = document.getElementById('market-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase().trim();
                const filtered = initialAssets.filter(a => 
                    a.ticker.toLowerCase().includes(query) || 
                    a.name.toLowerCase().includes(query)
                );
                
                // Si el usuario escribe un ticker personalizado completo (ej: NASDAQ:TSLA)
                if (filtered.length === 0 && query.length > 2) {
                    renderList([{ ticker: query.toUpperCase(), name: 'Búsqueda manual', market: 'CUSTOM' }]);
                } else {
                    renderList(filtered);
                }
            });
        }

        // Botón: Añadir a lista de seguimiento en Supabase
        const btnWatchlist = document.getElementById('btn-add-watchlist');
        if (btnWatchlist) {
            btnWatchlist.addEventListener('click', async () => {
                btnWatchlist.disabled = true;
                btnWatchlist.innerText = 'Guardando...';
                
                try {
                    await DB.addToWatchlist(currentTicker);
                    alert(`✅ ${currentTicker} se ha añadido a tu Lista de Seguimiento.`);
                } catch (err) {
                    console.error('Error al guardar en Supabase:', err);
                    alert('⚠️ Error al añadir a la lista de seguimiento.');
                } finally {
                    btnWatchlist.disabled = false;
                    btnWatchlist.innerHTML = '<span>+</span> <span>Añadir a Seguimiento</span>';
                }
            });
        }
    }

    function renderList(items) {
        const container = document.getElementById('market-list');
        if (!container) return;

        if (items.length === 0) {
            container.innerHTML = '<p class="text-xs text-slate-500 p-2">No se encontraron activos.</p>';
            return;
        }

        container.innerHTML = items.map(a => `
            <div 
                onclick="selectTicker('${a.ticker}')" 
                class="p-3 bg-slate-700/50 hover:bg-slate-700 rounded-lg cursor-pointer flex justify-between items-center transition border border-transparent hover:border-slate-600 ${a.ticker === currentTicker ? 'border-emerald-500/50 bg-slate-700' : ''}"
            >
                <div>
                    <p class="font-bold text-sm text-slate-100">${a.ticker}</p>
                    <p class="text-xs text-slate-400">${a.name}</p>
                </div>
                <span class="text-[10px] bg-slate-800 text-slate-400 px-2 py-1 rounded font-mono">${a.market}</span>
            </div>
        `).join('');
    }

    // Función global para seleccionar ticker y actualizar gráfico
    window.selectTicker = (ticker) => {
        currentTicker = ticker;
        const titleEl = document.getElementById('tab1-chart-title');
        if (titleEl) titleEl.innerText = ticker;
        
        renderTradingViewChart('tv-chart-tab1', ticker);
        renderList(initialAssets); // Re-renderizar para marcar el elemento activo
    };

    // Ejecutar inicialización
    init();
})();