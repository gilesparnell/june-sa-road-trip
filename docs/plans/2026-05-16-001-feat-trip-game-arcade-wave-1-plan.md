---
title: "feat: Trip Game Arcade — Wave 1 (4 mini-games for the boys)"
type: feat
status: active
date: 2026-05-16
origin: docs/brainstorms/2026-05-16-trip-game-arcade-requirements.md
---

# feat: Trip Game Arcade — Wave 1 (4 mini-games for the boys)

## Routing Summary

| Runner | Units | Notes |
|---|---:|---|
| **claude** | 14 | Content-pass copy, foundation design, per-game design + polish, launch judgement — judgement-heavy work where mechanical execution alone is wrong |
| **codex-delegate** | 10 | Content-pass implementation from clear spec, foundation impl, per-game impl, mechanical fixes |
| **hybrid** | 0 | Each unit has a clear owner; no shared ownership |

**Phase order:** 0a Content → 0 Foundation → 1 Games (Long Tom → Gold Pan → Camera Safari → Hairpin Drift) → 2 Polish + Launch. Phase 0a unblocks user-facing value first; Phase 0 unblocks all game work; Phases 1+2 add the headline experience.

Claude-tagged units exist because: per-game **design** (level data, physics constants, win/lose conditions, fun-feel tuning) is the kind of judgement work that doesn't survive mechanical delegation — get it wrong and the game ships flat. Foundation **design** (modal architecture, score-schema, identity model) similarly anchors the whole arcade and benefits from holistic thinking before codex executes against a spec.

## Enhancement Summary

**Deepened on:** 2026-05-16
**Sources:** architecture-strategist · code-simplicity-reviewer · performance-oracle · framework-docs-researcher · best-practices-researcher · MDN audio + service-worker docs

### Key improvements incorporated

1. **Kaplay version pinned to `3001.0.19`** with concrete `kaplay({ global: false, ... })` init config — prevents the v3000-vs-v4000 footgun and the multi-game window-pollution bug.
2. **`k.quit()` teardown on modal close** added to F5 spec — without this, Kaplay's RAF loop stacks on every modal open and iOS Safari OOM-kills the tab after ~10 game launches in a session. This was a real blind spot in the original plan.
3. **Scoring formula codified** for all 4 games: `(base × combo_multiplier × time_bonus) + perfect_run_bonus`. Combo resets on miss. Visible "previous best ghost" during play. This is THE replayability driver for 10-year-old gamers per the research.
4. **Difficulty curve targets specified**: L1 ≥ 85% first-try clear, L2 ~50% first-try, L3 ~15% first-try / ~60% by 5th. Calibrated to "competent in 30s, hooked on L3" for real gamers.
5. **Persistent player badge on modal launch screen** — not buried in settings (per architecture review). Shared-iPad is the dominant device profile and a single localStorage slot for 3 boys silently corrupts the leaderboard.
6. **Asset budget per category** for Camera Safari (was the under-the-radar perf risk, not Hairpin): WebP atlas ≤ 200KB sprites + ≤ 200KB audio (AAC m4a ~96kbps mono) + ≤ 100KB JS.
7. **Touch input pattern** for Hairpin Drift: `onTouchStart/Move/End` + `Vec2` + CSS `touch-action: none` on canvas (otherwise iOS hijacks horizontal swipes for browser back-gesture).
8. **iOS audio unlock pattern** documented: tap-to-start splash → `audioCtx().resume()` + silent burp. Kaplay does NOT auto-unlock; without the splash, sound just doesn't play on iOS.
9. **Diegetic tutorial** replaces the "How to play" overlay tip — 2-line text on the first playable moment, auto-dismisses on first input. Modal tutorials get mashed-through by gamer kids; L1 itself IS the tutorial.
10. **FPS HUD instrumentation** added as a new Phase 0 unit (`?debug=1` toggle, rolling 60-frame avg). Without this, NF-AC3 "≥ 45 FPS" is aspirational vibes — not a verifiable gate.

### Recommended cuts (adopted)

| Cut | Saves | Rationale |
|---|---:|---|
| Photo-evidence collection grid in Camera Safari | ~2h | Feature inside a feature. Score = correct taps; grid is wave-2 polish. |
| Per-game `docs/games/<id>/design.md` files | ~1h | Level data lives in game JS as constants — that IS the design doc. One `docs/games/README.md` is enough. |
| "How to play" tip overlay | ~1h | Replaced by diegetic L1 tutorial per best-practices research. |
| Abstract NF-AC1/2/3 perf metrics (< 500KB, 2s TTI, ≥ 45 FPS) | ~0h, but stops gold-plating | Replaced by concrete "parent QA on iPhone + FPS-HUD baseline doc" gate. The FPS HUD measures, the parent decides. |
| Per-game unit split (design → impl → polish) collapsed 3 → 2 | ~2h | Design + polish merged into one Claude-tagged unit bookending Codex's impl. 22 units → 18. |

### Tensions — resolved 2026-05-16

| Tension | ✓ Decided |
|---|---|
| **F7: Service worker** | **Keep as originally planned (vanilla SW).** Boys may genuinely play offline during the in-car Eastern Cape stretches. ~4h, no change to F7 spec above. |
| **F3: Score backend storage** | **Co-locate in the existing Gist** (`scores` blob alongside `items`). **Drop the ETag retry** — simultaneous-twin contention is rare enough that last-write-wins is acceptable. F3 effort reduces to ~3h. |
| **F4: Scoreboard widget timing** | **Build inline inside Long Tom's polish (G1.3) first. Extract to a shared widget when G2 (Gold Panner) needs reuse.** Foundation F4 unit is **removed** — its work moves into G1.3 (~+1h to G1.3, but Foundation drops ~3h). |

### New unit added

**Phase 0, F8: FPS HUD + perf baseline doc** — `?debug=1` enables a rolling-FPS overlay on every game. Phase 2 P2 spec extended to capture min/p5/median FPS per game on a real iPhone 13 in Safari Web Inspector. Without this, "feels snappy" is the only ship gate, which is fine for a family project but loses signal for wave-2 decisions. ~2h.

### Schema additions (cheap, big UX wins)

- `personalBest` field per `{game, player}` — surfaces the "ghost line" in-game during play. #2 replayability driver per the research.
- `dailySeed` arcade-level field — single PRNG seed per day, enables future "daily challenge" feature with no new schema.

