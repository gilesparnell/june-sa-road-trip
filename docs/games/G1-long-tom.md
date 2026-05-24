# G1 — Long Tom: Aim & Fire (design)

First wave-1 game of the Trip Game Arcade. Anchors **Day 5 (Dullstroom →
Graskop)** at the Long Tom Pass stop. See the plan at
`docs/plans/2026-05-16-001-feat-trip-game-arcade-wave-1-plan.md` for
phase context. This document is the spec codex implements against.

**Effort estimate:** ~11h total — G1.1 design (this doc, ~3h),
G1.2 codex impl (~5h), G1.3 polish (~3h, claude).

---

## Trip-anchor narrative

Day 5 the family crosses Long Tom Pass and stops at the Devil's Knuckles
viewpoint where there's a bronze replica of a 155mm Creusot siege cannon
("Long Tom"). The history: in September 1900, General Louis Botha's
retreating Boer force dragged two of these monsters up the near-vertical
Mauchsberg face rather than surrender them to the British. The boys
will see the cannon. The game lets them shoot it.

Game's purpose: turn the cannon stop from a 5-minute history lesson
into a "I beat level 3 with one shell to spare" memory. Mechanic must
feel like *artillery*, not target practice — gravity matters, wind
matters, angle and power matter.

---

## Mechanic

Side-on view of an escarpment. Cannon at left foreground on a flat
firing platform. Targets are British encampments (tents) across the
valley to the right. Player drags from the cannon outward to set
**angle** (direction of the drag vector) and **power** (magnitude of the
drag). Release fires a shell. Shell travels under gravity + wind. Hit
a target = destroyed. Hit the ground = miss + crater. Out of shells
without clearing all targets = level fail.

### Input model

- **Pointer down on the cannon or on the firing platform** → start aim.
  An indicator line + arc preview shows estimated trajectory while the
  pointer drags.
- **Pointer move** → updates the angle/power.
- **Pointer up** → fires. The trajectory preview disappears; the actual
  shell launches.
- **Cooldown after fire**: 800ms before the next shell can be aimed
  (lets the boys watch the shell travel).
- **Touch + mouse both supported** via Kaplay's `touchToMouse` (already
  set true in F1's loader).

### Aim mechanics — concrete numbers

- Drag vector capped at **300 pixels** (kaplay coords) magnitude. Drags
  longer than that clamp to 300.
- Power formula: `power = clamp(dragMagnitude, 50, 300) / 300 * MAX_POWER`
  where `MAX_POWER = 1100` (kaplay units/sec initial velocity).
- Angle: standard `atan2(-dy, dx)` — note the inverted Y because Kaplay
  Y points down. So drag up-and-right = positive angle in our model.
- Angle clamped to **5° → 85°** (below the horizon never makes sense for
  a cannon; straight up = no horizontal travel either).
- Wind is shown via a top-of-screen indicator (an arrow + "W →"
  label). Wind acts as a constant horizontal acceleration on the
  shell.

### Physics constants

```js
const GRAVITY = 1400;       // px/s² downward
const WIND_SPEED_RANGE = 200; // ±200 px/s² horizontal — varies per level
const MAX_POWER = 1100;     // px/s initial shell velocity at full drag
const SHELL_RADIUS = 8;     // hit-detection radius
const TARGET_RADIUS = 22;   // hit-detection radius around each tent
const COOLDOWN_MS = 800;
const PREVIEW_TICKS = 30;   // points sampled to draw the trajectory preview
const PREVIEW_TICK_DT = 0.05; // seconds per preview tick → ~1.5s of forecast
```

Tuning rationale: these values give shells that visibly arc across the
800×450 canvas in about 1.2s on a full-power 45° shot in zero wind. Long
enough that the boys *see* the arc; short enough that score-attack feels
brisk. The trajectory preview shows ~1.5s ahead so they can plan but
can't 100% pre-compute the optimal shot — wind plus a small randomised
power jitter (±3%) prevents perfect determinism.

