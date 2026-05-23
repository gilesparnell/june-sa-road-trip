# F5 — Game modal infrastructure (design)

Foundation unit F5 of the Trip Game Arcade. See the plan at
`docs/plans/2026-05-16-001-feat-trip-game-arcade-wave-1-plan.md` for
phase context. This document is the spec codex implements against.

**Phase 0 effort estimate:** ~3h total (design + impl).

---

## What this unit gives us

The piece that turns hello-world from a standalone QA page into a
**real arcade launch experience**. After F5 lands, every game is
opened the same way: tap a "▶ Play X" button on a day page → modal
opens → player picker → "Tap to play" splash → game runs → round end
shows scoreboard → close.

F5 owns the modal lifecycle. Games stop submitting scores themselves;
they emit round-end events that F5 dispatches to F3/F4.

---

## Public API (`v2/games/lib/game-modal.js`)

Single ESM module. Same discipline as F2/F4: vanilla, no top-level await,
no `window.*` globals, inline `<style>` injection.

```js
// Opens a game modal. Auto-tears down on user-driven close.
// Returns a Promise that resolves when the modal has been closed.
export async function openGameModal({ gameId, title, gameModule });
```

- `gameId` — required, one of F3's canonical game IDs.
- `title` — optional human-readable game name shown in the modal header.
  Defaults to `gameId` if not given.
- `gameModule` — optional pre-loaded module object. If not provided,
  F5 dynamic-imports `/v2/games/<gameId>/game.js`. Useful for testing
  with mocks.

The returned promise resolves when the modal closes (either by user
action or by the caller invoking close). Errors during game load reject
the promise with a friendly Error.

---

## New game module interface

**Breaking change to hello-world/game.js.** Going forward, every game
module exports:

```js
// game.js
export const meta = {
  title: 'Hello World demo',    // optional default title
  width: 800,                   // optional, defaults 800
  height: 450,                  // optional, defaults 450
};

// canvas: the <canvas> element F5 created
// ctx: { player, onRoundEnd, onAudioUnlock }
//   - player: F2 PLAYERS entry (id, displayName, emoji) — the confirmed player
//   - onRoundEnd({ score }): game calls this when a round ends with a final score
//   - onAudioUnlock(audioCtx): optional — game may call to force-resume audio
// returns: the kaplay instance `k` so F5 can call k.quit() on close
export async function startGame(canvas, ctx);
```

