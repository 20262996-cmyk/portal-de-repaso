const CACHE_PREFIX = "portal-repaso-";
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const APP_SHELL_URLS = [
    new URL("./", self.registration.scope).href,
    new URL("./index.html", self.registration.scope).href,
    new URL("./manifest.json", self.registration.scope).href,
    new URL("./icons/icon-192.png", self.registration.scope).href,
    new URL("./icons/icon-512.png", self.registration.scope).href
];
const GOOGLE_FONTS_STYLESHEET = "https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap";

self.addEventListener("install", event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(APP_SHELL_URLS);
        await precacheGoogleFonts(cache);
        await self.skipWaiting();
    })());
});

self.addEventListener("activate", event => {
    event.waitUntil((async () => {
        const cacheNames = await caches.keys();
        await Promise.all(
            cacheNames
                .filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
                .map(name => caches.delete(name))
        );
        await self.clients.claim();
    })());
});

self.addEventListener("fetch", event => {
    const request = event.request;
    const requestUrl = new URL(request.url);
    if (request.method !== "GET" || !["http:", "https:"].includes(requestUrl.protocol)) return;

    event.respondWith((async () => {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) return cachedResponse;

        try {
            const networkResponse = await fetch(request);
            const isCacheableOrigin = requestUrl.origin === self.location.origin
                || requestUrl.hostname === "fonts.googleapis.com"
                || requestUrl.hostname === "fonts.gstatic.com";
            if (isCacheableOrigin && networkResponse.ok && (networkResponse.type === "basic" || networkResponse.type === "cors")) {
                try {
                    const cache = await caches.open(CACHE_NAME);
                    await cache.put(request, networkResponse.clone());
                } catch (cacheError) {
                    console.error("No se pudo guardar el recurso en caché:", request.url, cacheError);
                }
            }
            return networkResponse;
        } catch (error) {
            if (request.mode === "navigate") {
                const offlinePage = await caches.match(new URL("./index.html", self.registration.scope).href);
                if (offlinePage) return offlinePage;
            }

            console.error("No se pudo cargar el recurso y no está disponible en caché:", request.url, error);
            return new Response("No hay conexión y este recurso no está disponible sin conexión.", {
                status: 503,
                statusText: "Sin conexión",
                headers: { "Content-Type": "text/plain; charset=utf-8" }
            });
        }
    })());
});

async function precacheGoogleFonts(cache) {
    try {
        const stylesheetResponse = await fetch(GOOGLE_FONTS_STYLESHEET, { mode: "cors" });
        if (!stylesheetResponse.ok) {
            throw new Error(`Google Fonts respondió con HTTP ${stylesheetResponse.status}`);
        }

        const stylesheetText = await stylesheetResponse.clone().text();
        await cache.put(GOOGLE_FONTS_STYLESHEET, stylesheetResponse);

        const fontUrls = new Set(
            [...stylesheetText.matchAll(/url\((?:'|")?(https:\/\/fonts\.gstatic\.com\/[^)'"]+)(?:'|")?\)/g)]
                .map(match => match[1])
        );
        await Promise.all([...fontUrls].map(async url => {
            const fontResponse = await fetch(url, { mode: "cors" });
            if (!fontResponse.ok) {
                throw new Error(`Una fuente de Google Fonts respondió con HTTP ${fontResponse.status}`);
            }
            await cache.put(url, fontResponse);
        }));
    } catch (error) {
        console.warn("No se pudieron precargar las fuentes de Google; se intentarán cargar cuando haya conexión:", error);
    }
}
