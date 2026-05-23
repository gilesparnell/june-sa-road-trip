# F3 — Backend score storage (design)

Foundation unit F3 of the Trip Game Arcade. See the plan at
`docs/plans/2026-05-16-001-feat-trip-game-arcade-wave-1-plan.md` for phase
context. This document is the spec codex implements against.

**Phase 0 effort estimate:** ~4h total (design + impl). Design is this doc;
impl is codex-delegated. Higher than F1/F2 because there's serverside +
clientside + an existing endpoint to extend safely.

---

## Decision lock-in: split-file, not co-locate

The plan has two contradictory positions:
- **Tensions-resolved section (line 56):** "Co-locate in the existing Gist
  (`scores` blob alongside `items`)."
- **Deepen-pass research (line 236):** "Don't co-locate — split into
  `scores.json` as a second file in the same Gist. Items = occasional,
  single-actor; scores = high-frequency, multi-actor."

**Resolved as split-file.** Reasoning:

1. The existing `actions.js` already follows a read-whole-blob then
   write-whole-blob pattern. Every score submission would rewrite the
   entire items list. A boy chaining 5 attempts of Long Tom in 3 minutes
   would rewrite Giles's "book accomodation" action list 5 times.
2. Different write profiles mean different contention surfaces. Two
   files in the same gist = same auth, same endpoint, same infra — but
   different write-collision surfaces.
3. GitHub Gist PATCH supports per-file updates: `{ files: { "scores.json":
   { content: ... } } }` only touches the named file. Confirmed by the
   existing `writeState` implementation pattern.

Locking this in here so future readers don't re-litigate. The tradeoff
cost is one extra HTTP read on GET (Gist API returns all files anyway,
so the read cost is identical; we just parse two files instead of one).

---

## Storage schema

Single Gist, two files. File names:
- `actions.json` — existing. Untouched by F3.
- `scores.json` — **NEW.** Owned by F3.

`scores.json` shape:

```json
{
  "version": 1,
  "scores": {
    "long-tom": {
      "twin-a": {
        "personalBest": 4200,
        "history": [
          { "score": 4200, "ts": 1750102330000 },
          { "score": 3800, "ts": 1750102100000 },
          { "score": 3650, "ts": 1750101840000 }
        ]
      },
      "twin-b": { "personalBest": 0, "history": [] },
      "matti": { "personalBest": 0, "history": [] },
      "adult": { "personalBest": 0, "history": [] }
    },
    "gold-pan": { ... },
    "hairpin-drift": { ... },
    "camera-safari-bushveld": { ... },
    "camera-safari-kruger": { ... }
  },
  "dailySeed": null
}
```

Notes:
- **`personalBest`** is denormalised. Computed on every submit. Surfaces
  the in-game "previous best" ghost line without scanning history. Per
  research, the in-game ghost is the #1 replayability driver — keeping
  this read-cheap matters.
- **`history`** is FIFO capped at the top **10 most-recent** submissions
  per player per game. NOT a leaderboard — chronological. Top-N by
  score is computed at read time when needed.
- **`dailySeed`** is reserved for a future "daily challenge" feature.
  v1 writes `null` and never reads it. Schema includes it now so the
  future feature doesn't trigger a migration.
- **`version`** = 1. If we change shape in the future, bump this and
  add migration logic.

If `scores.json` is missing from the gist on first read, F3 returns the
default empty shape (no migration needed):

```json
{
  "version": 1,
  "scores": {},
  "dailySeed": null
}
```

The file is created lazily on the first successful submit-score call.

---

## Allowed IDs

### gameId

Canonical set for wave 1 (codex hardcodes this list on the server):

```
long-tom
gold-pan
hairpin-drift
camera-safari-bushveld
camera-safari-kruger
```

Plus one demo id for the Phase-0 acceptance gate:

```
hello-world
```

Server rejects submissions with unknown gameId. Use 400, body
`{ error: 'unknown gameId' }`.

### playerId

Canonical set imported in spirit from F2's `PLAYERS` constant. Server
hardcodes the same four IDs (no shared module — server is CommonJS and
not bundled):

```
twin-a
twin-b
matti
adult
```

Server rejects submissions with unknown playerId. 400, body
`{ error: 'unknown playerId' }`.

**Keeping these in sync:** add a comment block at the top of both
`api/actions.js` (server) and `v2/games/lib/player.js` (client)
listing the canonical IDs, and a "if you change this list, change the
other one too" reminder. Cheap. No build step.

