const VERSION = "sefaz-c03-v4";
const APP_CACHE = VERSION + "-app";
const AUDIO_CACHE = "c03-audios-v1";

const APP_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(APP_CACHE).then(cache =>
      cache.addAll(APP_FILES)
    )
  );

  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key =>
            key.startsWith("sefaz-c03-") &&
            key !== APP_CACHE
          )
          .map(key => caches.delete(key))
      )
    )
  );

  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  if (url.pathname.includes("/audio/")) {
    event.respondWith(handleAudio(request));
    return;
  }

  event.respondWith(
    caches.match(request).then(async cached => {
      if (cached) return cached;

      try {
        const response = await fetch(request);

        if (response.ok) {
          const cache = await caches.open(APP_CACHE);
          await cache.put(request, response.clone());
        }

        return response;
      } catch {
        return caches.match("./index.html");
      }
    })
  );
});

async function handleAudio(request) {
  const cache = await caches.open(AUDIO_CACHE);

  const cached = await cache.match(
    new Request(request.url)
  );

  if (!cached) {
    try {
      return await fetch(request);
    } catch {
      return new Response(
        "Áudio não baixado para uso offline.",
        { status: 503 }
      );
    }
  }

  const range = request.headers.get("Range");

  if (!range) return cached;

  const buffer = await cached.arrayBuffer();
  const match = range.match(/bytes=(\d*)-(\d*)/);

  if (!match) {
    return new Response(null, {
      status: 416,
      headers: {
        "Content-Range": `bytes */${buffer.byteLength}`
      }
    });
  }

  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2]
    ? Math.min(Number(match[2]), buffer.byteLength - 1)
    : buffer.byteLength - 1;

  if (
    start > end ||
    start >= buffer.byteLength ||
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end)
  ) {
    return new Response(null, {
      status: 416,
      headers: {
        "Content-Range": `bytes */${buffer.byteLength}`
      }
    });
  }

  const chunk = buffer.slice(start, end + 1);

  return new Response(chunk, {
    status: 206,
    headers: {
      "Content-Type":
        cached.headers.get("Content-Type") || "audio/mpeg",
      "Accept-Ranges": "bytes",
      "Content-Length": String(chunk.byteLength),
      "Content-Range":
        `bytes ${start}-${end}/${buffer.byteLength}`
    }
  });
}
