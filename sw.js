/* =========================================================
   Service worker: hace que la aplicación funcione sin cobertura.
   Guarda una copia de los archivos en el móvil y la sirve al
   instante, mientras comprueba por detrás si hay versión nueva.
   ========================================================= */

const CACHE = 'bascula-v6';

const ARCHIVOS = [
  './',
  './index.html',
  './estilos.css',
  './app.js',
  './datos.js',
  './config.js',
  './lib/supabase.js',
  './manifest.json',
  './iconos/icono-192.png',
  './iconos/icono-512.png',
  './iconos/icono-180.png'
];

// Al instalar, guardamos todo lo necesario.
self.addEventListener('install', function (evento) {
  evento.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(ARCHIVOS); })
      .then(function () { return self.skipWaiting(); })
  );
});

// Al activarse, borramos versiones antiguas del almacén.
self.addEventListener('activate', function (evento) {
  evento.waitUntil(
    caches.keys().then(function (nombres) {
      return Promise.all(nombres.map(function (n) {
        if (n !== CACHE) return caches.delete(n);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

// Servimos lo guardado al instante y actualizamos por detrás.
self.addEventListener('fetch', function (evento) {
  if (evento.request.method !== 'GET') return;

  evento.respondWith(
    caches.match(evento.request).then(function (guardado) {
      const desdeLaRed = fetch(evento.request).then(function (respuesta) {
        if (respuesta && respuesta.status === 200 && respuesta.type === 'basic') {
          const copia = respuesta.clone();
          caches.open(CACHE).then(function (cache) { cache.put(evento.request, copia); });
        }
        return respuesta;
      }).catch(function () {
        return guardado; // sin cobertura: nos quedamos con lo que hay
      });

      return guardado || desdeLaRed;
    })
  );
});
