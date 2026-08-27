// Reemplaza con tus claves de Supabase (Paso 1.4)
const SUPABASE_URL = 'https://TU_PROYECTO.supabase.co';
const SUPABASE_KEY = 'TU_CLAVE_ANON_PUBLIC';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const DB = {
    // --- WATCHLIST ---
    async getWatchlist() {
        const { data, error } = await supabaseClient.from('watchlist').select('ticker');
        if (error) { console.error(error); return []; }
        return data.map(row => row.ticker);
    },
    async addToWatchlist(ticker) {
        const { error } = await supabaseClient.from('watchlist').insert([{ ticker }]);
        if (error && error.code !== '23505') console.error(error); // ignora duplicados
    },
    async removeFromWatchlist(ticker) {
        const { error } = await supabaseClient.from('watchlist').delete().eq('ticker', ticker);
        if (error) console.error(error);
    },

    // --- ACTIVO SELECCIONADO ---
    async getSelectedAsset() {
        const { data } = await supabaseClient.from('selected_asset').select('ticker').single();
        return data ? data.ticker : 'NASDAQ:AAPL';
    },
    async setSelectedAsset(ticker) {
        await supabaseClient.from('selected_asset').upsert({ id: 1, ticker: ticker });
    },

    // --- OPERACIONES (CARTERA / FISCAL) ---
    async getTrades() {
        const { data, error } = await supabaseClient.from('trades').select('*').order('id', { ascending: false });
        if (error) { console.error(error); return []; }
        return data;
    },
    async addTrade(trade) {
        const { data, error } = await supabaseClient.from('trades').insert([trade]).select();
        if (error) console.error(error);
        return data;
    },
    async closeTrade(id, sellPrice) {
        const { error } = await supabaseClient.from('trades').update({ sell_price: sellPrice, status: 'CERRADA' }).eq('id', id);
        if (error) console.error(error);
    }
};