// Author: Morten Bank
const CACHE_NAME = 'sudoku-cache-v6';

const urlsToCache = [
    '/',
    '/index.html',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png',
    '/css/app.css',
    '/js/rng.js',
    '/js/sudoku.js',
    '/js/techniques.js',
    '/js/generator.js',
    '/js/i18n.js',
    '/js/game.js',
];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache)));
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) =>
            Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) return caches.delete(cacheName);
                    return undefined;
                }),
            ),
        ),
    );
    return self.clients.claim();
});

// Network-first so Netlify deploys and local edits are not stuck behind the cache.
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                if (response && response.ok && event.request.method === 'GET') {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                }
                return response;
            })
            .catch(() => caches.match(event.request)),
    );
});
