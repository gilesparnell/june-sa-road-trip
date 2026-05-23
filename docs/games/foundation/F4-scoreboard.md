# F4 — Family scoreboard widget (design)

Foundation unit F4 of the Trip Game Arcade. See the plan at
`docs/plans/2026-05-16-001-feat-trip-game-arcade-wave-1-plan.md` for phase
context. This document is the spec codex implements against.

**Phase 0 effort estimate:** ~3h total (design + impl).

---

## What this unit gives us

F3 stores scores; F4 makes them visible. The widget renders a per-game
leaderboard with two view modes for two embedding contexts:

- **Compact view** — day-page inline: a 4-row leaderboard, one row per
  canonical player, sorted desc by `personalBest`. The "best ever" is
  implicit (it's the top row). Use this on the v2 day pages once a
  game is wired into a real day.
- **Full view** — inside the game modal: each player gets a section
  with their top 3 personal scores + timestamps. Surfaces the
  "previous best ghost" instinct outside of gameplay too.

Same data underneath; different rendering. Caller chooses the mode.

---

## Public API (`v2/games/lib/scoreboard-widget.js`)

Separate from `lib/scoreboard.js` (the data layer). F4 = view; F3 = data.

```js
// Mount a scoreboard inside `container`. Renders synchronously with
// the latest cached F3 data; then async-fetches fresh and re-renders
// if the data has changed.
//
// Returns a handle object with:
//   { refresh: () => Promise<void>, unmount: () => void }
//
// Options:
//   gameId         — required, one of F3's CANONICAL_GAME_IDS
//   view           — 'compact' (default) or 'full'
//   highlightId    — optional playerId; that row is visually emphasised
//                    (defaults to F2's getCurrentPlayer()?.id if not given)
//   title          — optional heading text (defaults to "Family scoreboard")
export function mountScoreboard(container, options);
```

Internal helpers (not exported):

- `renderCompact(scores, gameId, highlightId, title)` → HTMLElement
- `renderFull(scores, gameId, highlightId, title)` → HTMLElement
- `injectStyles()` — idempotent `<style id="scoreboard-widget-styles">`
  insertion into `<head>`. Same pattern as F2's `injectStyles`.

The widget reads via F3:
- `getScores()` for the data
- `getTopByGame(gameId)` for the compact ordering

No direct `fetch` calls inside F4. All network is owned by F3.

---

## Behaviour

### Mount

1. Show a skeleton state immediately (4 placeholder rows for compact, 4
   placeholder sections for full). Avoids layout shift while data loads.
2. Call `getScores()`. If the cache is fresh, this resolves synchronously
   (no network); the widget renders real data immediately.
3. If the cache misses, the skeleton stays up while F3 fetches. On
   resolve, swap to real data.
4. If F3 fetch fails (cached default-empty returned), the widget shows
   an "no scores yet" state with the 4 canonical players listed at 0.

### Refresh

- Caller invokes `handle.refresh()` after a `submitScore` lands (F5
  will wire this into the game-modal post-round flow).
- `refresh` calls `getScores({ force: true })` to bypass the 30s cache,
  then re-renders.
- If `refresh` is called while a previous refresh is in flight, the
  in-flight one is awaited; no double-fetch.

### Unmount

- Removes the rendered DOM element from `container`.
- Clears any in-flight refresh state.
- Idempotent — safe to call twice.

### Auto-refresh

**Not in v1.** The day-page inline context doesn't need auto-refresh
because scores rarely change without the user playing the game (which
they can't do from the day page directly). If a future ambient-update
pattern emerges, add `pollIntervalMs` to the options. v1: caller-driven.

---

## Compact view

Markup (one element per player, sorted by `personalBest` desc):

```html
<section class="scoreboard scoreboard-compact" role="region" aria-label="Family scoreboard">
  <h3 class="scoreboard-title">Family scoreboard</h3>
  <ol class="scoreboard-rows">
    <li class="scoreboard-row scoreboard-row--leader">
      <span class="scoreboard-rank">1</span>
      <span class="scoreboard-emoji" aria-hidden="true">🦁</span>
      <span class="scoreboard-name">Matti</span>
      <span class="scoreboard-score">4,200</span>
    </li>
    <!-- 3 more rows for the other canonical players -->
  </ol>
</section>
```

Rules:
- Always 4 rows. If a player has no scores, show `0` as the score.
- Sort desc by personalBest. Ties broken by canonical PLAYERS order (twin-a, twin-b, matti, adult).
- The top row gets `.scoreboard-row--leader` (rust accent).
- The current player (if `highlightId` matches) gets `.scoreboard-row--mine` (sand background tint). Stackable with `--leader`.
- Score formatting: comma thousands separator (`new Intl.NumberFormat('en-AU').format(score)`).

## Full view

Markup (per-player sections; players in canonical PLAYERS order, not score order):

```html
<section class="scoreboard scoreboard-full" role="region" aria-label="Family scoreboard">
  <h3 class="scoreboard-title">Family scoreboard</h3>
  <div class="scoreboard-players">
    <article class="scoreboard-player scoreboard-player--mine">
      <header class="scoreboard-player-head">
        <span class="scoreboard-emoji" aria-hidden="true">🦓</span>
        <span class="scoreboard-name">Griff</span>
        <span class="scoreboard-best">Best: 4,200</span>
      </header>
      <ol class="scoreboard-runs">
        <li class="scoreboard-run">
          <span class="scoreboard-run-score">4,200</span>
          <span class="scoreboard-run-ts">just now</span>
        </li>
        <li class="scoreboard-run">
          <span class="scoreboard-run-score">3,800</span>
          <span class="scoreboard-run-ts">2 min ago</span>
        </li>
        <li class="scoreboard-run">
          <span class="scoreboard-run-score">3,650</span>
          <span class="scoreboard-run-ts">5 min ago</span>
        </li>
      </ol>
    </article>
    <!-- 3 more sections -->
  </div>
</section>
```

Rules:
- For each player, show their **top 3 scores by value** (not by recency).
  Source: derive from `scores.scores[gameId][playerId].history` sorted
  desc, sliced to 3.
- If a player has fewer than 3 scores, show only what they have.
- If a player has 0 scores, show an empty state: "No runs yet".
- `Best: N` in the header is the player's `personalBest` from F3.
- Timestamps: relative ("just now", "5 min ago", "2 hr ago", "yesterday",
  "3 days ago"). Use the existing pattern if any v2 utility for this
  exists; otherwise inline a minimal helper inside the widget.
- The `highlightId` player gets `.scoreboard-player--mine` styling
  (sand background, rust accent on the header).
- Players in canonical PLAYERS order regardless of score, so the
  current player's section position is stable.

---

## Styling

Match the v2 magazine design language. Same CSS variables as
F2 (sand, navy ink, rust accent). Inline `<style>` injection via
`injectStyles()` — single source.

Minimum visual properties:
- Container: full-bleed within its parent, rounded corners (`var(--r-3)` or
  similar), border (`var(--line-soft)`), padding `var(--s-5)`
- Title: same as existing `h3.display` style (`Outfit` family if
  available — the v2 site uses system fonts but keep it consistent)
- Mobile: rows/sections stack naturally; no horizontal overflow
- Scores use a monospace tabular numeric style (`font-feature-settings:
  'tnum'`) so column alignment looks clean
- Skeleton state: rows with shimmering placeholder bars; ~300ms then
  swap to real data (skeleton is a nice-to-have; if codex finds it
  costly, drop to a single "Loading…" line)

---

## Edge cases

| Case | Behaviour |
|---|---|
| Unknown gameId passed | console.error a clear message; render an empty state ("No scores yet"). Don't crash. |
| Container element is null | console.error; return a no-op handle (so caller doesn't crash on `handle.refresh()`). |
| F3 returns truncated/malformed entries (e.g. history items missing `ts`) | Skip those entries silently. Don't crash. |
| Widget mounted twice into the same container | Replace existing content. Last mount wins. |
| Refresh called after unmount | No-op. |
| `highlightId` not in canonical PLAYERS | Treat as no highlight. |

---

## Acceptance criteria (codex must verify)

1. Mount compact in a test container with `gameId: 'hello-world'`,
   `highlightId: 'twin-a'`. Confirm 4 rows, sorted desc by
   personalBest, twin-a row has the `--mine` class.
2. Mount full in a test container with the same options. Confirm 4
   player sections in canonical order, each with up to 3 top scores
   sorted desc by score, twin-a section has `--mine` class.
3. Call `handle.refresh()` and confirm a fresh `getScores({ force:
   true })` is issued (mock F3 to verify).
4. Call `handle.unmount()` and confirm the rendered DOM is removed
   from the container.
5. Mount with no `highlightId` and confirm it falls back to F2's
   `getCurrentPlayer()?.id`.
6. Mount with unknown `gameId`: empty state renders, no crash.
7. Static checks: module loads cleanly under Node (DOM-touching code
   inside functions, not module-load time). No `window.*` globals. No
   top-level await.

---

## hello-world integration

Update `v2/games/hello-world/index.html`:
- After the `<canvas>` and `<div class="controls">`, add a `<div
  id="scoreboard-mount"></div>` container.
- In the module `<script>`, after the player is chosen, import
  `mountScoreboard` and call `mountScoreboard(document.querySelector('#scoreboard-mount'), { gameId: 'hello-world', view: 'compact' })`.
- Wire the existing game's `endRound` → `submitScore` → call
  `scoreboardHandle.refresh()` (note: this requires exposing the handle
  to game.js, which is a slight inversion).

**Simpler alternative for the QA shim:** keep the auto-refresh inside
the harness `index.html`, not inside game.js. After `submitScore` is
called from `game.js` (we can't intercept that easily), poll
`scoreboardHandle.refresh()` every 5 seconds while the page is open.
The polling is throwaway QA wiring and doesn't bake into the real F5
flow (which will do the proper post-submit refresh).

Both approaches are acceptable. Codex picks whichever is simpler to
implement cleanly.

---

## What F4 does NOT do

- Does NOT mount itself anywhere automatically. Callers explicitly
  mount.
- Does NOT submit scores. Read-only.
- Does NOT poll the network in v1. Caller-driven refresh.
- Does NOT support multi-game leaderboards. One `gameId` per widget
  instance. (If we ever need a global "who's winning across all games"
  view, that's wave-2.)
- Does NOT support inline editing of scores or any admin UI.

---

## File layout

```
v2/games/lib/
  scoreboard-widget.js   — NEW (this unit)
  scoreboard.js          — existing F3, unchanged
  player.js              — existing F2, unchanged
  kaplay-loader.js       — existing F1, unchanged
v2/games/hello-world/
  index.html             — minor change: mount-point div + harness wiring
docs/games/foundation/
  F4-scoreboard.md       — this doc
v2/games/README.md       — add "Scoreboard widget (F4)" section
```

---

## Forward references

- **F5 (Game modal)** will mount the full-view widget inside the modal
  after a round ends. F5 owns the modal lifecycle and the call to
  `handle.refresh()` post-submit.
- **Wave 1 games** (Long Tom, Gold Pan, etc.) won't import F4 directly.
  They emit scores via F3; F5 handles the leaderboard rendering.
- **Day-page inline embedding** (compact view) is a wave-2 polish item —
  not required for Phase 0 ship. F4 just needs to be capable.