### Win / lose conditions

- **Win**: all targets destroyed → level-complete card.
- **Lose**: shells in inventory hit 0 with targets remaining → level-fail
  card + Replay button.
- Within a level, a fired shell that misses just stays in flight until
  it hits the ground or exits the canvas — then it counts as expended.

---

## Levels

Three levels. Each declares its own targets, wind, shell budget, and
hint copy. Targets are placed in kaplay coords (origin top-left, x
right, y down).

### Level 1 — "Sighting in" (easy)

- **3 targets, 5 shells**. No wind.
- Targets at x = {550, 620, 700}, y = 380 (all on flat ground).
- Goal: introduce the drag-aim-fire loop. A direct 45°-ish, mid-power
  shot clears the first target. The boys learn the cannon.
- L1 first-try clear target per plan: ≥ 85%.

### Level 2 — "Wind picks up" (medium)

- **4 targets, 6 shells**. Wind +120 px/s² (rightward — *aids* shots).
- Targets at x = {500, 580, 640, 720}, y = {380, 340, 380, 300} (two on
  ground, two on raised platforms).
- Goal: introduce vertical variation + favourable wind. Players who
  over-power on the high targets sail past them.
- L2 first-try clear target: ~50%.

### Level 3 — "Headwind" (hard)

- **5 targets, 7 shells**. Wind −180 px/s² (leftward — *fights* shots).
- Targets at x = {520, 580, 640, 690, 740}, y = {320, 380, 240, 380, 290}.
  Mix of high and low, includes a far-back tent at y=290 that needs
  high angle + max power against the headwind.
- Goal: requires real aim. Wind-compensation is the new skill.
- L3 first-try clear target: ~15%; 5th-try clear target: ~60%.

Level progression: complete L1 → L2 unlocks within the same modal
session. Complete L2 → L3 unlocks. Complete L3 → final scoreboard +
"Play again" restarts from L1.

---

## Scoring

Per the plan's research insight: **efficiency-based**. Fewer shells used
+ direct-hit bonuses → higher score. Final score submitted to F3 once
per modal session, computed at the moment the player either clears L3
or fails any level.

### Per-level scoring

```
shellsUsed = shells.fired
shellsRemaining = level.shellBudget - shellsUsed
directHits = count of shells that destroyed a target without grazing ground first
nearMisses = count of shells that passed within (TARGET_RADIUS + 30) of a target without hitting

levelScore =
    (targetsDestroyed × 200)             // base — must hit to score
  + (shellsRemaining × 150)              // efficiency bonus
  + (directHits × 100)                   // precision bonus
  + (levelComplete ? 500 : 0)            // completion bonus
  - (failedLevel ? 200 : 0)              // small penalty for fail (still positive overall if any targets hit)
```

### Total score

```
totalScore = sum of levelScore across all 3 levels played this session
```

A perfect 3-level clear:
- L1: 3×200 + 5×150 + 3×100 + 500 = 600 + 750 + 300 + 500 = **2,150**
  (assuming 0 shells used; realistically 3-5 shells used so ~1,400-1,700)
- L2 perfect-clear: ~2,100 if no shells wasted
- L3 perfect-clear: ~2,400
- Realistic perfect 3-clear: **~6,000**

Realistic first-attempt: ~3,500-4,500.

### Personal best vs ghost line

F3's `personalBest` per (gameId, playerId) is used. Before each level,
show a "Best: N" label in the level-card header. After a level
completes, show "Your level score: N (+M from best)" or "(−M from best)".

---

## Sound design

5 sounds total. Sourced from Freesound (CC0 licence per the plan). Each
loaded via F6's `loadSounds(k, manifest)` at game start.

