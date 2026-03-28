const CACHE_NAME = 'jayjay-v5';
const ASSETS = [
  '/',
  '/index.html',
  '/trouve-la-lettre.html',
  '/calcul-aventure.html',
  '/premiere-lettre.html',
  '/le-temps-qui-passe.html',
  '/mots-et-images.html',
  '/les-syllabes.html',
  '/suite-logique.html',
  '/sudoku-des-petits.html',
  '/ma-semaine-en-ordre.html',
  '/la-journee-de-leo.html',
  '/robot-quadrillage.html',
  '/le-plan-de-lecole.html',
  '/la-fabrique-de-nombres.html',
  '/le-train-des-mots.html',
  '/la-dictee-des-sons.html',
  '/le-ptit-marchand.html',
  '/le-restaurant-des-animaux.html',
  '/leau-magique.html',
  '/le-jardin-des-emotions.html',
  '/le-chef-dorchestre.html',
  '/hello-english.html',
  '/le-bar-a-schemas.html',
  '/qui-parle.html',
  '/la-machine-a-phrases.html',
  '/le-miroir-pixel.html',
  '/pixel-art-geometrique.html',
  '/latelier-des-couleurs.html',
  '/colour-catcher.html',
  '/simon-says.html',
  '/manifest.json'
];

// Install: cache all assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS).catch(err => {
        // Cache what we can, skip failures (e.g. files not yet deployed)
        return Promise.allSettled(
          ASSETS.map(url => cache.add(url).catch(() => {}))
        );
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first strategy
self.addEventListener('fetch', event => {
  // Skip non-GET requests and external URLs
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // For Google Fonts: network-first (cache for offline)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // For our own assets: cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      });
    })
  );
});
