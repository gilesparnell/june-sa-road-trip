# F7 — Service worker (offline cache + IndexedDB submit queue)

Foundation unit F7 of the Trip Game Arcade. Resolves origin Q5
(offline play during in-car Eastern Cape stretches). See the plan at
`docs/plans/2026-05-16-001-feat-trip-game-arcade-wave-1-plan.md` for
phase context. This document is the spec codex implements against.

**Phase 0 effort estimate:** ~4h total. The heaviest remaining unit.

**Decision:** F7 = Keep (locked 2026-05-23). Real use case is car-trip
hotspot dropout — the boys can be mid-game when reception drops, and
nothing should break.

---

## Decision lock-in: vanilla SW, NOT Workbox

The plan's deepen-pass nudged "Workbox via CDN is a reasonable
simplification". I'm rejecting that for this v1.

**Reasoning:**

1. **Workbox is ~30KB minified** loaded over the wire just to give us
   precache + a route handler. The whole arcade is ~50KB. Doubling
   payload for cleaner code isn't worth it on a network-sensitive
   feature.
2. **Vanilla SW is ~120 lines** for what we need. The shape is
   well-known and stable.
3. **CDN dependency for offline-first code** is the wrong call. If
   the user is offline AND Workbox isn't precached, the SW itself
   doesn't bootstrap. Inline-bundle would dodge that, but then we're
   doing build-step work we explicitly avoided in F1.

Plan author's "don't roll from scratch unless there's a reason"
threshold — the reason is: payload + dependency-on-CDN-for-offline.
Document this here so the deepen-pass note isn't re-litigated.

---

## Scope

The service worker scope is **`/v2/`**. NOT site-root.

Why: the root `/` is a redirect to `/v2/` (see commit `3724f35`). The
SW shouldn't intercept that redirect. Scoping to `/v2/` keeps the SW
focused on the magazine + arcade and leaves the redirect un-touched.

Scope is set via `register('/v2/sw.js', { scope: '/v2/' })`. The SW
file itself MUST live at `/v2/sw.js` for that scope to be granted by
Chrome/Safari without a `Service-Worker-Allowed` header.

---

## SW lifecycle

### Install

Open the **precache cache** under a versioned name (e.g. `arcade-v1.0.0`).
Add every URL in the precache manifest. If any fetch fails, the install
fails — the SW won't take over until the next try. This is intentional:
we don't want to serve a half-cached app.

### Activate

Delete any old `arcade-vX.Y.Z` caches that don't match the current
version. `self.clients.claim()` so the SW immediately controls any
already-open tabs (otherwise the first install requires a refresh).

### Fetch

Route handling (in order, first match wins):

| URL pattern | Strategy | Why |
|---|---|---|
| `/api/actions` (POST) | Network only; if it fails AND request is a `submit-score`, enqueue in IndexedDB and respond with a synthetic 202 | Score submits need to round-trip; offline ones get queued |
| `/api/actions` (GET) | Network-first with stale-while-revalidate fallback | Reads can serve stale data instantly; fresh data updates the cache for next time |
| `/v2/games/**` | Cache-first, fall through to network | Game JS, sprite atlases, sounds — immutable enough between deploys |
| `/v2/assets/**` | Cache-first | Same shape as game assets |
| `https://unpkg.com/kaplay@3001.0.19/**` | Cache-first | Kaplay framework. Cached on first install + never invalidated until version bump. |
| `/v2/` and `/v2/day/**.html` | Network-first with cache fallback | Page shells. Network has fresh content; offline gets the last-cached HTML. |
| Everything else | Pass through to network (no SW interference) | No reason to cache; reduces SW surface area. |

---

## Precache manifest

Hardcoded in the SW file (no build step). Listed explicitly so future
readers can audit. The version constant bumps when this list changes.

