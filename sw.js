/* Calcula IR - service worker (PWA: funciona offline)
   Estratégia: cache-first para os arquivos do app, que mudam a cada versão
   (VERSAO). Ao atualizar o site, basta mudar a VERSAO para renovar o cache. */
const VERSAO = 'calcula-ir-v1';
const ARQUIVOS = ['.', 'index.html', 'style.css', 'script.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(VERSAO).then((cache) => cache.addAll(ARQUIVOS)));
  self.skipWaiting();
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(chaves.filter((c) => c !== VERSAO).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (ev) => {
  if (ev.request.method !== 'GET') return;
  ev.respondWith(
    caches.match(ev.request, { ignoreSearch: true }).then((emCache) => {
      return emCache || fetch(ev.request).then((resposta) => {
        const copia = resposta.clone();
        caches.open(VERSAO).then((cache) => cache.put(ev.request, copia));
        return resposta;
      });
    })
  );
});
