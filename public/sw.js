const CACHE_NAME = 'ai-chat-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            // Catching errors if some assets like /vite.svg are missing
            return cache.addAll(ASSETS_TO_CACHE).catch(err => console.warn('PWA Cache install partially failed', err));
        })
    );
});

self.addEventListener('fetch', (event) => {
    // ONLY cache same-origin requests to avoid caching external APIs (like Groq/Gemini)
    if (!event.request.url.startsWith(self.location.origin)) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((response) => {
            // Return cached asset if found, otherwise fetch from network
            return response || fetch(event.request);
        }).catch(() => {
            // Fallback for offline if the request fails completely
            return caches.match('/');
        })
    );
});
