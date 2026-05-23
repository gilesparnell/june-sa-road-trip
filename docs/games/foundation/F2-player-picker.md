# F2 — Player identity picker (design)

Foundation unit F2 of the Trip Game Arcade. See the plan at
`docs/plans/2026-05-16-001-feat-trip-game-arcade-wave-1-plan.md` for the
phase context. This document is the spec codex implements against.

> **Roster updated 2026-05-23.** The shipped roster is 6 players
> (`twin-a` GriffBiff, `twin-b` ConBon, `matti`, `gilo` GiloPants,
> `vonnies`, `julz`). The 4-player tables and `adult` references in
> this doc are the original spec — see **`v2/games/lib/player.js`
> PLAYERS** for the canonical, current roster. Code is authoritative.

**Phase 0 effort estimate:** 3h total (design + impl). Design half is this
doc; impl half is codex-delegated.

---

## What this unit gives us

Every score the arcade records needs to be tagged with **who scored it**.
On a shared iPad with three kids fighting over the device, "whoever's
logged in" is the wrong abstraction — the device has no concept of "logged
in" and a single localStorage slot silently corrupts the leaderboard.

F2 makes the *identity ask* a first-class moment in the game-open flow:

1. **First visit** — the game modal asks "Who's playing?" before any game loads.
2. **Returning soon (≤ 10 min)** — the modal trusts the cached identity and
   shows it as a badge ("Playing as Griff [change]"). Game loads immediately.
3. **Returning later (> 10 min)** — the modal asks "Still you, Griff?" with
   [Yes, play] and [No, change] buttons.
4. **In-modal change affordance** — the badge has a [change] button that
   re-opens the picker any time.

This guarantees the kid who **actually pressed the button** owns the score.

---

## Identity model

Four canonical players. IDs are stable strings; display names are editable.
The arcade-backend score schema (F3) uses the IDs as foreign keys, so
**never change an ID** once shipped.

| ID | Default display name | Emoji | Notes |
|---|---|---|---|
| `twin-a` | Griff | 🦓 | First twin |
| `twin-b` | Connor | 🐘 | Second twin |
| `matti` | Matti | 🦁 | Eldest, ~11 |
| `adult` | Grown-up | 👨 | Catch-all for Giles/Jackie/anyone else who has a play |

Names + emoji live as constants in `lib/player.js` so they can be tweaked
without touching IDs. If a fifth player ever joins, *add* a new ID — never
recycle an existing one.

---

## localStorage schema

Single key: **`tripArcade.player`**. JSON value:

```json
{
  "id": "twin-a",
  "displayName": "Griff",
  "lastConfirmedAt": 1750000000000,
  "version": 1
}
```

- `id` — one of the canonical IDs above
- `displayName` — frozen copy of the display name at confirm time (cosmetic
  only; canonical source of truth is the `PLAYERS` constant in code)
- `lastConfirmedAt` — Unix millis when the user last *tapped* a player
  button (either picker or confirm-stale)
- `version` — schema version. Start at `1`. If we ever change shape,
  bump this and migrate on read.

**Missing or unparseable value → behave as if no player chosen.** Don't
crash, don't try to recover; just show the picker.

---

## Behaviour matrix

| State | What happens on game-modal open |
|---|---|
| No player in localStorage | Show **picker** ("Who's playing?"); on selection, set `lastConfirmedAt = now`, proceed to game |
| Player set, `lastConfirmedAt` ≤ 10 min ago | Skip picker, show **badge** at top of game ("Playing as Griff [change]"), proceed to game |
| Player set, `lastConfirmedAt` > 10 min ago | Show **confirm-stale** ("Still you, Griff?") with [Yes, play] and [No, change]; on confirm, refresh `lastConfirmedAt`; on change, show picker |
| Player set, `version` mismatch | Treat as no player; show picker |
| Player set, `id` not in canonical list | Treat as no player; show picker |
| localStorage unavailable (private browsing, quota error) | Picker appears every time; document that, no fallback to cookies/IDB in v1 |

**10-minute window** is the architecture-review trade-off: long enough that
a kid replaying the same game three times in a row doesn't get nagged, short
enough that "kid B picks up the iPad after lunch" gets caught.