### Net effect

- Original plan: 22 units, ~65h
- After recommended cuts + new FPS HUD: **18 units, ~52h** (with vanilla SW kept per user decision)
- After adding Phase 0a content pass (see below): **24 units, ~67h** in 5 weeks — back at the original budget
- All four games still ship at full scope; the cuts are infrastructure-and-theatre, not gameplay.

### Late addition (2026-05-16, post-deepen): Phase 0a — Kid-friendly content pass

User priority shift before game work begins: the existing v2 prose was written for adult readers. For an 11-year-old (Matti is older than the twins by about a year), it's text-dense, paragraph-heavy, low on visual breaks. The games will live INSIDE this content — if the content itself is hard to parse, the boys never reach the "play" button.

**New phase added BEFORE Phase 0 Foundation** — see "Phase 0a" below. ~15h, 6 units.

Sequencing rationale: content-pass is independent of foundation (different surface — HTML/CSS vs JS/backend), so parallelisable in theory; but since this is single-developer evening cadence, sequence rather than parallelise. Content first gives the boys something to engage with even if the game arcade slips.

**Real tradeoff:** ~67h total in 5 weeks. If that's too tight, cut wave-1 to 3 games (drop Hairpin Drift — the riskiest mechanic and last in build order anyway). Decision lives at the bottom of Phase 0a.

## Overview

Build a v1 trip-game arcade of 4 polished snack-sized mini-games embedded into the v2 magazine itinerary site, with a shared family scoreboard. Wave 1 of a phased rollout (the 14-game full vision lives in `Future Considerations`). Targeted at three real gamers (Matti + twins, ~10 years old) who will reject quizzes-as-game and only engage with genuine arcade-feel mechanics. Shipping before 19 June 2026.

## Problem Statement

The existing v2 site is rich written content the boys won't engage with unprompted. The parent has invested significant effort in per-day prose, history, photos, and activity cards — and the children skim it. An engagement layer is needed that makes them return to the app repeatedly through the pre-trip, during-trip, and post-trip arc.

Critical constraint: the audience are experienced gamers. They will detect "education with a thin game veneer" and dismiss it. Failure mode being avoided is **quality variance** — shipping 14 mediocre games is strictly worse than shipping 4 polished games, because one weak game taints the whole arcade in a gamer's eyes.

(See origin: `docs/brainstorms/2026-05-16-trip-game-arcade-requirements.md` Problem Frame.)

## Proposed Solution

Phased rollout. **Wave 1 = 4 polished games**, shipped by mid-May, validated by family playtest. Wave 2/3 (the remaining 10 day-position games) explicitly deferred until wave 1 proves the engagement loop.

Each game is a Kaplay-based HTML5 mini-game, launched from a modal on its day's page (reusing the existing `photo-modal` UX pattern). Scores tagged per-player (Twin A / Twin B / Matti / Adult identity picker), stored in a shared family scoreboard via extension of the existing `/api/actions` Gist-backed endpoint.

Hard scope cap: each game is "snack tier" — 3-5 minute play sessions, 2-3 levels, score-attack replay value. No multiple-choice quizzes. Pure arcade feel.

## Technical Approach

### Architecture

```
┌─ /v2/ existing magazine itinerary site ──────────────────────────┐
│                                                                   │
│  Day pages (1, 2, 5, 7, 9 in wave 1)                             │
│    └─ existing "The Drive" section                               │
│    └─ NEW [▶ Play <game>] button → opens GAME MODAL              │
│                                                                   │
│  GAME MODAL (new)                                                 │
│    ├─ Kaplay canvas (lazy-loaded on modal open)                  │
│    ├─ Player identity badge ("playing as Twin A")                │
│    ├─ Live score + best-of-game footer                           │
│    └─ Close + sound-toggle controls                              │
│                                                                   │
│  Shared scoreboard widget (hub + day pages)                       │
│    └─ "Family leaderboard" — top scores per game per player      │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
                              │
                              ▼
            ┌──── /api/actions (extended) ────┐
            │  Gist-backed shared state:       │
            │  { items: [...],                 │  ← existing
            │    scores: {                     │  ← NEW
            │      "long-tom": {                │
            │        "twin-a": [{score, ts}],  │
            │        "twin-b": [...],          │
            │        "matti":  [...]           │
            │      },                          │
            │      "gold-pan": {...},          │
            │      "hairpin-drift": {...},     │
            │      "camera-safari-bushveld":...│
            │      "camera-safari-kruger":...  │
            │    }                             │
            │  }                               │
            └─────────────────────────────────┘
                              │
                              ▼
            ┌──── Service worker (offline cache) ──┐
            │  Precache: game JS, sprites, sounds,  │
            │  Kaplay framework, page shells        │
            │  Network-first: /api/actions          │
            │  Offline submit: queue → flush on net │
            └───────────────────────────────────────┘
```

### Tech stack

