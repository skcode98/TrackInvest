importScripts('./version.js');
const SW_BUILD = 7; // bump to force cache refresh
const CACHE_NAME = 'invest-pro-' + APP_VERSION + '-' + SW_BUILD;

const CORE_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-512.png',
    './style.css',
    './app_part1.js',
    './app_part2.js',
    './app_part3.js',
    './shared_ai.js',
    './monthly_plan.html',
    './spend_tracker.html'
];

const CDN_ASSETS = [
    'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap',
    'https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmSU5fBBc9-wd0mQ.woff2',
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
    'https://cdn.jsdelivr.net/npm/dompurify@3.2.4/dist/purify.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js'
];

// 1. Install — cache core shell first, then CDN assets best-effort
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            console.log('[SW] Caching core assets');
            try {
                await cache.addAll(CORE_ASSETS);
            } catch (err) {
                console.error('[SW] Failed to cache core assets:', err);
            }
            // CDN assets — don't block install if one fails
            for (const url of CDN_ASSETS) {
                try {
                    await cache.add(url);
                } catch (e) {
                    console.warn('[SW] Failed to cache CDN:', url);
                }
            }
        })
    );
    self.skipWaiting();
});

// 2. Activate — purge old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) => {
            console.log('[SW] Activating, current cache:', CACHE_NAME);
            return Promise.all(names.filter(n => n !== CACHE_NAME).map(n => {
                console.log('[SW] Deleting old cache:', n);
                return caches.delete(n);
            }));
        })
    );
    self.clients.claim();
});

// 3. Fetch — stale-while-revalidate for CDN, cache-first for local

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip non-GET and chrome-extension requests
    if (event.request.method !== 'GET') return;
    if (url.protocol === 'chrome-extension:') return;

    // For same-origin: cache-first
    if (url.origin === self.location.origin) {
        if (event.request.mode === 'navigate') {
            event.respondWith(
                caches.match(event.request).then(cached =>
                    cached || fetch(event.request).catch(() => caches.match('./index.html'))
                )
            );
            return;
        }
        event.respondWith(
            caches.match(event.request).then(cached =>
                cached || fetch(event.request).then(resp => {
                    if (resp && resp.status === 200) {
                        const clone = resp.clone();
                        caches.open(CACHE_NAME).then(c => c.put(event.request, clone)).catch(err => {
                            console.warn('[SW] Failed to cache response:', err);
                        });
                    }
                    return resp;
                }).catch(err => {
                    console.warn('[SW] Fetch failed, falling back to cache or index:', err);
                    return caches.match('./index.html');
                })
            )
        );
        return;
    }

    // For CDN: stale-while-revalidate
    event.respondWith(
        caches.match(event.request).then(cached => {
            const networkFetch = fetch(event.request).then(resp => {
                if (resp && resp.status === 200) {
                    const clone = resp.clone();
                    caches.open(CACHE_NAME).then(c => c.put(event.request, clone)).catch(err => {
                        console.warn('[SW] Failed to cache CDN response:', err);
                    });
                }
                return resp;
            }).catch(() => cached);

            return cached || networkFetch;
        })
    );
});

// 4. Push Notification
self.addEventListener('push', (event) => {
    const data = event.data ? event.data.json() : { title: 'TrackInvest', body: 'Check your portfolio.' };
    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: './icons/icon-192.png',
            badge: './icons/icon-192.png',
            vibrate: [200, 100, 200],
            data: { url: './index.html' }
        })
    );
});

// 5. Notification Click
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(clients.openWindow(event.notification.data.url));
});

// 6. Message from client — show local notification (serverless)
self.addEventListener('message', (event) => {
    const data = event.data;
    if (data && data.type === 'show-notification') {
        self.registration.showNotification(data.title || 'TrackInvest', {
            body: data.body || '',
            icon: './icons/icon-192.png',
            badge: './icons/icon-192.png',
            vibrate: [200, 100, 200],
            data: { url: './index.html' }
        });
    }
});