---

## Public API (`v2/games/lib/player.js`)

Single ESM module. F5 (game modal) and F4 (scoreboard) import from it.

```js
// Canonical list, ordered for picker display
export const PLAYERS = [
  { id: 'twin-a', displayName: 'Griff',   emoji: '🦓' },
  { id: 'twin-b', displayName: 'Connor',  emoji: '🐘' },
  { id: 'matti',  displayName: 'Matti',   emoji: '🦁' },
  { id: 'adult',  displayName: 'Grown-up', emoji: '👨' },
];

// Read-only. Returns the player object from PLAYERS, or null.
// Validates id is canonical and version matches; returns null otherwise.
export function getCurrentPlayer();

// Updates localStorage. Sets lastConfirmedAt = Date.now().
// id MUST be one of the canonical IDs; throws if not.
// Returns the saved player object.
export function setCurrentPlayer(id);

// True if a player is set AND lastConfirmedAt is within
// CONFIRM_WINDOW_MS (= 10 * 60 * 1000).
export function isConfirmationFresh();

// Resolves to a player object. Renders the picker into the given
// container element. If a player is already set and fresh, resolves
// immediately (no UI). If set but stale, shows the confirm-stale UI.
// If not set, shows the picker UI.
//
// Used by F5 game modal: `const player = await ensurePlayerForGame(modalRoot);`
//
// Always resolves to a player; rejects only if the user explicitly
// cancels (e.g. clicks a future "back" affordance). For v1, there's
// no cancel — picker has no escape hatch. Closing the modal entirely
// is the only exit.
export async function ensurePlayerForGame(container);

// Renders the picker UI unconditionally (ignores existing selection).
// Used by the [change] affordance in the in-game badge.
export async function showPicker(container);

// CSS injection — called once on first module load. Idempotent.
// Adds a <style id="player-picker-styles"> tag to <head> if not present.
function injectStyles();
```

Caller pattern from F5:

```js
import { ensurePlayerForGame, getCurrentPlayer, showPicker } from '/v2/games/lib/player.js';

// On modal open
const player = await ensurePlayerForGame(pickerSlot);
renderBadge(badgeSlot, player); // shows "Playing as Griff [change]"
badgeSlot.querySelector('[data-change]').addEventListener('click', async () => {
  const newPlayer = await showPicker(pickerSlot);
  renderBadge(badgeSlot, newPlayer);
});
// then mount the Kaplay game
```

`renderBadge` is F5's concern, not F2's. F2 owns picker + confirm-stale UI only.

---

## UI markup (rendered by `ensurePlayerForGame` / `showPicker`)

### Picker

```html
<div class="player-picker" role="dialog" aria-labelledby="player-picker-title">
  <h2 id="player-picker-title">Who's playing?</h2>
  <ul class="player-grid">
    <li><button class="player-tile" data-player-id="twin-a">
      <span class="player-emoji" aria-hidden="true">🦓</span>
      <span class="player-name">Griff</span>
    </button></li>
    <!-- + twin-b, matti, adult -->
  </ul>
</div>
```

### Confirm-stale

```html
<div class="player-confirm" role="dialog" aria-labelledby="player-confirm-title">
  <h2 id="player-confirm-title">Still you, <span class="player-name">Griff</span>?</h2>
  <p class="player-confirm-sub">It's been more than 10 minutes since you last confirmed.</p>
  <div class="player-confirm-actions">
    <button class="player-tile player-tile-confirm" data-action="confirm">
      <span class="player-emoji" aria-hidden="true">✅</span>
      <span class="player-name">Yes, play</span>
    </button>
    <button class="player-tile player-tile-change" data-action="change">
      <span class="player-emoji" aria-hidden="true">🔁</span>
      <span class="player-name">No, change player</span>
    </button>
  </div>
</div>
```

### Styles (injected)

Match the v2 magazine design language: sand background card, navy text,
rust accent. Buttons are big touch targets (min 88×88 CSS px) — this is
shared-iPad territory. CSS lives inside `injectStyles()` in `player.js`
as a template-string `<style>` insertion, not a separate file (keeps the
unit self-contained).

