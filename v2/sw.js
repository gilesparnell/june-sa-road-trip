const VERSION = "1.0.0";
const CACHE_NAME = `arcade-v${VERSION}`;
const API_PATH = "/api/actions";
const DB_NAME = "tripArcade";
const STORE_NAME = "submitQueue";
const EMPTY_STATE = { items: [], scores: { version: 1, scores: {}, dailySeed: null } };

const PRECACHE_URLS = [
  "/v2/",
  "/v2/index.html",
  "/v2/games/lib/kaplay-loader.js",
  "/v2/games/lib/player.js",
  "/v2/games/lib/scoreboard.js",
  "/v2/games/lib/scoreboard-widget.js",
  "/v2/games/lib/game-modal.js",
  "/v2/games/lib/sound.js",
  "/v2/games/hello-world/game.js",
  "/v2/games/hello-world/index.html",
  "https://unpkg.com/kaplay@3001.0.19/dist/kaplay.mjs",
];

const RUNTIME_CACHE_PATTERNS = {
  games: /^\/v2\/games\//,
  assets: /^\/v2\/assets\//,
  dayHtml: /^\/v2\/day\/.*\.html$/,
  kaplay: /^https:\/\/unpkg\.com\/kaplay@3001\.0\.19\//,
};

let flushing = false;
let hasWarnedIDB = false;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.map((name) => (name.startsWith("arcade-v") && name !== CACHE_NAME ? caches.delete(name) : false))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  const isActionsEndpoint = url.origin === self.location.origin && url.pathname === API_PATH;

  if (isActionsEndpoint && request.method === "POST") {
    event.respondWith(handleScoreSubmit(request));
    return;
  }

  if (isActionsEndpoint && request.method === "GET") {
    const actionsRead = handleActionsRead(request);
    event.respondWith(actionsRead.response);
    event.waitUntil(actionsRead.refresh);
    return;
  }

  if (request.method !== "GET") {
    return;
  }

  if (isCacheFirstUrl(url)) {
    event.respondWith(cacheFirst(request));
  }
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "flush-queue") {
    event.waitUntil(flushQueue());
  }
});

async function handleScoreSubmit(request) {
  const requestForNetwork = request.clone();
  let body = null;

  try {
    body = await request.clone().json();
  } catch (_) {
    body = null;
  }

  try {
    return await fetch(requestForNetwork);
  } catch (err) {
    if (body?.action === "submit-score") {
      await enqueue({
        endpoint: API_PATH,
        body,
        ts: Date.now(),
        attempts: 0,
      });

      return jsonResponse(EMPTY_STATE, 202);
    }

    throw err;
  }
}

function handleActionsRead(request) {
  const operation = caches.open(CACHE_NAME).then(async (cache) => {
    const cached = await cache.match(request);
    const refresh = fetch(request.clone()).then((response) => {
      if (isCacheable(response)) {
        return cache.put(request, response.clone()).then(() => response);
      }
      return response;
    });

    if (cached) {
      return { response: cached, refresh: refresh.catch(() => {}) };
    }

    try {
      return { response: await refresh, refresh: Promise.resolve() };
    } catch (_) {
      return { response: jsonResponse(EMPTY_STATE, 200), refresh: Promise.resolve() };
    }
  });

  return {
    response: operation.then((result) => result.response),
    refresh: operation.then((result) => result.refresh),
  };
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  if (isCacheable(response)) {
    await cache.put(request, response.clone());
  }
  return response;
}

function isCacheFirstUrl(url) {
  if (url.origin === self.location.origin) {
    return (
      url.pathname === "/v2/" ||
      url.pathname === "/v2/index.html" ||
      RUNTIME_CACHE_PATTERNS.games.test(url.pathname) ||
      RUNTIME_CACHE_PATTERNS.assets.test(url.pathname) ||
      RUNTIME_CACHE_PATTERNS.dayHtml.test(url.pathname)
    );
  }

  return RUNTIME_CACHE_PATTERNS.kaplay.test(url.href);
}

function isCacheable(response) {
  return response && response.ok && response.status !== 0;
}

function jsonResponse(payload, status) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function warnIDB(err) {
  if (!hasWarnedIDB) {
    hasWarnedIDB = true;
    console.warn("[sw] IndexedDB queue unavailable", err);
  }
}

function openDB() {
  return new Promise((resolve, reject) => {
    try {
      const request = globalThis.indexedDB.open(DB_NAME, 1);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("IndexedDB open blocked"));
    } catch (err) {
      reject(err);
    }
  });
}

async function withStore(mode, callback) {
  let db;

  try {
    db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      const request = callback(store);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    warnIDB(err);
    return null;
  } finally {
    db?.close();
  }
}

function enqueue(item) {
  return withStore("readwrite", (store) => store.add(item));
}

function dequeue(id) {
  return withStore("readwrite", (store) => store.delete(id));
}

function readAll() {
  return withStore("readonly", (store) => store.getAll()).then((items) => items || []);
}

function updateAttempts(id, attempts) {
  return readAll().then((items) => {
    const item = items.find((queued) => queued.id === id);
    if (!item) {
      return null;
    }

    item.attempts = attempts;
    return withStore("readwrite", (store) => store.put(item));
  });
}

async function flushQueue() {
  if (flushing) {
    return;
  }

  flushing = true;

  try {
    const items = await readAll();

    for (const item of items) {
      try {
        const response = await fetch(item.endpoint || API_PATH, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.body),
        });

        if (response.ok) {
          await dequeue(item.id);
          continue;
        }

        throw new Error(`flush failed with status ${response.status}`);
      } catch (err) {
        const attempts = Number(item.attempts || 0) + 1;
        if (attempts >= 5) {
          await dequeue(item.id);
          console.error("[sw] dropping queued score submit after 5 attempts", err);
          continue;
        }

        await updateAttempts(item.id, attempts);
        break;
      }
    }
  } finally {
    flushing = false;
  }
}
