// Service worker mínimo para que el navegador ofrezca instalar CuerPro como app.
// No guarda nada en caché: todo va a la red como siempre.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