**hello-world refactor (in F5's impl):** strip the direct `submitScore`
call from `endRound`. Replace with `ctx.onRoundEnd({ score })`. F5
handles submit + scoreboard refresh.

---

## Lifecycle

1. User taps `▶ Play Hello World` on the v2 hub (or a day page).
2. The launcher script calls `openGameModal({ gameId: 'hello-world', title: 'Hello World' })`.
3. F5 mounts modal DOM into `document.body`, traps focus, sets `aria-modal="true"`.
4. F5 invokes `ensurePlayerForGame(modalBody)` from F2.
   - First-visit / stale: picker / confirm-stale renders.
   - Fresh: skip to next step immediately.
5. F5 paints the modal chrome:
   - Title (from `title` option or `meta.title`)
   - Player badge: `Playing as <displayName> [change]`
   - Sound toggle button
   - Close button
6. F5 renders the **"Tap to play" splash** as the modal body.
7. User taps splash:
   - Synchronously inside the tap handler: F5 imports the game module
     (dynamic `import()`), creates a `<canvas>` 800×450, mounts Kaplay
     via the F1 loader, calls `k.audioCtx().resume()` + `k.burp({ volume: 0 })`
     to unlock iOS audio.
   - Replaces splash with the canvas in the modal body.
   - Calls `startGame(canvas, ctx)` and stores the returned `k`.
8. Game plays. Player badge sticky at top.
9. Game calls `ctx.onRoundEnd({ score })` when a round ends:
   - F5 calls `submitScore({ gameId, playerId: player.id, score })` from F3.
   - F5 mounts the F4 scoreboard (full view, highlightId = player.id) over
     the canvas area, with `Play again` and `Close` buttons.
   - Game stays mounted in the background (just hidden); `Play again`
     unmounts the scoreboard and signals the game to restart (game's
     responsibility — if game can't restart in-place, F5 tears down and
     re-runs `startGame`).
10. User clicks close (or backdrop, or `Escape`):
    - If game is "in-play" (between `startGame` resolve and the first
      `onRoundEnd` for the current round): show "Are you sure? You'll
      lose your current score" confirm. [Yes, quit] [No, keep playing].
    - Otherwise (post-round, viewing scoreboard): close immediately.
11. On confirmed close:
    - `k.quit()`
    - `canvas.remove()`
    - Null all closure refs to `k`
    - Unmount scoreboard handle if present
    - Remove modal DOM
    - Restore focus to the launcher button on the day page
    - Resolve the `openGameModal` promise.

---

## Critical Kaplay teardown (from F1 research insight)

Acceptance test: open + close hello-world 10× consecutively on iOS
Safari. Memory profile shows no monotonic growth. Without strict
teardown, the RAF loop stacks on every open + audio context leaks +
event listeners pile up, and the tab OOM-kills after ~10 opens.

Specific requirements:
- `k.quit()` MUST be called before `canvas.remove()`
- All closure variables holding `k` MUST be set to `null`
- Modal DOM removal happens AFTER kaplay teardown
- CSS `touch-action: none` on the game canvas (F1's loader sets this;
  F5 verifies it's still applied)

---

## iOS audio unlock

Web Audio on iOS requires the AudioContext to be resumed inside a
synchronous response to a user gesture. F5's "Tap to play" splash is
that gesture.

In the splash's click handler:

```js
splash.addEventListener('click', async () => {
  // SYNC steps must happen first — they "claim" the gesture for audio.
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 450;
  modalBody.replaceChildren(canvas);

  // Now async work is OK — gesture is claimed by the canvas creation +
  // sync DOM mutation above.
  const k = await mountKaplay(canvas);  // F1 loader
  k.audioCtx().resume();
  k.burp({ volume: 0 });  // confirms unlock

  const gameModule = await loadGameModule(gameId);
  const gameK = await gameModule.startGame(canvas, ctx);
  // Note: if the game module mounts its own kaplay via the loader, we
  // get a fresh `k` from `startGame`. F5 stores THAT instance for
  // teardown, not the probe `k` we used for audio unlock.
}, { once: true });
```

Slight redundancy: F5 mounts a "probe" Kaplay to unlock audio, then the
game module mounts another Kaplay via `startGame`. Two Kaplay instances
on the same canvas would conflict. Two acceptable patterns:

**Pattern A (preferred):** F5 mounts Kaplay first (probe), then passes
the instance to `startGame(canvas, { ...ctx, k })`. Game uses the
passed `k`, doesn't mount its own. Reduces teardown surface.

**Pattern B (current hello-world shape):** Game module owns Kaplay
mount. F5 calls `k.audioCtx().resume()` AFTER `startGame` resolves but
on the same gesture continuation — risky on iOS.

**Adopt Pattern A.** Refactor:
- F1 loader's `mount(canvas)` returns `k` (existing — unchanged)
- `startGame(canvas, ctx)` signature changes to **accept `ctx.k`** and
  NOT call `mount` itself. Game module uses the passed `k` directly.
- F5 owns the lifecycle: mount → unlock → pass to game → on close, quit.

This also makes teardown unambiguous — only F5 holds the kaplay reference.

---

## Sound toggle

State: `localStorage.tripArcade.muted` (boolean, default `false`).

On modal open: read state.
After audio unlock: apply via `k.volume(muted ? 0 : 1)`.
On toggle button click: flip state, write to localStorage, apply
volume to current `k`.

Button label/icon:
- Unmuted: 🔊 (high volume speaker)
- Muted: 🔇 (muted speaker)

ARIA: `aria-pressed="false"` when unmuted, `true` when muted.

---

## "Are you sure?" on close mid-game

In-play state defined as: `startGame` has resolved AND no `onRoundEnd`
has fired since the last `startGame` (or `Play again`).

F5 tracks this with a boolean `roundInProgress` flag, set `true` after
`startGame` resolves, set `false` inside `onRoundEnd`.

Close attempts (close button, backdrop click, Escape key) while
`roundInProgress === true` show a small confirm-stale-style inline
dialogue inside the modal body:

```
Quit now? You'll lose this round's score.
  [Yes, quit]   [No, keep playing]
```

On `Yes`: proceed with close.
On `No`: dismiss the dialogue, return to game.

---

## Modal markup

```html
<div class="game-modal" role="dialog" aria-modal="true" aria-labelledby="game-modal-title">
  <div class="game-modal-backdrop" data-close></div>
  <div class="game-modal-content">
    <header class="game-modal-header">
      <h2 id="game-modal-title" class="game-modal-title">Hello World</h2>
      <div class="game-modal-controls">
        <div class="game-modal-player" role="status">
          <span class="game-modal-player-label">Playing as</span>
          <span class="game-modal-player-emoji" aria-hidden="true">🦓</span>
          <span class="game-modal-player-name">GriffBiff</span>
          <button class="game-modal-player-change" type="button" aria-label="Change player">change</button>
        </div>
        <button class="game-modal-sound" type="button" aria-label="Toggle sound" aria-pressed="false">🔊</button>
        <button class="game-modal-close" type="button" data-close aria-label="Close">×</button>
      </div>
    </header>
    <div class="game-modal-body">
      <!-- contents swap: picker | splash | canvas | scoreboard + Play-again -->
    </div>
  </div>
</div>
```

Styles:
- Backdrop: 60% black overlay
- Content: white card, max-width 900px (room for 800px canvas + padding), centred
- Header: sand background, navy text, rust accent on change button
- Body: full-bleed canvas, no extra padding
- Mobile: ≥ 480px viewport gets the full modal; < 480px gets full-screen
  takeover (canvas scales down preserving 16:9, body padding shrinks)

Match the v2 magazine design language. Inline `<style id="game-modal-styles">`
injection via idempotent helper. Same pattern as F2/F4.

---

## Focus management

- On open: focus moves to first focusable element in the modal (usually
  the player picker tile, then "Tap to play" splash, then game canvas).
- Tab cycling stays inside the modal (focus trap).
- On close: focus returns to the launcher button that opened the modal.
- Escape key triggers close (with confirm if mid-game).

---

## Day-page launcher (added by F5 impl)

A small global helper auto-wired from `v2/assets/app.js`:

```js
// Add to bottom of v2/assets/app.js
import { openGameModal } from '/v2/games/lib/game-modal.js';
document.addEventListener('click', (event) => {
  const launcher = event.target.closest('.game-launcher');
  if (!launcher) return;
  openGameModal({
    gameId: launcher.dataset.gameId,
    title: launcher.dataset.gameTitle,
  });
});
```

(Or in a separate `v2/games/lib/launcher.js` if mixing with the existing
app.js feels too coupled. Codex picks the cleanest pattern.)

A day page (or the v2 hub) declares a launcher button:

```html
<button class="game-launcher" data-game-id="hello-world" data-game-title="Hello World">
  ▶ Play Hello World
</button>
```

For Phase 0 acceptance: add a **single launcher button to the v2 hub**
(`v2/index.html`) for hello-world, prominently placed. Real game-to-day
mapping happens in Phase 1.

---

## Standalone QA harness stays

Don't break `v2/games/hello-world/index.html` — that harness still
loads the game directly without the modal. It's how we ran F1/F2/F3/F4
verification.

After F5's hello-world refactor (game.js → `onRoundEnd` callback):
- The standalone harness `index.html` needs a small update too. It now
  has to provide its own `ctx.onRoundEnd` callback (which can just
  console.log + submitScore directly).
- The harness still calls `startGame(canvas, ctx)` with mocked context.

This keeps two parallel verification paths:
- **Standalone QA harness:** `/v2/games/hello-world/` — bare integration
  test, no modal chrome.
- **Real launch:** click the launcher button on the hub — full modal flow.

---

## Acceptance criteria

1. Open the v2 hub. The hello-world launcher button is visible. Tap it.
2. Modal opens. If no player set: picker appears.
3. Pick a player. Modal shows the "Tap to play" splash.
4. Tap splash. Splash replaced by canvas. Game playable.
5. Click the target a few times. Score increments.
6. 30s timer expires. Scoreboard widget appears over the canvas, with
   the chosen player highlighted (rust accent). `Play again` and `Close`
   buttons present.
7. Click `Close`: no confirm (post-round state). Modal tears down.
   Focus returns to the launcher button.
8. Re-open. Confirm picker is SKIPPED (player fresh from previous open).
   Confirm "Tap to play" splash still shows (always re-unlock audio
   per session, per the iOS pattern).
9. Tap, play, mid-round click `×`. Confirm dialogue appears. Click
   `No, keep playing`. Game continues. Round finishes. Confirm score
   submits.
10. Open + close hello-world 10× consecutively. No console errors. No
    monotonic memory growth in Safari memory tab. (Manual check — Giles.)
11. Sound toggle: click 🔊 → it becomes 🔇 + Kaplay volume drops to 0.
    Click again → restored. State persists across modal opens
    (localStorage).

---

## What F5 does NOT do

- Doesn't render games (game modules do)
- Doesn't manage player identity (F2)
- Doesn't store scores (F3 — F5 calls submitScore, not the game)
- Doesn't render leaderboards (F4 — F5 mounts the widget)
- Doesn't manage offline queue (F7 — F5's submit is forward-compatible
  via F3's `submitScore` which already handles offline)
- Doesn't auto-launch any game on page load. All launches are
  click-driven.

---

## File layout

```
v2/games/lib/
  game-modal.js              — NEW (this unit)
  player.js                  — existing F2, unchanged
  scoreboard.js              — existing F3, unchanged
  scoreboard-widget.js       — existing F4, unchanged
  kaplay-loader.js           — existing F1, unchanged
v2/games/hello-world/
  game.js                    — refactor: remove submitScore, accept ctx.onRoundEnd + ctx.k
  index.html                 — minor: harness provides own ctx callbacks
v2/assets/
  app.js                     — small addition: launcher click delegation
v2/index.html                — small addition: hello-world launcher button
docs/games/foundation/
  F5-game-modal.md           — this doc
v2/games/README.md           — add "Game modal (F5)" section
```

---

## Forward references

- **F6 (Sound infrastructure)** will mostly just be the mute-state
  helper extracted out of F5 into its own module. If F5 keeps the
  mute logic inline, F6 is just polish + cleanup.
- **F7 (Service worker)** wraps F3's `submitScore` transparently;
  F5's lifecycle doesn't change.
- **F8 (FPS HUD)** mounts inside the modal body (or as an overlay on
  the canvas) when `?debug=1` query string is present.
- **Phase 1 games** all follow the new `startGame(canvas, ctx)`
  interface. Hello-world is the reference implementation.
