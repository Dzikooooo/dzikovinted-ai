/* ===========================================================
   ASCENSEUR — service-worker.js
   Mise en cache de l'app au premier chargement pour un
   fonctionnement 100% hors ligne ensuite.
   =========================================================== */

// Incrémenter ce nom à chaque changement de fichiers pour forcer
// la mise à jour du cache chez les utilisateurs.
const CACHE_NAME = "ascenseur-cache-v1";

const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Stratégie "cache d'abord" : l'app se charge instantanément et
// fonctionne sans réseau. En cas de mise à jour disponible, on la
// récupère en arrière-plan pour la prochaine visite.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
          }
          return response;
        })
        .catch(() => cached);

      return cached || network;
    })
  );
});
