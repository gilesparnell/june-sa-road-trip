# F6 — Sound infrastructure (design)

Foundation unit F6 of the Trip Game Arcade. See the plan at
`docs/plans/2026-05-16-001-feat-trip-game-arcade-wave-1-plan.md` for
phase context. This document is the spec codex implements against.

**Phase 0 effort estimate:** ~2h total. Smaller than F5 — mostly extracting
sound logic from F5 into its own module, plus adding the
audio-asset preload helper that the plan's research called out.

---

## What this unit gives us

F5 already implements:
- `localStorage.tripArcade.muted` read/write
- A mute toggle button in the modal header
- `k.volume(0|1)` application when toggled
- iOS audio unlock inside the splash-tap handler

What it doesn't yet have:
- A **dedicated module** that game modules can import without needing
  to know about modal internals
- A **preload helper** so Phase 1 games (Long Tom, Gold Pan, etc.) can
  declare their audio manifest and have it loaded + decoded during
  modal-open lazy-load, not on first-play. Per the plan's F6 research:
  ".m4a (AAC ~96kbps mono) — iOS Safari's native sweet spot, ~30–50KB
  per clip vs 200–500KB WAV. Preload + decode during modal-open
  lazy-load phase, not on first-play (otherwise audible jank on first
  sound)."

F6 = the extraction + the preload helper.

---

## Public API (`v2/games/lib/sound.js`)

Single ESM module. Standard discipline — no top-level await, no window
globals, no DOM-touching at module-load time.

```js
// localStorage key (exported so callers can attribute storage usage if needed)
export const MUTE_KEY = "tripArcade.muted";

// Read the persisted mute flag. Defaults to false. Safe if localStorage unavailable.
export function isMuted();

// Write a new mute state. Returns the persisted value (the input, normalised to boolean).
// Safe if localStorage unavailable (in-memory state is the source of truth in that case;
// F5's modal still tracks its own local copy).
export function setMuted(muted);

// Apply the current mute state to a Kaplay instance.
// Idempotent. Safe if k is null/undefined or doesn't expose .volume().
export function applyMute(k);

// Preload + decode an audio manifest using a Kaplay instance.
// Manifest shape: { '<id>': '<url>', ... } — e.g. { fire: '/v2/games/long-tom/assets/audio/fire.m4a' }
// Returns a promise that resolves once all are loaded. Failures on individual
// clips are logged + skipped (don't block the whole game on one missing file).
// Games call this once during startGame's setup phase.
export async function loadSounds(k, manifest);

// iOS audio-unlock helper. F5 already does this inline; F6 exports it so the
// standalone QA harness (and future hosts) can call it from their own
// splash-equivalent gesture handlers.
// Pass the Kaplay instance; calls audioCtx.resume() + a silent burp.
export function unlockAudio(k);
```

---

## Refactor plan

### 1. New file `v2/games/lib/sound.js`

Implements all of the above. Pure logic. No DOM. Safe to import from anywhere.

### 2. F5 refactor (`v2/games/lib/game-modal.js`)

- Remove inline `MUTE_KEY`, `readMuted`, `writeMuted`, `applyVolume` functions.
- Import from sound.js: `import { isMuted, setMuted, applyMute, unlockAudio } from './sound.js'`
- Replace existing call sites:
  - `state.muted = readMuted()` → `state.muted = isMuted()`
  - `writeMuted(state.muted)` → `setMuted(state.muted)`
  - `applyVolume(state)` → `applyMute(state.k)`
  - The inline `audioCtx.resume() + k.burp({ volume: 0 })` block → `unlockAudio(k)`
- The mute *toggle button* (DOM + click handler + aria-pressed update) stays
  inside game-modal.js — that's F5's concern (UI chrome). F6 owns the state
  + persistence + application.

### 3. Standalone QA harness (`v2/games/hello-world/index.html`)

Currently the harness doesn't unlock audio (it just mounts and runs). With
F6 in place, the harness gains an `unlockAudio(k)` call after `mount(canvas)`
to mirror the modal flow. Small change, just one import + one line.

### 4. Phase 1 games (forward-reference only)

Long Tom's spec calls for sound (aim chirp, fire boom, hit explosion,
miss thud, fanfare). When G1 is built, its `startGame` will do:

```js
import { loadSounds } from '../lib/sound.js';

export async function startGame(canvas, ctx) {
  const k = ctx.k;
  await loadSounds(k, {
    fire: '/v2/games/long-tom/assets/audio/fire.m4a',
    hit: '/v2/games/long-tom/assets/audio/hit.m4a',
    miss: '/v2/games/long-tom/assets/audio/miss.m4a',
    fanfare: '/v2/games/long-tom/assets/audio/fanfare.m4a',
  });
  // ... rest of game setup
}
```

No F6 work needed in Phase 1 — game just imports and uses.

---

## Hard constraints

- **No top-level await.**
- **No window globals.**
- **localStorage failure safe.** Same defensive pattern as F2.
- **`loadSounds` doesn't throw on individual asset failure.** Logs a console.warn
  + continues. Games still work, missing sounds are silent. Better UX than
  refusing to start.
- **`applyMute` is idempotent and safe with null.** F5 calls it before the game
  has finished mounting; it should no-op cleanly.
- **`unlockAudio` is synchronous in spirit** — it triggers `audioCtx.resume()`
  (which returns a Promise) but doesn't wait. F5's caller doesn't need to await
  it; the unlock either works or it doesn't, and either way the game can
  proceed. Document this clearly.

---

## Acceptance criteria

1. `node --check v2/games/lib/sound.js` passes.
2. `node --input-type=module -e "import('./v2/games/lib/sound.js').then(m => console.log(Object.keys(m).sort()))"` prints `['MUTE_KEY', 'applyMute', 'isMuted', 'loadSounds', 'setMuted', 'unlockAudio']`.
3. `grep -n "MUTE_KEY\|readMuted\|writeMuted" v2/games/lib/game-modal.js` — should now find no matches (extracted to sound.js).
4. `grep -n "from.*sound\.js" v2/games/lib/game-modal.js` — should find the import.
5. F5 mute toggle still works end-to-end (manual verification — Giles clicks 🔊 / 🔇 in the modal).
6. Hello-world QA harness mounts and runs without console errors.

---

## What F6 does NOT do

- Doesn't add a global sound settings menu. F5's in-modal toggle is the only UI.
- Doesn't load any actual audio files. Phase 1 games provide manifests.
- Doesn't handle per-channel mixing or volume curves. v1 is mute-or-full.
- Doesn't manage music vs SFX channels separately. Same for v1.

---

## File layout

```
v2/games/lib/
  sound.js                    — NEW (this unit)
  game-modal.js               — refactored to import from sound.js
  scoreboard-widget.js        — F4, unchanged
  scoreboard.js               — F3, unchanged
  player.js                   — F2, unchanged
  kaplay-loader.js            — F1, unchanged
v2/games/hello-world/
  index.html                  — minor: unlockAudio(k) after mount(canvas)
docs/games/foundation/
  F6-sound.md                 — this doc
v2/games/README.md            — add "Sound (F6)" section
```
