const APP_CACHE = "sefaz-c03-app-v7";
const AUDIO_CACHE = "c03-audios-v1";

const APP_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon.svg",
  "./apple-touch-icon.png"
];

// Instalação: guarda a interface do app em cache
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.addAll(APP_FILES))
  );
});

// Ativação: remove caches antigos de versões anteriores do app, preservando os áudios baixados
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== APP_CACHE && key !== AUDIO_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Suporte a Range Requests (HTTP 206) exigido pelo Safari / iOS para áudios offline
async function serveAudioWithRange(request) {
  const cache = await caches.open(AUDIO_CACHE);
  const cachedResponse = await cache.match(request.url);

  if (!cachedResponse) {
    return fetch(request);
  }

  const rangeHeader = request.headers.get("range");
  if (!rangeHeader) {
    return cachedResponse;
  }

  const arrayBuffer = await cachedResponse.arrayBuffer();
  const totalBytes = arrayBuffer.byteLength;
  const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader);

  if (!match) {
    return cachedResponse;
  }

  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : totalBytes - 1;
  const chunk = arrayBuffer.slice(start, end + 1);

  return new Response(chunk, {
    status: 206,
    statusText: "Partial Content",
    headers: {
      "Content-Range": `bytes ${start}-${end}/${totalBytes}`,
      "Accept-Ranges": "bytes",
      "Content-Length": String(chunk.byteLength),
      "Content-Type": cachedResponse.headers.get("Content-Type") || "audio/mp4"
    }
  });
}

// Interceptação de requisições
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  // Requisições de áudio (.m4a ou .mp3)
  if (url.pathname.includes("/audio/") || /\.(m4a|mp3)$/i.test(url.pathname)) {
    event.respondWith(serveAudioWithRange(request));
    return;
  }

  // Arquivos da interface (Network-First com fallback para Cache offline)
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.ok) {
          const clone = networkResponse.clone();
          caches.open(APP_CACHE).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      })
      .catch(() => caches.match(request).then((res) => res || caches.match("./index.html")))
  );
});