---

## Server-side API (extending `api/actions.js`)

### GET `/api/actions`

Existing behaviour preserved. Response shape becomes:

```json
{
  "items": [...],
  "scores": { "version": 1, "scores": {...}, "dailySeed": null }
}
```

Two reads from the Gist (one PATCH'd Gist response contains both files;
parse both). If `scores.json` is missing or unparseable, return the
empty-default scores shape. If `actions.json` is missing or unparseable,
fall through to existing `normalise()` behaviour.

### POST `/api/actions` with `action: "submit-score"`

New action. Request body:

```json
{
  "action": "submit-score",
  "gameId": "long-tom",
  "playerId": "twin-a",
  "score": 4200
}
```

Server validation:
- `gameId` ∈ canonical set; reject 400 otherwise
- `playerId` ∈ canonical set; reject 400 otherwise
- `score` is a finite non-negative number; reject 400 otherwise
- `score` is rounded to the nearest integer server-side before storage

Server logic:
1. Read scores from gist (one fetch returns the gist; parse `scores.json`)
2. If `scores.json` doesn't exist, init the default-empty shape
3. Find `scores.scores[gameId][playerId]`. If absent, init `{ personalBest: 0, history: [] }`
4. Prepend `{ score, ts: Date.now() }` to `history`
5. Truncate `history` to first 10 entries
6. Update `personalBest = max(personalBest, score)` (numerical max)
7. Write `scores.json` back to gist
8. Return the full response shape (same as GET) so client can update its scoreboard widget without a second fetch

**Concurrency:** Last-write-wins, per the plan's tensions-resolved
position. No ETag retry, no optimistic locking. Rationale: simultaneous
score writes from 3 boys on the same iPad are not racing each other on
the network — iPad gates UI input. Cross-device contention would only
happen if two devices submit within the same 200-500ms gist write
window, which is rare enough at family-of-six scale to ignore.

