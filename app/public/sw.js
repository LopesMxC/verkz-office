// Service worker mínimo: só existe para o navegador oferecer "Instalar app".
// Não guarda nada em cache (o escritório precisa estar sempre na versão mais nova).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
