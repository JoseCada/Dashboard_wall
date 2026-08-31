// ============================================================================
// CONFIGURACIÓN DE SUPABASE
// Reemplaza las comillas por tus datos obtenidos de Supabase
// (Project Settings -> API)
// ============================================================================
const SUPABASE_URL = 'https://gfppjofgirohuwzxmayu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_RX5g1hYs0cqL4eyUOTONeg_ZhZOFms_';

// Inicializar el cliente global de Supabase
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================================================
// OBJETO DB: MÉTODOS CRUD PARA LAS 4 PESTAÑAS
// ============================================================================
const DB = {

    // ------------------------------------------------------------------------
    // TICKERS DE TU BROKER (Revolut) - para marcar qué activos puedes operar
    // ------------------------------------------------------------------------

    async getBrokerTickers() {
        try {
            const { data, error } = await supabaseClient
                .from('broker_tickers')
                .select('ticker');

            if (error) throw error;
            return data ? data.map(row => row.ticker) : [];
        } catch (error) {
            console.error('Error al obtener los tickers del broker:', error.message);
            return [];
        }
    },

    async addBrokerTicker(ticker) {
        try {
            const { error } = await supabaseClient
                .from('broker_tickers')
                .insert([{ ticker: ticker.toUpperCase() }]);

            if (error && error.code !== '23505') throw error; // 23505 = ya existía, se ignora
            return true;
        } catch (error) {
            console.error('Error al añadir el ticker del broker:', error.message);
            throw error;
        }
    },

    async removeBrokerTicker(ticker) {
        try {
            const { error } = await supabaseClient
                .from('broker_tickers')
                .delete()
                .eq('ticker', ticker.toUpperCase());

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error al eliminar el ticker del broker:', error.message);
            return false;
        }
    },

    // ------------------------------------------------------------------------
    // PESTAÑA 1 Y 2: LISTA DE SEGUIMIENTO (WATCHLIST)
    // ------------------------------------------------------------------------
    
    // Obtener la lista de seguimiento completa (favoritos primero)
    async getWatchlist() {
        try {
            const { data, error } = await supabaseClient
                .from('watchlist')
                .select('ticker, favorito, created_at')
                .order('favorito', { ascending: false })
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error al obtener la lista de seguimiento:', error.message);
            return [];
        }
    },

    // Marcar/desmarcar un ticker como favorito dentro de la lista de seguimiento
    async toggleFavorito(ticker, favorito) {
        try {
            const { error } = await supabaseClient
                .from('watchlist')
                .update({ favorito })
                .eq('ticker', ticker);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error al actualizar favorito:', error.message);
            return false;
        }
    },

    // Añadir un nuevo ticker a la lista de seguimiento
    async addToWatchlist(ticker) {
        try {
            const { data, error } = await supabaseClient
                .from('watchlist')
                .insert([{ ticker: ticker.toUpperCase() }]);

            // Código 23505 = Clave duplicada (si ya estaba agregado, se ignora el error)
            if (error && error.code !== '23505') throw error;
            return true;
        } catch (error) {
            console.error('Error al añadir a seguimiento:', error.message);
            throw error;
        }
    },

    // Eliminar un ticker de la lista de seguimiento
    async removeFromWatchlist(ticker) {
        try {
            const { error } = await supabaseClient
                .from('watchlist')
                .delete()
                .eq('ticker', ticker);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error al eliminar de seguimiento:', error.message);
            return false;
        }
    },

    // ------------------------------------------------------------------------
    // PESTAÑA 2 Y 3: ACTIVO SELECCIONADO PARA OPERAR
    // ------------------------------------------------------------------------

    // Obtener el ticker seleccionado actualmente para calcular posición
    async getSelectedAsset() {
        try {
            const { data, error } = await supabaseClient
                .from('selected_asset')
                .select('ticker')
                .eq('id', 1)
                .single();

            if (error && error.code !== 'PGRST116') throw error;
            return data ? data.ticker : 'NASDAQ:AAPL';
        } catch (error) {
            console.error('Error al obtener el activo seleccionado:', error.message);
            return 'NASDAQ:AAPL';
        }
    },

    // Establecer qué activo se envía a la Mesa de Operaciones
    async setSelectedAsset(ticker) {
        try {
            const { error } = await supabaseClient
                .from('selected_asset')
                .upsert({ id: 1, ticker: ticker.toUpperCase(), updated_at: new Date() });

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error al guardar el activo seleccionado:', error.message);
            return false;
        }
    },

    // ------------------------------------------------------------------------
    // PESTAÑA 1: POSICIONES GUARDADAS (Calculadora de Riesgo -> Mi Portafolio)
    // Tabla separada de "trades" (que se reserva para el libro FIFO de las
    // pestañas 3 y 4). Aquí solo guardamos niveles de entrada/SL/TP.
    // ------------------------------------------------------------------------

    // Obtener todas las posiciones guardadas
    async getPositions() {
        try {
            const { data, error } = await supabaseClient
                .from('positions')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error al obtener las posiciones:', error.message);
            return [];
        }
    },

    // Guardar una nueva posición desde la calculadora de riesgo
    async addPosition(position) {
        try {
            const { data, error } = await supabaseClient
                .from('positions')
                .insert([{
                    ticker: position.ticker.toUpperCase(),
                    tipo: position.tipo,
                    entry: position.entry,
                    sl: position.sl,
                    tp: position.tp,
                    cantidad: position.cantidad || 1,
                    precio_creacion: position.precioCreacion || position.entry,
                    estado: 'PENDIENTE'
                }])
                .select();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error al guardar la posición:', error.message);
            throw error;
        }
    },

    // Actualizar estado/resultado/cierre de una posición (usado por la
    // comprobación automática de precios)
    async updatePosition(id, updates) {
        try {
            const { error } = await supabaseClient
                .from('positions')
                .update(updates)
                .eq('id', id);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error al actualizar la posición:', error.message);
            return false;
        }
    },

    // Eliminar una posición guardada
    async deletePosition(id) {
        try {
            const { error } = await supabaseClient
                .from('positions')
                .delete()
                .eq('id', id);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error al eliminar la posición:', error.message);
            return false;
        }
    },

    // ------------------------------------------------------------------------
    // PESTAÑA 3 Y 4: LIBRO DE OPERACIONES Y CARTERA (FIFO)
    // ------------------------------------------------------------------------

    // Obtener todas las operaciones registradas
    async getTrades() {
        try {
            const { data, error } = await supabaseClient
                .from('trades')
                .select('*')
                .order('date', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error al obtener operaciones:', error.message);
            return [];
        }
    },

    // Registrar una nueva compra/operación desde la Pestaña 3
    async addTrade(trade) {
        try {
            const { data, error } = await supabaseClient
                .from('trades')
                .insert([{
                    ticker: trade.ticker,
                    date: trade.date,
                    shares: trade.shares,
                    buy_price: trade.buyPrice,
                    status: 'ABIERTA',
                    notes: trade.notes || ''
                }])
                .select();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error al insertar la operación:', error.message);
            throw error;
        }
    },

    // Cerrar una posición (Venta) para el cálculo de P&L / FIFO en la Pestaña 4
    async closeTrade(id, sellPrice) {
        try {
            const { error } = await supabaseClient
                .from('trades')
                .update({ 
                    sell_price: sellPrice, 
                    status: 'CERRADA' 
                })
                .eq('id', id);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error al cerrar la operación:', error.message);
            return false;
        }
    }
};