| Id        | Description | Search terms (Freesound) | Approx. length |
|-----------|-------------|--------------------------|---------------:|
| `aim`     | Quick chirp on aim-start (drag begins) | "ui pop", "select chirp" | 0.05s |
| `fire`    | Cannon boom + muzzle whoosh | "cannon shot", "artillery fire" | 0.6s |
| `hit`     | Wood + canvas splinter (tent destruction) | "wood explosion", "barrel destroy" | 0.4s |
| `miss`    | Ground thud + dirt scatter | "ground impact", "dirt explosion" | 0.3s |
| `fanfare` | Short brass triumph on level-complete | "brass triumph", "victory short" | 1.2s |

Convert all to `.m4a` (AAC ~96kbps mono per F6 research). Drop at
`v2/games/long-tom/assets/audio/<id>.m4a`. Total asset budget: under
200KB combined (per the plan's per-game audio budget).

---

## Visual concept

### Layout (800×450 canvas, kaplay coords)

```
+-----------------------------------------------------+
| Wind: ←180 px/s²            Shells: 6     Best: 4200 |  ← HUD strip y=0-40
|                                                     |
|       (sky — gradient navy → dusty blue)            |  ← y=40-300
|                                                     |
|                                                     |
|                                                     |
|   ___                       ▲    ▲   ▲    ▲    ▲    |  ← Long Tom escarpment silhouette y=300
|  /   \   * cannon platform  | tent | tent | tent... |  ← targets y=320-410
| | LT  |================================================ |
|  \___/  ────────────────────────────────────────────|  ← ground line y=415
|                                                     |
+-----------------------------------------------------+
                                                       ← bottom edge y=450
```

### Visuals — minimum viable

- **Sky gradient**: top `#1a2a3e` to mid-line `#5a6f8a` (Kaplay
  rectangle with vertical gradient via two stacked rects + opacity, or
  just a solid `#2a3a52`).
- **Escarpment**: a single jagged polygon along the bottom-right
  (kaplay `polygon` component or stacked rects). Colour `#4a3a2a`.
  This is the Long Tom escarpment silhouette — keep it simple, line-art
  feel.
- **Ground line**: a horizontal `#3a2e1f` band along y=415-450.
- **Cannon**: a stack of two kaplay rects:
  - Base (carriage): 60w × 24h at (40, 380), colour `#444`.
  - Barrel: 50w × 12h centred on (90, 380), rotated by the aim angle,
    colour `#666`.
- **Targets (tents)**: kaplay triangle (3-point polygon) per tent at
  the placement coords above. 36w × 28h. Colour `#c5755a` (canvas
  tent in afternoon light). Add a thin black outline.
- **Shell**: 6×6 circle, colour `#222` with a 2px white outline so it's
  visible against any background.
- **Trajectory preview line**: dotted, 30 points sampled from the
  current aim+power+wind+gravity, drawn while the player is dragging.
  Disappears the instant the player releases.
- **Wind indicator**: top-left strip, an arrow + numeric value. Updates
  per level. Optional: small particle "wind streaks" drifting across
  the sky at low opacity.

No asset images for G1 v1 — all visuals are Kaplay primitives. G1.3
polish may add SVG-style sprite swaps later if there's time.

### HUD copy

- Top-left: `Wind: 0 / +120 / −180 px/s²`
- Top-centre: `Level X — <name>` (small subtitle)
- Top-right: `Shells: N` and below it `Best: M`
- Aim feedback (centre top while dragging): `Angle: 45° · Power: 78%`
- Cooldown indicator: progress arc around the cannon barrel that
  empties as the 800ms cooldown expires.

---

## Game module shape

Per F5's contract (`docs/games/foundation/F5-game-modal.md`):

```js
// v2/games/long-tom/game.js
import { loadSounds } from "../lib/sound.js";

export const meta = {
  title: "Long Tom: Aim & Fire",
  width: 800,
  height: 450,
};

export async function startGame(canvas, ctx) {
  const k = ctx.k;

  await loadSounds(k, {
    aim: "/v2/games/long-tom/assets/audio/aim.m4a",
    fire: "/v2/games/long-tom/assets/audio/fire.m4a",
    hit: "/v2/games/long-tom/assets/audio/hit.m4a",
    miss: "/v2/games/long-tom/assets/audio/miss.m4a",
    fanfare: "/v2/games/long-tom/assets/audio/fanfare.m4a",
  });

  // ... scene setup, level state machine, input handlers, physics loop ...

  // When the session ends (cleared L3 or failed):
  ctx.onRoundEnd({ score: totalScore });

  return k;
}
```

**No `mount()` call inside startGame** — F5 owns the kaplay lifecycle.

---

## Acceptance criteria

1. Module loads cleanly under Node: `node --input-type=module -e
   "import('./v2/games/long-tom/game.js').then(m => console.log(Object.keys(m).sort()))"`
   → prints `[ 'meta', 'startGame' ]`.
2. Game launches via F5 modal from a `data-game-id="long-tom"`
   launcher (Phase 1 polish adds a launcher button to Day 5).
3. Drag-aim-fire loop works on both mouse and touch.
4. Trajectory preview visible during drag, hidden after release.
5. Shell follows a parabolic arc + wind drift.
6. Hit a target → target disappears + hit sound plays.
7. Miss the ground → crater + miss sound.
8. Out of shells with targets remaining → level-fail card +
   "Replay level".
9. All targets cleared → level-complete card + "Continue" → next
   level.
10. Complete L3 → final summary + `ctx.onRoundEnd({ score: totalScore })`
    fires.
11. Fail any level → final summary uses the current cumulative score
    + `onRoundEnd` fires (the F3 backend accepts even partial scores).
12. Sound mute toggle from F5 modal silences all SFX (kaplay's
    `volume(0)` does this — already wired by F5).
13. FPS HUD (`?debug=1`) overlays the game cleanly when active.
14. Memory: 10× open/close cycles do not leak. Same gate as F5.

---

## What G1 does NOT do (deferred to wave 2+ or v1.1 polish)

- Multiplayer or pass-the-iPad turns.
- Persistent per-level high scores (just the game-wide `personalBest`).
- Difficulty above L3 — only 3 levels per session.
- Animated tent destruction with particles per debris piece (G1.3 polish
  may add a *single* particle burst on hit; not per-shrapnel).
- Real cannon sprite art — vector primitives only in v1.
- Achievements / medals / stars per level.

---

## File layout

```
v2/games/long-tom/
  game.js                       — NEW (G1.2 codex)
  index.html                    — NEW (standalone QA harness, mirrors hello-world's pattern)
  assets/
    sprites/
      .gitkeep                  — empty for v1 (vector primitives)
    audio/
      aim.m4a                   — G1.3 polish (CC0 from Freesound)
      fire.m4a
      hit.m4a
      miss.m4a
      fanfare.m4a
docs/games/
  G1-long-tom.md                — this doc
v2/sw.js                        — G1.3: add long-tom precache entries
                                  (game.js, index.html, audio files), bump VERSION
v2/day/5.html                   — G1.3: add a Day 5 launcher button
                                  (data-game-id="long-tom")
v2/games/README.md              — G1.3: add a "Wave 1 games" section listing G1
```

---

## Forward references

- **G2 (Gold Pan)** also lives on Day 5. After G1 ships, Day 5 ends up
  with two launcher buttons in close proximity. F5's launcher-guard
  + dynamic-import already handles double-tap. No new infra needed.
- **G3 / G4** use different mechanics, so G1's physics state machine
  is a one-off — don't try to extract a "physics game template" for
  later games. Each wave-1 game gets its own state machine.
- **G1.3 polish** depends on F6's `loadSounds` (shipped, ✓), F5's
  `?debug=1` FPS HUD (shipped, ✓), and the SW precache mechanism
  (shipped, ✓). Polish step just adds assets + a launcher button.