| Layer | Choice | Why |
|---|---|---|
| Game framework | **Kaplay** (latest stable) | ~50KB, kid-friendly API, fast iteration. (See origin: Key Decisions.) Pinned by version in `<script>` tag for reproducibility. |
| Game canvas | HTML5 Canvas via Kaplay | Standard, well-supported, no WebGL gotchas |
| Identity persistence | localStorage | v1 simplicity; cookie/server-ID rejected as overkill for family scope |
| Score backend | Existing `/api/actions` Gist, extended | (See origin: Key Decisions.) Reuses auth/secrets already wired into Vercel; no new infra |
| Score schema | `{ scores: { "<game-id>": { "<player-id>": { personalBest, history: [{score, ts}, ...] } } }, dailySeed }` | Top-N history per player per game; `personalBest` field surfaces the in-game ghost line (#2 replayability driver per research); arcade-level `dailySeed` enables future "daily challenge" feature at no schema cost |
| Asset hosting | `/v2/games/assets/<game-id>/...` (sprites + audio in repo) | Zero CDN dependency, version-controlled |
| Audio | Kaplay built-in audio + Freesound.org / OpenGameArt (CC0) sources | Free, licence-compatible |
| Offline | Service worker (vanilla, no Workbox) | Precache static, network-first for `/api/actions`, offline-submit queue |
| Player picker | Custom modal, first-visit + change-in-settings | (See origin: R6) |
| Modal UX | Reuse `.photo-modal` pattern from v2 with `.game-modal` extension class | Familiar to the family, reduces new chrome |

### Implementation Phases

#### Phase 0a: Kid-friendly content pass (~15h, Week 1 — runs before Phase 0)

The v2 site as-shipped reads as a parent's travel-magazine. For an 11-year-old gamer to actually engage with it (and reach the "play" button when games arrive), the existing content needs a structured pass for visual density, reading load, and pull-quote breaks. Goal: same factual richness, half the cognitive effort to skim.

**Design principles** (applied across all 11 pages — hub + 10 days):

- **No paragraph longer than 4 sentences.** Anything denser splits into two paragraphs or becomes a callout.
- **Kid TL;DR card at the top of every day page** — 3-4 sentences, kid-language, the day's headline + one thing to look forward to + one fun fact. Distinct visual style (sand background, larger font, friendly icon).
- **"Did you know?" callouts** replace dense history paragraphs. Pull the most interesting fact out, make IT the headline, fold the supporting context underneath at smaller size.
- **Type scale widening** — currently mostly body 1rem + h3 1.4rem. Add an "intro" 1.15rem (lead paragraphs) and a "callout" 1.3rem (pull-out facts). Bigger visual differentiation between idle scan and "stop and read this".
- **Inline iconography sprinkled sparingly** — ⛰️ mountain, 🦁 wildlife, ⚙️ history, 🍴 food, 📷 photo-stop. Once or twice per page max. Aids skim, doesn't crowd.
- **Reading-mode toggle** — "Kid view" hides parent-detail (long Boer-War history blocks, route waypoint tables), shows TL;DR + activities + photos + for-kids. "Full view" shows everything. Persists per-device.
- **No tabs UI for content** (skill-loaded frontend-design rule: tabs hide content that should be scrollable). Use accordions / show-more reveals instead, OR the reading-mode toggle. Keep one canonical scroll order.

| # | Unit | Runner | Effort | Description |
|---:|---|---|---:|---|
| C1 | Kid TL;DR cards (10 per day + 1 hub) | claude | 3h | Write per-day Kid TL;DR copy in 3-4 kid-language sentences. Add to each day page above the existing "The Drive" / "Why" section. Mirror on the hub as a "Trip in a sentence per day" strip. |
| C2 | Visual-density audit + paragraph splits | claude (audit) → codex-delegate (impl) | 3h | Walk each day page; split any paragraph > 4 sentences. Convert long lists into shorter chunked lists. Don't rewrite voice — restructure rhythm. |
| C3 | "Did you know?" callout component + content pass | claude | 3h | New `.fun-fact` component (rust-bordered callout, bigger key fact + smaller context underneath). Convert ~3-5 of the densest history paragraphs across the site (Surrender Hill, Long Tom, Brandwater Basin, Queen's Road, the Maluti Boer-war content) into this format. |
| C4 | Type-scale extension + heading polish | codex-delegate | 2h | Add `--font-intro` (1.15rem) and `--font-callout` (1.3rem) to the design system. Bump the hero h1 scale a touch on day pages. Tighten letter-spacing on display headings. |
| C5 | Reading-mode toggle (Kid view ↔ Full view) | claude (design) → codex-delegate (impl) | 3h | Toggle button in topnav. localStorage-persisted. CSS-class on body: `.mode-kid` hides `[data-detail="adult"]` blocks (long history, parent-tactical callouts), keeps TL;DR + activities + photo-modal + for-kids. Default to Full view (parent loads first); kid sets Kid view once. |
| C6 | Inline iconography sprinkle | codex-delegate | 1h | One-pass: walk each day page, add ~5 inline emoji icons in narratively-appropriate spots. Convention: stays under 5 per page; never inside dense paragraphs (they belong to the callout / pull-out facts). |

**Phase 0a acceptance gate:** Open every day page in Kid view; the parent can skim each in under 30 seconds and feel like they've grasped the day. The 11-year-old will tell us whether it works — qualitative signal, no metric. Boys playtest with kid-view active before any game ships.

**Wave-1 scope decision flagged here:** Adding Phase 0a pushes total to ~67h. If 5 weeks feels too tight, the recommended cut is Hairpin Drift (G4 — the riskiest mechanic, last in build order). 3 games + content pass = ~52h, comfortable. 4 games + content pass = ~67h, tight. *User to confirm before Phase 1 begins.*

#### Phase 0: Foundation (~20h, Week 1, before any game can launch)

Bricks-not-walls work. Each game depends on every Phase 0 unit shipping.

| # | Unit | Runner | Effort | Description |
|---:|---|---|---:|---|
| F1 | Kaplay bootstrap + folder structure | codex-delegate | 2h | Pin Kaplay version (`<script src="kaplay@x.y.z.min.js">`), create `/v2/games/` folder with one boilerplate game shell, document the per-game scaffold (init code, asset path conventions, canvas size). |
| F2 | Player identity picker | claude (design) → codex-delegate (impl) | 3h | First-visit modal: Twin A / Twin B / Matti / Adult buttons. Selection stored as `localStorage.currentPlayer`. Settings menu (gear icon) allows re-pick. Edge cases: handle wrong-name picks via re-pick affordance — no hard lock. (Resolves origin Q9.) |
| F3 | Backend score-storage extension | claude (design) → codex-delegate (impl) | 4h | Extend `api/actions.js`: `normalise(raw)` accepts and emits `scores: {}`. New action `submit-score` (game-id, player-id, score, ts) → upsert into player's top-N (keep top 10). Write contention: Gist PATCH is last-write-wins; use ETag-based optimistic retry (1-2 retries on conflict). Schema migration is no-op since the existing `items[]` is untouched. (Resolves origin Q3.) |
| F4 | Family scoreboard widget | claude (design) → codex-delegate (impl) | 3h | Reusable component renders per-game leaderboard (top 3 per player + best ever). Two embedding contexts: (a) inside each game modal; (b) inline on day pages. Loads scores via existing `GET /api/actions` (no new endpoint). |
| F5 | Game modal infrastructure | claude (design) → codex-delegate (impl) | 3h | New `.game-modal` class extending the existing `.photo-modal` pattern. Differences from photo modal: full-bleed canvas inside, persistent score+player badge, sound-toggle button, escape-to-close (with "are you sure?" if mid-game). (Resolves origin Q1.) |
| F6 | Sound infrastructure + mute toggle | codex-delegate | 2h | `localStorage.muted` toggle. Kaplay's `volume(0|1)` global. Autoplay-restriction handling: sound starts on first user input (tap), not on modal open. |
| F7 | Service worker (offline cache) | claude (design) → codex-delegate (impl) | 4h | Precache: game JS, sprite atlases, sound files, page shells, Kaplay framework. Network-first for `/api/actions` with stale-while-revalidate fallback. Offline score-submit queue in IndexedDB, flush on `online` event. Cache-busting on version bump via versioned cache name. (Resolves origin Q5.) |

**Phase 0 acceptance gate:** A throwaway "Hello world" Kaplay game embedded on a day page can be played, scores a winning interaction, submits to the backend, appears on the scoreboard. (Offline-after-first-load only if the F7 service-worker tension resolves toward "keep".)

##### Foundation research insights

**F1 — Kaplay version + init config:** Pin to `3001.0.19` (latest stable; `v4000` is in dev — do **not** ship `@next`). CDN: `https://unpkg.com/kaplay@3001.0.19/dist/kaplay.mjs` (or jsDelivr mirror). Critical init flags for an arcade-inside-a-site:

```js
const k = kaplay({
  global: false,            // CRITICAL: prevents window pollution; multiple games would clobber each other
  canvas: modalCanvas,
  width: 800, height: 450,
  background: [0, 0, 0, 0],
  loadingScreen: false,     // render our own spinner inside the modal
  backgroundAudio: false,
  touchToMouse: true,
  maxFPS: 60,               // high-refresh iPads otherwise run physics at 120fps and break gravity tuning
  crisp: true,
  debug: false,
});
// on modal close: k.quit(); modalCanvas.remove(); k = null;
```

**F2 — Persistent player badge (architecture-review change):** Show "Playing as: Twin A  [change]" on the modal launch screen itself, not buried in settings. Shared-iPad is the dominant device profile and a single localStorage slot for 3 boys silently corrupts the leaderboard. Force a confirm tap at game-start when player hasn't been confirmed in the last 10 minutes.

**F3 — Score backend (split-file architecture):** Don't co-locate `scores` with `items` in the same Gist blob — they have different write profiles (items = occasional, single-actor; scores = high-frequency, multi-actor). Split into `scores.json` as a second file in the same Gist (still one endpoint, one auth, no new infra). Drop the ETag-retry logic from the spec — separate-file split makes contention rare enough that last-write-wins is fine.

**F5 — Game modal teardown (HIGH-IMPACT new spec):** On modal close, call `k.quit()` (Kaplay teardown), then `modalCanvas.remove()` from DOM, then null the kaplay instance reference. Without this, the RAF loop stacks on every modal open + each game's event listeners + audio context leak, and iOS Safari OOM-kills the tab after ~10 game launches in a session. Add to acceptance: open/close each game 10× consecutively, confirm Safari memory tab shows no monotonic growth. Also: set CSS `touch-action: none` on the game canvas (iOS hijacks horizontal swipes for browser back-gesture otherwise).

**F5 — iOS audio unlock pattern:** Kaplay uses Web Audio under the hood but does **not** auto-unlock for iOS. Without explicit unlock, sound just doesn't play. Gate the arcade behind a "Tap to play" splash on the modal — on that first tap, call `audioCtx().resume()` and play a silent `burp({ volume: 0 })` or real SFX. After this one-time unlock the rest of `play("sfx")` calls work normally for the whole session.

**F6 — Audio format + preload:** Convert all Freesound CC0 SFX to `.m4a` (AAC ~96kbps mono) — iOS Safari's native sweet spot, ~30–50KB per clip vs 200–500KB WAV. Preload + decode during modal-open lazy-load phase, not on first-play (otherwise audible jank on first sound). Use Kaplay's `loadSound()` synchronously in init.

**F7 — Service worker decision (FLAGGED):** Two reviewers disagree. See "Tensions" in Enhancement Summary. My lean: drop F7 entirely. Browser HTTP cache on first play covers most real offline cases (hotspot dropout in EC). Saves ~4h. If kept: use Workbox via CDN for precache routes, custom code only for IndexedDB submit queue. Don't roll vanilla SW from scratch.

**F8 (NEW) — FPS HUD + perf baseline doc:** ~2h, codex-delegate. Add a `?debug=1` query-string toggle that overlays a rolling-60-frame FPS counter on every game. Phase 2 P2 spec extends to capture min/p5/median FPS per game on a real iPhone 13 in Safari Web Inspector → Timelines, log to `docs/games/perf-baseline.md`. Without this, "feels snappy" is the only ship gate.

#### Phase 1: Wave-1 games (~40h, Weeks 2-4)

Build sequence rationale: Long Tom first (clearest mechanic, cannon physics is well-understood, validates Kaplay's physics + Phase-0 integration). Then Gold Pan (small, same Day-5 page, low risk). Then Camera Safari (most asset-heavy, but its mechanic ports to two days at no extra cost). Hairpin Drift last (driving control is the hardest fun-feel to nail; if it slips, the arcade still has 3 solid games).

##### G1. Long Tom: Aim & Fire (Day 5, physics)

| # | Unit | Runner | Effort | Description |
|---:|---|---|---:|---|
| G1.1 | Design + level data | claude | 3h | Physics constants (gravity, wind), target placements (3 levels: easy/medium/hard), win condition (hit target with shell), scoring formula (efficiency-based: fewer shells = higher score, direct-hit bonus), failure state (out of shells). Visual frame + escarpment background concept. Sound list (aim chirp, fire boom, hit explosion, miss thud, fanfare). |
| G1.2 | Implementation | codex-delegate | 5h | Build per G1.1 spec. Drag-to-aim (angle + power), release-to-fire, projectile arcs under Kaplay gravity, hit-detection on targets, score submit at level-complete. |
| G1.3 | Polish + sound + level transitions | claude | 3h | Sound implementation (sourcing from Freesound), particles on hit, screen-shake on fire, level-transition feel. Final fun-feel pass. |

##### G2. Pilgrim's Rest Gold Panner (Day 5, reaction)

| # | Unit | Runner | Effort | Description |
|---:|---|---|---:|---|
| G2.1 | Design + level data | claude | 2h | Mechanic: tilt/tap pan, water animation swirls particles, gold (yellow) settles, gravel (grey) washes out, tap to "pluck" gold nuggets that appear briefly. 3 levels (varying gold density, tighter timer). Win condition: collect target amount of gold in time. Failure: timer expires below threshold. |
| G2.2 | Implementation | codex-delegate | 4h | Kaplay particle system for water/gold/gravel. Tap detection. Timer + counter UI. |
| G2.3 | Polish + sound | claude | 2h | Water-splash loop, scoop, gold "ting", end-of-level summary. |

##### G3. Bushveld + Kruger Camera Safari (Days 7-9 + 11-13, spotting)

One mechanic reused with two sprite skins (Lissataba bushveld scene; Skukuza riverside scene). Embedded on Day 7 page AND Day 9 page — each with its own scoreboard slug (`camera-safari-bushveld`, `camera-safari-kruger`).

| # | Unit | Runner | Effort | Description |
|---:|---|---|---:|---|
| G3.1 | Design + scene/animal data | claude | 3h | Layered scene art structure (3 layers: bush + mid + sky). Animal sprites (Big-5 + zebra + giraffe + impala). Each animal has appear/disappear timing + hiding-spots in the scene. Camera viewfinder UI. 3 levels (easy/medium/hard: varying animal-appearance speed). Win: photo N animals in time, rare ones worth more. |
| G3.2 | Implementation | codex-delegate | 4h | Scene rendering, animal appear/disappear loops, tap-to-photograph, photo-evidence collection grid, score submission. |
| G3.3 | Polish + sound + second scene | claude | 3h | Ambient bird-call loop, shutter click, animal cries (roar/trumpet). Kruger riverside re-skin (asset swap only, same engine). |

##### G4. Naude's Nek Hairpin Drift (Day 2, driving)

| # | Unit | Runner | Effort | Description |
|---:|---|---|---:|---|
| G4.1 | Design + level data | claude | 4h | Mechanic: swipe-left/swipe-right to steer, automatic forward motion (top-down or 3/4 view), hit hairpins at correct line, avoid going over the edge. **Driving feel is the hardest design problem** — needs iteration on responsiveness, friction, drift threshold. 3 levels (increasing speed, tighter turns, optional snow patches on level 3). Win: reach the summit. Score: time + drift bonus. |
| G4.2 | Implementation | codex-delegate | 5h | Car sprite + physics, road segments, mountain edge collision, scenery scroll, drift mechanic. |
| G4.3 | Polish + sound | claude | 3h | Engine loop (pitch ramps with speed), tyre squeal, wind, brake screech. Fun-feel iteration loop (this WILL need 2-3 playtests with the user). |

##### Wave-1 game research insights

**Universal scoring formula (all 4 games):**

```
score = (base_points × combo_multiplier × time_bonus) + perfect_run_bonus
```

- **Combo multiplier:** ×1 → ×2 → ×4 → ×8, resets to ×1 on miss. Visible counter pops in scale (1.0 → 1.2 → 1.0 over 200ms) on each multiplier increment.
- **Time bonus:** remaining seconds × 10, added at level clear.
- **Perfect-run bonus:** flat +1000 for zero misses on a level. Visible "PERFECT!" callout with screen flash.
- **Visible "previous best" ghost line** displayed during play (per `personalBest` schema field).

This pattern is the single highest-impact replayability driver for the 10-year-old gamer audience.

**Universal difficulty curve targets:**

| Level | Win rate target | Mechanic load |
|---|---|---|
| L1 (Easy) | ~85% first-try clear | One mechanic, generous tolerances. **L1 IS the tutorial.** |
| L2 (Medium) | ~50% first-try, ~80% by 3rd attempt | Same mechanic + one twist (faster, moving target, distractor). |
| L3 (Hard) | ~15% first-try, ~60% by 5th attempt | All variables active, score-attack ceiling. |

Tuning rule: a parent should clear L3 within 5 attempts; the boys will beat that. Underestimating them is the bigger risk than overshooting.

**Universal tutorial UX:** Diegetic 2-line overlay on first playable moment (e.g., "TAP and DRAG to aim. RELEASE to fire."), auto-dismiss on first input. **No modal tutorial screens, no mascots, no narration** — gamer kids 8-12 read 2 lines max then mash through. Skip button always visible. (Replaces "How to play tip" in NF-AC6.)

**Universal failure handling:** Instant retry, no lives, tap-to-retry button auto-focused on level-fail. Per-level checkpoint (never mid-level rewind). Visible "best run" persists through failure — failed attempt still feels like part of a longer journey.

**G1.1 (Long Tom) — game-feel spec:** Charge-up shake on aim, recoil shake on fire (0.15s, 6px amplitude), arc trail (fading line behind shell), impact particles + screen flash on hit, hitstop 80ms on direct hit, distinct sounds for charge/fire/hit/miss. Tune Kaplay `hashGridSize: 128` (default 64) — smoother single-fast-projectile vs static-target collision.

**G2.1 (Gold Panner) — game-feel spec:** Water-shimmer particle on shake, gold-glint sparkle when nugget surfaces, satisfying "clink" on collect, combo counter pop animation. Kaplay's built-in `particles()` component handles water/gold/gravel (use `acceleration` for gravity on falling gravel, `shape: Rect` emitter, `getSprite("gold-fleck").frames` for textured flecks).

**G3.1 (Camera Safari) — asset budget (HIGH-IMPACT new spec):** This is the under-the-radar perf risk, not Hairpin. Layered scenes × Big-5 sprites × 2 re-skins = realistic 1.5–3MB raw before optimisation. Mandate:
- **Single power-of-two sprite atlas per scene** (TexturePacker / free-tex-packer)
- **WebP at q75** for sprites
- **Per-category budget:** ≤ 200KB sprites + ≤ 200KB audio + ≤ 100KB JS = ≤ 500KB total per scene
- **Build-time `du -sh` check** that fails > 500KB

Also for the spotting mechanic: reticle snap-to with subtle magnetism, camera-shutter sound + white flash on capture, animal name + score "+250" floats up and fades, near-miss = red vignette pulse.

**G4.1 (Hairpin Drift) — touch input + perf spec:** Use Kaplay's `onTouchStart/Move/End` with `Vec2`, scale `pos.sub(touchPos)` by `window.devicePixelRatio`. Production pattern:

```js
let touchPos = null;
onTouchStart((pos) => { touchPos = pos; });
onTouchMove((pos) => {
  if (!touchPos) return;
  const delta = pos.sub(touchPos).scale(window.devicePixelRatio);
  car.angle += delta.x * STEER_GAIN;
  touchPos = pos;
});
onTouchEnd(() => { touchPos = null; });
```

**Perf interventions specific to G4 (FPS-risk game):**
- `display: none` (not `visibility: hidden`) the v2 magazine DOM behind the modal during play — recovers compositor budget on iOS.
- Cap `pixelDensity: Math.min(devicePixelRatio, 2)` — biggest single iOS win.
- Pool car/particle entities, never instantiate inside the loop.
- Tyre smoke particles on turn, screen tilt 2–3° into corner, speed lines at high velocity, vibration API on mobile, "PERFECT LINE!" callout for clean corner.

**Asset sourcing** (resolves origin Q6):
- **Sound:** Freesound.org (CC0) — pre-curate ~30 SFX BEFORE implementation starts (don't optimise-as-you-go).
- **Sprites:** OpenGameArt.org CC0 packs OR custom-drawn. Mixed is fine.
- **Audio format:** all SFX converted to `.m4a` AAC ~96kbps mono.

**Score-submit pattern (extension of F3):** Fire-and-forget client-side — optimistic UI shows "submitted" instantly, IndexedDB queue (or simple in-memory retry if F7 SW is cut) handles the actual PATCH async. Submit should NOT block "Next level" UI — score-attack pace depends on no friction.

#### Phase 2: Polish + Pre-trip Launch (~5h, Week 5)

| # | Unit | Runner | Effort | Description |
|---:|---|---|---:|---|
| P1 | Cross-game "Trip Champion" leaderboard | claude (design) → codex-delegate (impl) | 2h | Hub-page widget aggregating top scores across all 4 games per player. Weighting: best-of each game contributes equally. (Resolves origin "Future Considerations" sketch.) |
| P2 | Full QA pass + mobile sanity | claude | 2h | Per-game checklist: launches, controls work on touch + desktop, scores save, scoreboard updates live, sound toggles, offline works. iPhone Safari + Android Chrome smoke. |
| P3 | Pre-trip launch + observation window | claude | 1h | Family-launch comms (parent shares the URL), 1-week observation, decide on wave 2 based on play data. |

### Visual style direction (per-game design decision)

**Default:** soft hand-drawn cartoon, cohesive sprite palette per game family. Game canvas is a "TV inside the magazine's living room" — the modal's chrome stays in the v2 design system (navy/rust/cream), but the canvas itself is its own visual world.

**Per-game starting palette:**

- **Long Tom** — Victorian battlefield: muted khaki, brass cannon, smoke
- **Gold Panner** — river dust: muted browns, gold accents, blue water
- **Camera Safari** — bushveld: greens, ochre, animal silhouettes
- **Hairpin Drift** — mountain pass: cold blues, snow whites, road grey

Pixel art was considered (faster, free sprite packs) but rejected on coherence grounds — too retro for the magazine site. (Resolves origin Q8.)

### Build-and-test workflow

(Resolves origin Q10.)

1. Claude/Codex writes the game JS in `/v2/games/<game-id>.html` + assets in `/v2/games/assets/<game-id>/`
2. User opens the day page in browser, clicks "Play" → playtests
3. User feeds back via voice notes or short Slack-like message
4. Iterate per game until the user signs off as "fun"
5. Sign-off triggers the next unit

Iteration frequency target: each game gets 3 playtest cycles. Average 1-2 days between cycles.

## Alternative Approaches Considered

| Alternative | Why rejected |
|---|---|
| Single mini-game shared across all 14 days (themed differently) | Too samey for real gamers — they'd see the trick within 2 days. Wave-1 spec explicitly chose 4 distinct mechanics. (See origin: Key Decisions / phased rollout.) |
| Phaser 3 instead of Kaplay | Overkill for snack-tier scope, ~10x framework size, steeper API learning curve. (See origin: Key Decisions.) |
| Vanilla canvas (no framework) | Boilerplate cost over 4-14 games is the issue. Kaplay buys per-game velocity. |
| External game-hosting service (Construct 3, GameDistribution iframes) | Loses trip-context, branding, identity, and family-scoreboard integration. The whole point is custom-to-trip. |
| GPS-aware location triggers (auto-unlock per-day games during trip) | Genuinely cool but explicitly out of scope (see origin: Scope Boundaries). Risk during the trip if reception drops. |
| Quiz-with-badges (the original brainstorm direction A/B) | User feedback in brainstorm explicitly killed this — "must not feel like a chore." |

## System-Wide Impact

### Interaction Graph

What fires when a kid plays a game:

```
[click "Play" button on day page]
  → game modal opens
  → Kaplay framework lazy-loads (cached on first load via SW)
  → game JS loads + initialises
  → game reads `localStorage.currentPlayer` (prompts picker if missing)
  → game runs (Kaplay event loop)
  → on level-complete:
      → POST /api/actions {action:"submit-score", game, player, score, ts}
      → actions.js readState() from Gist
      → merge new score into scores[game][player] (keep top 10)
      → writeState() PATCH back to Gist (with ETag if available)
      → response triggers scoreboard widget refresh
  → if offline:
      → queue submission in IndexedDB
      → background flush on `online` event
```

### Error & Failure Propagation

- **Kaplay load failure** (CDN down, version mismatch): game modal shows "couldn't load" with a retry. Day page itself unaffected. Catch: pin version in script tag + log to console for debugging.
- **Score submit failure** (Gist API rate limit, 5xx): queue submission in IndexedDB, retry on next interaction or `online` event. Game UI shows "score saved" optimistically; surface "failed to sync" only after 3 retries fail.
- **Score-write contention** (two boys play simultaneously): Gist PATCH is last-write-wins. Optimistic retry on 412 (ETag mismatch) up to 2 times. Documented edge case: if both submit within ~2s and both retries fail, one score is lost. Acceptable for v1 — twin-simultaneous-submission is rare in practice and the loss is one record of many.
- **Identity mis-pick** (Matti picks "Twin A"): no hard lock; settings menu allows correction. Submit-score continues regardless. Post-fact correction means scores attributed to wrong player — accept as known edge case, document in user-facing settings copy ("pick carefully — scores save under this name").
- **Service worker version skew** (old game JS loaded from cache after deploy): versioned cache name + skipWaiting on activate. Day-page is the version source-of-truth (it references the right game JS path).
- **Mid-game crash** (Kaplay error, asset 404): error boundary in modal — show "the game crashed, try again". No score submitted.

### State Lifecycle Risks

- **Score submitted but Gist write fails partway**: writeState is a single PATCH — atomic at Gist level. No partial state.
- **Player abandons mid-game**: no submission, no score recorded. Safe by design.
- **Cache poisoning** (corrupted asset cached): cache-busting on version bump (cache name includes content hash).
- **localStorage cleared by user/browser**: player picker re-prompts on next visit. Scores in backend persist by player-id, but the player-id lookup loses context. Document as "if you clear your browser, please pick your name again."

### API Surface Parity

The existing `/api/actions` endpoint currently exposes `GET`, `POST` with `action: add|remove|rename|toggle|set-owner|reorder`. We're adding:

- `POST { action: "submit-score", game, player, score, ts }`
- `GET` response gains a `scores` key alongside `items`

Backwards compatible — existing action-items widget unaffected. Documented in `api/actions.js` action-handler despatch.

### Integration Test Scenarios

(No test framework in this project, so these are MANUAL test scenarios run before launch.)

1. **Two players submit at the same time**: open the game on two devices, both finish a level within 5s. Confirm both scores appear, one or both visible in scoreboard.
2. **Offline play → reconnect**: turn aeroplane mode on, play a level, submit, turn aeroplane mode off. Confirm score appears on scoreboard within 60s.
3. **Identity change mid-session**: play a game as Twin A, score X. Change to Matti via settings. Play same level, score Y. Confirm scoreboard shows X under Twin A and Y under Matti, not mixed.
4. **Score submit while another browser is editing action-items**: parent edits action-items list on phone, twin submits a score on iPad. Confirm both writes succeed (last-write-wins on contention is acceptable; verify items list isn't corrupted).
5. **Service worker activation after deploy**: deploy a new version, load site on a stale device. Confirm new JS loads within 1 reload, no mixed-version state.

## Acceptance Criteria

### Functional Requirements

**Foundation (Phase 0):**

- [ ] **F-AC1.** Player picker shows on first visit; selection persists across page loads. (R6)
- [ ] **F-AC2.** Settings menu exposes "change player" with the 4 options. (R6)
- [ ] **F-AC3.** `/api/actions` accepts `submit-score` action and stores per-player top-10. (R7)
- [ ] **F-AC4.** Scoreboard widget shows top 3 scores per player per game, refreshing on game-end. (R7)
- [ ] **F-AC5.** Game modal launches from each wave-1 day page with one tap. (R1)
- [ ] **F-AC6.** Sound respects mute toggle, persists across visits. (R10)
- [ ] **F-AC7.** All wave-1 games playable offline after first load (service worker precache verified). (R9)
- [ ] **F-AC8.** Offline-submitted scores flush to backend within 60s of reconnect.

**Wave-1 games:**

- [ ] **G-AC1.** Long Tom: 3 levels playable, hit-detection accurate, score submits, replayable for score-attack. (R2, R8)
- [ ] **G-AC2.** Gold Panner: 3 levels playable, satisfying tactile feel on gold-pluck, score submits, replayable. (R2, R8)
- [ ] **G-AC3.** Camera Safari (Bushveld + Kruger): each scene has 3 levels, animals appear/disappear correctly, photo-collection grid persists per session, score submits, replayable. (R2, R8)
- [ ] **G-AC4.** Hairpin Drift: 3 levels playable, controls feel responsive on touch + desktop, edge-fall game-over works, score submits, replayable. (R2, R8)

**Non-functional:**

- [ ] **NF-AC1.** Each game has < 500KB asset payload (initial load).
- [ ] **NF-AC2.** Each game loads (TTI) within 2 seconds on 4G after Kaplay framework is cached.
- [ ] **NF-AC3.** Each game runs at >= 45 FPS on iPhone 13-era hardware.
- [ ] **NF-AC4.** No game has multiple-choice quiz mechanics as gating. (R5)
- [ ] **NF-AC5.** Modal chrome respects v2 design system (navy/rust/cream + Fraunces/DM Sans).
- [ ] **NF-AC6.** Each game has a "How to play" 2-line tip on first launch per player.

### Quality Gates

- [ ] All 4 wave-1 games signed off by the parent as "fun" before launch
- [ ] Each game played at least once on iPhone Safari + macOS Chrome before launch
- [ ] Service worker precache verified offline for at least 1 game pre-launch
- [ ] Family scoreboard verified with mock data from all 3 player-IDs

## Success Metrics

(Carries forward from origin Success Criteria, with measurement plan.)

- **By 19 June:** 4 wave-1 games shipped at snack scope. *Measured:* deploy log + parent QA sign-off.
- **Engagement:** each of Matti + Twin A + Twin B plays each wave-1 game ≥ 5 times pre-trip. *Measured:* `scores` blob has ≥ 5 entries per (game × player) combo by 18 June.
- **Competition signal:** scoreboard has visible competition across all 3 boys. *Measured:* at least one player overtakes another's top score before departure.
- **Offline:** 4 wave-1 games confirmed playable offline. *Measured:* parent flies aeroplane mode for 5 min, plays each, scores submit on reconnect.
- **Post-trip retention:** at least one game opened by a boy after 1 July. *Measured:* qualitative — parent eyeballs scoreboard ts values.

## Dependencies & Prerequisites

- **External:** Kaplay's current stable version (to pin in Unit F1).
- **Internal:** v2 site stays as deploy host. `/api/actions` endpoint stays writable to its existing Gist. Existing design system (navy/rust/cream + Fraunces/DM Sans) holds.
- **Asset sourcing:** ~30-50 free-licence game sounds (Freesound.org CC0), ~20-40 sprites (custom-drawn or OpenGameArt CC0).
- **Person:** parent available for 3 playtest rounds per game; Claude/Codex available for implementation.

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|:--:|:--:|---|
| **Wave-1 scope slips past 19 June** | Medium | High | Hard sequencing: foundation first, then Long Tom + Gold Pan (both on Day-5 page) — these alone make Day 5 the showcase. Camera Safari + Hairpin Drift are the late games; if one slips, the arcade still has 2-3 solid games on the trip's highlight day. |
| **Hairpin Drift driving feel never lands** | Medium | Medium | It's last in build order. If it stalls after 2 playtests, swap for a simpler Day-2 mini-game (e.g., "Spot Naude's Nek from the road" tap game) rather than ship broken driving. |
| **Boys engage less than expected** | Low | High | Wave 1 is the test. If 5+ plays per boy doesn't happen pre-trip, don't build wave 2. Pivot to lighter engagement (better photos, video).  |
| **Score-write contention causes lost scores** | Low | Low | Documented edge case; ETag retry mitigates most. Worst case: 1 lost record of many — acceptable for family scope. |
| **Identity confusion (boy picks wrong name)** | Medium | Low | Re-pick affordance always available. Document in copy. Not worth hard-lock for v1. |
| **Service worker bug causes stale-content loading** | Low | Medium | Versioned cache name. Manual unregister-and-refresh in DevTools as fallback during dev. |
| **Kaplay version becomes incompatible mid-build** | Low | High | Pin to specific version `3001.0.19` (not "latest"). Re-verify on weekly cadence during build. Do not ship `@next` / `v4000`. |
| **Memory leak across multiple game launches in a session** | **High** | **High** | Without `k.quit()` + canvas removal on modal close, Kaplay's RAF loop stacks, event listeners multiply, textures leak; iOS Safari OOM-kills the tab after ~10 launches. **Mitigation: F5 teardown spec is non-optional.** Acceptance test: open/close each game 10× consecutively, confirm Safari memory tab shows no monotonic growth. |
| **Player-identity corruption on shared iPad** | **High** | **Medium** | A single localStorage slot for 3 boys means whoever picked last "owns" all scores until someone changes it. **Mitigation:** persistent "Playing as: X [change]" badge on the modal launch screen (per F2 update), force confirm on game-start if last confirm > 10min ago. The shared iPad is the dominant device profile — this isn't an edge case. |
| **iOS Safari audio just doesn't play** | Medium | Medium | Kaplay does not auto-unlock Web Audio for iOS autoplay restrictions. Without an explicit `audioCtx().resume()` on first user gesture, sound is silently broken. **Mitigation:** F5 spec mandates a tap-to-start splash on first modal open per session that unlocks audio. |
| **Asset sourcing eats more time than expected** | Medium | Medium | Pre-curate Freesound + OpenGameArt picks in Unit F6/G*.1 BEFORE implementation starts. Don't optimise-as-you-go. |
| **Boys are not online enough to flush queued offline scores** | Low | Low | The site is opened often pre-trip on home wifi. Risk lives in-trip; flush window of 60s is short. |

## Resource Requirements

- **Effort:** ~65h total (Phase 0: ~20h, Phase 1: ~40h, Phase 2: ~5h).
- **Timeline:** 5 weeks (today through 19 June 2026). ~13h/week. Tight but feasible for an evening cadence if foundation lands by end of week 1.
- **Runners:** ~50% claude (design, polish, judgement), ~50% codex-delegate (impl from spec, mechanical fixes). See Routing Summary.
- **Tools:** Cursor / Codex CLI for implementation work, Kaplay docs + REPL for fast iteration, Freesound.org + OpenGameArt.org for asset sourcing.
- **Compute:** Vercel hobby tier (zero cost increase), GitHub Gist storage (free).
- **Money:** ~$0 budget. All assets CC0 / royalty-free.

## Future Considerations

### Wave 2 / Wave 3 (deferred)

Remaining day-position games, build order based on wave-1 play data:

- Day 1: R67 Roadtripper (driving template reused)
- Day 3: Lesotho Smuggler (runner template)
- Day 4: Maize Maze (puzzle template)
- Day 6: Bourke's Luck Pothole Hopper (platformer)
- Day 8: HDS Connector (logistics puzzle — pickup/drop game)
- Day 10: Transfer Time-Attack (driving template reused)
- Day 14: Long-haul N4 (rhythm — toll-plaza pacing)

Decision gate: wave 2 build sequence chosen by which mechanic family wave-1 boys play most.

### v1.1 polish

- Personal-best view (if shared scoreboard demoralises a boy)
- Per-game tutorial overlay (currently a 2-line tip on first launch)
- Achievement system (cross-game milestones)

### Stretch features (post-trip, if engagement is real)

- Wave 2/3 build-out (full 14-game arcade)
- Real-time multiplayer (twin-vs-twin races)
- GPS-aware unlocks during the trip
- Annual return: next year's family trip uses the same engine, different game set

## Documentation Plan

- `docs/games/README.md` — arcade overview, how to add a new game, asset path conventions, identity model.
- `docs/games/score-schema.md` — score blob structure, submit/read API.
- `docs/games/<game-id>/design.md` — per-game level data, scoring formula, sound list.
- Inline JSDoc in `v2/games/<game-id>.js` for game-specific constants.

## Sources & References

### Origin

- **Origin document:** [`docs/brainstorms/2026-05-16-trip-game-arcade-requirements.md`](../brainstorms/2026-05-16-trip-game-arcade-requirements.md) — key decisions carried forward:
  - Phased rollout (wave model) — wave 1 = 4 polished games
  - Kaplay framework over Phaser / vanilla
  - Modal launch from each day page (reuse photo-modal pattern)
  - SHARED scoreboard, no private mode in v1
  - Family-only audience, no auth

### Internal references

- Existing photo modal pattern: `v2/day/1.html` line ~297 (`<div id="photo-modal" class="photo-modal" hidden ...>`)
- Existing backend: `api/actions.js` — `normalise(raw)`, `readState()`, `writeState()`
- Existing design system: `v2/assets/styles.css` — palette, type, modal classes
- Shared app JS: `v2/assets/app.js` — extension point for game-launch buttons

### External references

- Kaplay docs: https://kaplayjs.com/ — framework reference
- Freesound.org — CC0 sound effects
- OpenGameArt.org — CC0 sprite packs
- Service worker MDN reference: https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API

### Related Work

- v2 site design system (already shipped this session) — magazine layout, palette, type
- Photo modal (already shipped) — UX precedent reused
- `/api/actions` Gist endpoint (already shipped) — backend extension point
