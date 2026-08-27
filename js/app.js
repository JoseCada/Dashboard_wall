// Cargar dinámicamente el HTML del scanner
async function cargarPestanaScanner() {
  const container = document.getElementById('tab-scanner');
  if (!container) return;

  try {
    const response = await fetch('tabs/tabs1_scanner.html');
    if (!response.ok) throw new Error('Error al cargar la pestaña Scanner');
    
    const html = await response.text();
    container.innerHTML = html;

    // Una vez cargado el HTML, inicializamos sus componentes y datos
    cargarListaMercado();
  } catch (error) {
    console.error('Error cargando el template:', error);
    container.innerHTML = '<p style="color:red;">Error al cargar el módulo del scanner.</p>';
  }
}

// Actualizar el listener de inicialización en app.js
window.addEventListener('DOMContentLoaded', () => {
  cargarPestanaScanner();
});