```js
const VERSION = "1.0.0";
const CACHE_NAME = `arcade-v${VERSION}`;
const PRECACHE_URLS = [
  // page shells
  "/v2/",
  "/v2/index.html",
  // arcade library (F1-F6)
  "/v2/games/lib/kaplay-loader.js",
  "/v2/games/lib/player.js",
  "/v2/games/lib/scoreboard.js",
  "/v2/games/lib/scoreboard-widget.js",
  "/v2/games/lib/game-modal.js",
  "/v2/games/lib/sound.js",
  // hello-world demo
  "/v2/games/hello-world/game.js",
  "/v2/games/hello-world/index.html",
  // Kaplay framework
  "https://unpkg.com/kaplay@3001.0.19/dist/kaplay.mjs",
];
```

**Day-page HTML (`/v2/day/*.html`)** is intentionally NOT in the
precache. Eleven pages × ~30KB = ~300KB of HTML that the user may
never visit. The runtime cache picks them up on first visit instead.
Trade-off: first cold-offline access to a day page misses; every
subsequent visit hits cache.

**Phase 1 games' assets** get added to the manifest when each game
ships (the unit's polish step). For Phase 0, only hello-world is wired.

---

## IndexedDB submit queue

Single object store: `submitQueue` in DB `tripArcade`. Each queued
item:

```js
{
  id: <auto-incremented number>,
  endpoint: "/api/actions",
  body: { action: "submit-score", gameId, playerId, score },
  ts: Date.now(),
  attempts: 0
}
```

### Queue flow (inside `fetch` handler)

1. POST `/api/actions` with `body.action === "submit-score"` comes in.
2. SW attempts the network fetch.
3. **If network succeeds** (any 2xx/4xx — server reachable): pass the
   response back to the page unchanged.
4. **If network fails** (TypeError / aborted / no connectivity):
   - Open the IndexedDB, add the body + endpoint + ts to the queue
   - Return a synthetic `Response(JSON.stringify({ items: [], scores: <cached or empty> }), { status: 202 })`
   - Status 202 = "Accepted, will process". Client's `submitScore`
     already handles non-2xx-and-not-4xx by falling back to its local
     optimistic estimate, so 202 keeps everything moving.

### Flush flow

Triggered by:
- `online` event on the SW (browser regained connectivity)
- Sync API if available (defer to v1.1)
- Manual page-side trigger: client postMessage `{ type: "flush-queue" }`

Flush procedure:
1. Read all queued items from IndexedDB.
2. For each item, attempt the POST.
3. On success, delete the item.
4. On failure, increment `attempts` and stop the flush (retry on next
   trigger). Cap at `attempts >= 5` — delete and console.error so a
   single broken item doesn't poison the queue forever.

---

## Client-side wiring

### Registration (in `v2/assets/app.js`)

Add to the bottom of the existing IIFE, after the launcher click
delegation:

```js
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/v2/sw.js', { scope: '/v2/' })
      .catch((err) => console.warn('[sw] register failed', err));
  });
}
```

No fancy update prompts in v1. The next page load picks up a new SW.

### Connectivity nudge

On `online` event, ping the SW to flush the queue:

```js
window.addEventListener('online', () => {
  navigator.serviceWorker?.controller?.postMessage({ type: 'flush-queue' });
});
```

(SW listens for `message` events and runs the flush.)

### F3 client (`scoreboard.js`) — minor change

F3 already returns the optimistic local estimate on network failure
(commit `fc5b450`). When F7 is installed, the SW intercepts the failure
and synthesises a 202, so F3 receives `{ items, scores }` and updates
its cache cleanly. **No code change in F3** needed — it works
transparently. Add a comment in F3 documenting that F7 intercepts.

---

## Cache-busting

Bumping `VERSION` in the SW invalidates all caches. New SW activates,
old caches deleted. **No need to manually invalidate individual files
on deploys** — the version bump does it.

For Phase 0, version stays `1.0.0` until a real reason emerges to bump.
Phase 1 games landing trigger version bumps (each game's polish step
includes a SW-version bump).

---

## Edge cases

| Case | Behaviour |
|---|---|
| User on Safari with persistent storage denied | SW still installs but IndexedDB writes throw. Catch the throw; console.error; queue not persisted. User loses offline submits but online flow still works. |
| SW registered but file 404s mid-session | Browser dumps the SW silently; site falls back to no-SW behaviour. No user-visible breakage. |
| User clears site data | Caches gone, queue gone. SW re-installs on next visit. |
| User has an old cache from v1.0.0 and we ship v1.1.0 | Old cache deleted during activate. Brief uncached period as new precache loads. |
| Network *intermittently* fails mid-submit | First attempt fails → queued. `online` event fires when connectivity returns → flush kicks in. User may briefly see their score as "submitted" optimistically before the real submit lands. Acceptable. |
| Two players submit simultaneously while offline | Both queued separately. Both flushed on reconnect. Last-write-wins on the server is fine here. |
| Queue grows huge during a long offline stretch | No bound in v1. Realistic worst case: 6 players × 50 rounds each = 300 entries × ~200 bytes = ~60KB. Negligible. |

---

## Hard constraints

- **Vanilla SW only.** No Workbox. No build step.
- **No external dependencies.** All code lives in `v2/sw.js` plus tiny
  registration in `v2/assets/app.js`.
- **Scope is `/v2/`**, not site-root. Don't intercept the root redirect.
- **No top-level await** in the SW (SW global scope doesn't allow it
  anyway; flag for codex).
- **No window globals** — SW doesn't have `window` anyway, but no
  `self.foo = ...` global state either. Module-level `const` is fine.
- **IndexedDB writes wrapped in try/catch** — Safari private-mode safe.
- **Queue cap 5 attempts per item** before drop.

---

## Acceptance criteria

1. SW registers successfully on first hub visit (devtools: Application
   → Service Workers shows `/v2/sw.js` as "activated and running").
2. After a reload with the SW active, all precache URLs show "from
   ServiceWorker" in the Network tab.
3. Disable network (Chrome devtools Network → Offline). Reload
   `/v2/games/hello-world/`. Page loads, Kaplay framework loads, game
   plays — all from cache.
4. Offline + play a round + submit. `fetch('/api/actions', { method:
   'POST', ... })` returns a 202 (verifiable in Network tab as
   "(ServiceWorker)" with synthetic response).
5. IndexedDB has the queued submit (devtools: Application → IndexedDB
   → tripArcade → submitQueue shows the entry).
6. Re-enable network. `online` event fires. SW flushes the queue.
   Score lands in the Gist (verifiable via curl against
   `/api/actions`).
7. Re-load offline a day later (after a few day-page visits). Day
   pages load from runtime cache.
8. Bump VERSION constant to `1.0.1`, reload. Old cache deleted; new
   cache populated; site still works.

Static checks:
- `node --check v2/sw.js` passes.
- `grep -n 'VERSION = ' v2/sw.js` shows exactly one match.
- `grep -n 'PRECACHE_URLS' v2/sw.js` confirms manifest is centralised.

---

## What F7 does NOT do

- Doesn't add a "you are offline" toast/banner. The arcade just keeps
  working; user has no visible offline state.
- Doesn't manage push notifications.
- Doesn't background-sync (Sync API). v1.1 if useful.
- Doesn't cache the day-page HTML proactively — runtime-cache only.
- Doesn't intercept `/` (the v1→v2 redirect lives outside SW scope).

---

## File layout

```
v2/
  sw.js                      — NEW (this unit)
v2/assets/
  app.js                     — minor: SW registration + online listener
docs/games/foundation/
  F7-service-worker.md       — this doc
v2/games/lib/
  scoreboard.js              — minor: comment noting F7 interception
v2/games/README.md           — add "Offline (F7)" section
```

---

## Forward references

- **F8 (FPS HUD)** doesn't intersect F7. Independent.
- **Phase 1 games** trigger VERSION bumps on each ship (adds their
  assets to the precache).
- **v1.1 polish** may add a small "queued submits: N" indicator if
  the queue grows visibly. Not v1.
