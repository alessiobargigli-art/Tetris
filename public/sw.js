// Service worker minimo: soddisfa i criteri di installabilità PWA e permette
// di rigiocare offline una volta caricata la pagina almeno una volta.
// Le chiamate a /api/* (classifica) non vengono mai messe in cache.

const CACHE = 'tetris-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/manifest.webmanifest',
  '/src/engine.js',
  '/src/render.js',
  '/src/main.js',
  '/images/icon.svg',
  '/images/icon-192.png',
  '/images/icon-512.png',
  '/images/bg.svg',
  '/audio/bitwise-adventure.mp3',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