Trade-off: a lost score under contention is annoying but recoverable
(it'd show on screen as "submitted", just never persist). Don't expose
this as user-facing language.

### POST other actions (existing)

All preserved. They operate on `actions.json` only. They never touch
`scores.json`.

---

## Client-side API (new file `v2/games/lib/scoreboard.js`)

Single ESM module. Used by games to submit scores and (later, in F4) by
the scoreboard widget to render leaderboards.

```js
// Submit a finished round to the backend.
// Returns the updated scores blob on success.
// Throws an Error on validation failure (e.g. unknown player).
// On network/server failure, retries once with 250ms backoff; on second
// failure, logs an error to console and returns the local optimistic
// estimate (so the caller's UI flow can continue). Does NOT throw on
// network failure — the score is "best effort" in v1, not transactional.
export async function submitScore({ gameId, playerId, score });

// Fetch the scores blob (full payload). Used by F4 to render leaderboards.
// Returns the empty-default shape on network failure (caller renders
// "no scores yet" rather than a broken state).
export async function getScores();

// Convenience for the in-game previous-best ghost line.
// Returns 0 if no scores yet for this player+game.
export async function getPersonalBest(gameId, playerId);

// Convenience for F4: sort entries top-N by personalBest across all players
// for a single game. Returns [{ playerId, personalBest }, ...] sorted desc.
export async function getTopByGame(gameId);
```

Internals:
- Single in-memory cache of the last-known scores blob. Refreshed on
  every `submitScore` (response includes the new shape) and on first
  call to `getScores` if cache is empty.
- Cache TTL: 30 seconds. After that, `getScores` re-fetches.
- Wraps all `fetch` calls with a 5-second timeout via `AbortController`.

---

## Failure & error handling

| Scenario | Behaviour |
|---|---|
| Server returns 5xx on submit | Retry once at 250ms backoff. Second 5xx → console.error, return local optimistic estimate (the in-memory cache updated locally with the new score). User sees their score as "submitted" and the in-game scoreboard reflects it; the server is just out of sync until next session. |
| Server returns 4xx on submit | Throw a typed error (`InvalidScoreError`, `UnknownPlayerError`, etc.). Caller surfaces to a "Couldn't save your score — talk to Dad" toast. (Not shipping toasts in v1; for now just console.error.) |
| Network fully down | Same as 5xx — retry once, then fall back to local optimistic. **F7 (service worker)** will later queue these submissions in IndexedDB and flush on `online` event. F3 must not crash on offline; it must work seamlessly when F7 lands. |
| Gist API rate-limited (403 with "Rate Limit Exceeded") | Same as 5xx. Console.warn loudly. Family of 6 isn't going to hit Gist rate limits, but worth handling. |
| Submit with empty/missing fields | 400 client-side: throw before sending. Avoids needless server round-trips for obvious bugs. |
| Score is NaN, Infinity, negative, or non-numeric | 400 client-side. Same as above. |

---

## Acceptance criteria (codex must verify)

1. **GET returns both blobs.** `curl http://localhost:8765/api/actions`
   — wait, the api endpoint is server-side, not served by the python http
   server. Verification step is: deploy to Vercel and `curl
   https://<vercel-domain>/api/actions`. Returns `{ items, scores }`.
   Alternative: run the Vercel dev server locally (`vercel dev`).
   Acceptable: codex doesn't have to run the server; manual verification
   by Giles after push is the gate.

2. **Submit a valid score.** POST `{ action: 'submit-score', gameId:
   'hello-world', playerId: 'twin-a', score: 42 }`. Response is the
   updated `{ items, scores }`. `scores.scores['hello-world']['twin-a']`
   contains the entry; `personalBest` is 42.

3. **Submit a higher score for the same player+game.** `personalBest`
   updates to the new value; history grows by one.

4. **Submit a lower score for the same player+game.** `personalBest`
   unchanged; history grows by one entry at the front.

5. **Submit > 10 scores for the same player+game.** History truncates
   to the most-recent 10.

6. **Submit with unknown gameId** — 400 with `{ error: 'unknown gameId' }`.

7. **Submit with unknown playerId** — 400 with `{ error: 'unknown playerId' }`.

8. **Submit with negative score / NaN / missing score** — 400 with a
   helpful error message.

9. **Client `submitScore` survives offline** — disable network in DevTools,
   call `submitScore`. After ~750ms (two retries), function resolves with
   the local optimistic estimate, console shows the error. Cache reflects
   the new score.

10. **Client `getTopByGame`** — after submitting scores for multiple
    players, `getTopByGame('hello-world')` returns them sorted desc by
    `personalBest`.

11. **`scores.json` initialisation** — if the gist initially has no
    `scores.json`, the first successful `submit-score` creates it. (Codex
    can't easily test this without a fresh gist; document as a manual
    Giles check.)

12. **No regression on existing actions** — `add`, `remove`, `rename`,
    `set-owner`, `reorder`, `toggle` all still work. Test by adding +
    removing a fake action item via curl.

---

## hello-world integration

After F3 lands, update `v2/games/hello-world/game.js`:

- Remove the `console.log({ game: 'hello-world', score: N })` and
  replace with `await submitScore({ gameId: 'hello-world', playerId: getCurrentPlayer().id, score: N })`
- This wires the F1 demo into F2 (player identity) + F3 (storage) to
  achieve the Phase 0 acceptance gate: "throwaway Hello world Kaplay
  game embedded on a day page can be played, scores a winning interaction,
  submits to the backend, appears on the scoreboard."

(F4 — the scoreboard widget — is the "appears on the scoreboard" half;
it's a separate unit and ships after F3.)

---

## What F3 does NOT do

- Does NOT render any UI. Pure data layer.
- Does NOT render a leaderboard or scoreboard widget. That's F4.
- Does NOT handle offline queuing in IndexedDB. That's F7 (service worker).
- Does NOT mount any modal. F3 is API + client lib only.
- Does NOT migrate any existing data. Fresh start.

---

## File layout

```
api/
  actions.js           — extended; scores read/write/submit added
v2/games/lib/
  scoreboard.js        — NEW
  player.js            — comment block updated to list canonical IDs
  kaplay-loader.js     — untouched
v2/games/hello-world/
  game.js              — replace console.log with submitScore call
docs/games/foundation/
  F3-score-storage.md  — this doc
```

Update `v2/games/README.md` to add a "Scoreboard (F3)" section linking
to this design doc, documenting the public client API.

---

## Forward references

- **F4 (Family scoreboard widget)** consumes `getScores()` and
  `getTopByGame(gameId)`. Reads only — never writes.
- **F5 (Game modal)** consumes nothing from F3 directly. The game JS
  inside the modal calls `submitScore` itself.
- **F7 (Service worker)** wraps `submitScore` with an IndexedDB queue
  + `online` event flush. F3's `submitScore` API contract is forward-
  compatible (returns optimistic estimate on failure, doesn't throw on
  network) so F7 can intercept transparently.