Required visual properties:
- Buttons: ≥ 88px tap target on touch, hover lift on desktop, active-state press
- Player tiles laid out in a 2×2 grid (mobile) / 4×1 row (wide modal)
- Emoji at ~40px display size
- Display name in 18px regular weight, 1.2 line-height
- Confirm-stale buttons stack vertically on narrow viewports, side-by-side ≥ 480px
- Picker container is full-bleed inside the F5 modal — no inner padding beyond what the design needs

---

## Edge cases

| Case | Behaviour |
|---|---|
| localStorage unavailable (private browsing / quota error) | Catch the throw; treat every visit as first visit. Picker appears each time. Log to console once per session: `[player] localStorage unavailable; identity is per-session only`. |
| Schema version mismatch | Treat as no player. Wipe the stored value before showing picker. |
| Stored `id` not in canonical PLAYERS list | Same as above — wipe + picker. |
| Two browser tabs both have the arcade open | Each tab has its own in-memory state; both write to the same localStorage key. Last write wins. Acceptable for v1 — flag in code comment. |
| User taps a player tile rapidly twice | Debounce: ignore second click within 250 ms. |
| User closes the modal mid-picker | Picker promise pends forever; that's fine because the modal close path tears down the DOM. No leak of in-flight promises since the GC handles it. |
| Player IDs need adding (5th player joins) | Add to `PLAYERS` constant. Existing scores untouched. Picker grid grows. |

---

## Acceptance criteria (codex must verify)

1. **First visit** — open `hello-world/index.html`. The picker appears.
   Tap a player. The game loads. `localStorage.tripArcade.player` is set
   with a fresh `lastConfirmedAt`.
2. **Within 10 minutes** — close + reopen the harness. No picker. Badge
   shows the chosen player (visual verification needed from Giles).
   `lastConfirmedAt` unchanged.
3. **After 10 minutes** — fake stale by editing localStorage in DevTools
   to set `lastConfirmedAt` to ~15 min ago. Reopen the harness. The
   confirm-stale UI shows. [Yes, play] refreshes the timestamp; [No, change]
   shows the picker again.
4. **Change affordance** — once the game is loaded, the [change] button
   reopens the picker; choosing a different player updates the stored ID
   and the badge.
5. **Bad data** — set `localStorage.tripArcade.player = 'garbage'`.
   Reopen. Picker appears (no crash, no console error beyond a single
   warn).
6. **Private mode** — open in Safari Private mode. Picker appears every
   time. No crash. Console shows the one-time warn.
7. **Module isolation** — `grep -rn "tripArcade" v2/games/` returns hits
   only inside `lib/player.js`. Other modules use the API, never the raw key.

---

## What F2 does NOT do

- Does NOT submit scores. That's F3.
- Does NOT render the in-game player badge. That's F5 (the badge is
  trivial markup — F5 has the modal chrome and can render it directly).
- Does NOT mount Kaplay or care about games. Pure identity layer.
- Does NOT need a global settings menu / gear icon — the in-modal
  [change] affordance is the v1 re-pick UI. (Plan called for a settings
  menu; design pulled it in-line per the architecture review.)
- Does NOT show in the page outside the game modal. The arcade is
  modal-only. If we ever build a "scoreboard widget on day pages"
  (F4), it reads `getCurrentPlayer()` but does not trigger picker UI.

---

## File layout

```
v2/games/lib/
  player.js       — this unit, single file
  kaplay-loader.js — F1, already shipped
```

Update `v2/games/README.md` to add a "Player identity" section linking to
this design doc and documenting the public API surface for future game
authors.

---

## Forward references

- **F3 (backend score storage)** will accept `playerId` (one of the
  canonical IDs above) on its `submit-score` action.
- **F4 (scoreboard widget)** will group scores by `playerId` and show
  the matching `displayName` from `PLAYERS`.
- **F5 (game modal)** is the one consumer of `ensurePlayerForGame()` and
  `showPicker()`. F5 should call `ensurePlayerForGame` exactly once per
  modal-open, before mounting the game.
