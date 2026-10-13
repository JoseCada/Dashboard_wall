# Dashboard Wall — actualización Operativa Intradía

## Archivos añadidos/modificados
- `tabs/tab5.html`: interfaz de Operativa Intradía.
- `js/intradia.js`: lógica local del diario, simulación, estadísticas, exportación/importación.
- `index.html`: nueva pestaña y carga del script local.
- `js/app.js`: enrutamiento al abrir la pestaña.
- `css/style.css`: estilos nuevos al final del archivo.
- Los archivos de Supabase no se han modificado.

## Uso
1. Sustituye tu carpeta de proyecto por esta versión (guarda antes una copia de seguridad).
2. Abre el dashboard como lo haces normalmente y entra en **Operativa Intradía**.
3. Introduce ticker, mercado, dirección, entrada, cantidad, costes y notas. Guarda la operación.
4. En una operación abierta, usa **Precio** para actualizar el precio y **Cerrar** para registrar el precio final.
5. Usa **Exportar CSV** para analizar el diario o **Copia JSON** para una copia de seguridad. **Importar JSON** reemplaza el diario actual tras confirmación.

## Importante
- El diario y la contabilidad son simulados; no se envían órdenes a ningún broker.
- Las operaciones se guardan en `localStorage` de ese navegador/dispositivo. Borra los datos del navegador solo después de exportar una copia. No hay sincronización entre dispositivos.
- El P/L se calcula de forma genérica como variación de precio × cantidad menos comisión. En futuros, Forex y algunos CFD, adapta la cantidad al multiplicador/valor por punto de tu contrato; esta primera versión no modela margen, swaps, financiación ni conversión de divisa.
- El gráfico de TradingView requiere conexión a Internet; el archivo `js/intradia.js` y el diario sí están dentro del proyecto.
- El sistema de login y los archivos de Supabase existentes se mantienen como estaban.
