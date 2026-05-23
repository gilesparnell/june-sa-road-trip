# Handoff log — Trip Game Arcade (Wave 1)

Running log of significant work landing on this project. Newest entry at the top.
Per `~/.claude/CLAUDE.md` → Plan Execution Continuity rule.

---

## 2026-05-23 AEST — Phase 0 F5 complete + roster expanded to 6 named players

Runner: Claude (design + orchestration) → codex-cli (F5 impl) → Claude (review + commit).

**Player roster expanded.** Earlier in the session: added Gilo / Vonnies /
Julz as named adult players; retired the generic `adult` catch-all.
Subsequent display-name renames: Griff → GriffBiff, Connor → ConBon,
Gilo → GiloPants, Julie → Julz. Final 6-player line-up:

  twin-a  → GriffBiff 🦓
  twin-b  → ConBon    🐘
  matti   → Matti     🦁
  gilo    → GiloPants 🦘
  vonnies → Vonnies   🐨
  julz    → Julz      🦒

IDs stayed stable through the renames (F3 storage uses IDs as foreign keys
— never change once shipped). `scoreboard.js` now derives
CANONICAL_PLAYER_IDS from F2's PLAYERS constant — single source of truth
on the client. Server-side mirror in `api/actions.js` stays hardcoded
with sync warning.

Clarification: Vonnies IS Jackie (Jackie Vanessa Nash, the partner's
nickname is Vonnies). Originally I treated them as separate; one player
covers both.

**F5 (Game modal infrastructure) landed.** Design at
`docs/games/foundation/F5-game-modal.md`. Implementation: single ESM
module at `v2/games/lib/game-modal.js` exporting `openGameModal`.

Lifecycle codex implemented:
1. Launcher tap → dynamic-import game-modal → openGameModal called
2. Modal DOM mounts, styles inject, focus trap starts
3. F2 player flow runs in modal body (picker or confirm-stale or
   skip-if-fresh)
4. F5 paints chrome (title, player badge with [change], sound toggle,
   close button)
5. "Tap to play" splash renders
6. Splash tap: SYNC canvas creation + DOM swap → await mount(canvas)
   → audioCtx().resume() + silent burp() → load game module → call
   startGame(canvas, ctx)
7. Game plays. Round-in-progress flag set true.
8. Game emits ctx.onRoundEnd({ score })
9. F5 submits via F3, mounts F4 scoreboard (full view, current player
   highlighted), shows Play again + Close
10. Close mid-round: inline "Quit now?" confirm. Close post-round:
    teardown immediately.
11. Teardown: k.quit() → canvas.remove() → null refs → scoreboard
    unmount → modal DOM remove → focus restore → promise resolve.

**Breaking change to game module interface** — hello-world/game.js
refactored. Games now export `{ meta, startGame(canvas, ctx) }`. F5
owns the kaplay instance lifecycle (Pattern A); game modules receive
`ctx.k` and do NOT call `mount()` themselves. Games emit `onRoundEnd`
instead of directly calling `submitScore`. Phase 1 games will follow
this interface.

Standalone QA harness at `hello-world/index.html` updated to provide its
own ctx callbacks — keeps the no-modal verification path alive.

Launcher button added to the v2 hub (`v2/index.html`) with prominent
inline CSS. Click delegation in `v2/assets/app.js` (non-module IIFE)
dynamic-imports game-modal so the modal code is lazy-loaded.

Static checks all clean: single export, no innerHTML on dynamic
content, no top-level await, no window globals, hello-world no longer
imports submitScore/getCurrentPlayer directly.

### Phase 0 status

| Unit | Status |
|---|---|
| F1 Kaplay bootstrap | ✅ verified |
| F2 Player identity picker | ✅ verified |
| F3 Backend score storage | ✅ verified end-to-end via curl |
| F4 Scoreboard widget | ✅ shipped |
| F5 Game modal | ✅ just landed; needs visual verification |
| F6 Sound infrastructure | ⏳ next (mostly polish on F5's mute) |
| F7 Service worker | ⏳ |
| F8 FPS HUD | ⏳ |

### Next

**F6 (Sound infrastructure + mute toggle)** — `codex-delegate`, ~2h.
F5 already implements localStorage mute state. F6 may be a small
extraction into its own module + polish + audio-asset preload helpers.
Worth a tight design pass before kicking off codex.

### Gotchas for next session

- F5 visual verification owed: open
  `https://june-sa-road-trip.vercel.app/v2/` and tap the "▶ Play Hello
  World (demo)" launcher. Picker → splash → game → scoreboard → close
  flow should complete. Open/close 10× consecutively for the memory
  leak check.
- The standalone QA harness at
  `https://june-sa-road-trip.vercel.app/v2/games/hello-world/` still
  works as a non-modal verification path.
- F5 design doc and impl shipped as two commits — `e315e93` (design
  only, unpushed initially for /ultrareview) + the impl commit. Verify
  both reached origin/main.

---

## 2026-05-23 AEST — Phase 0 F4 complete + 3 flying games added to wave 2/3

Runner: Claude (design + orchestration) → codex-cli (F4 impl) → Claude (review + commit).

**F4 (Family scoreboard widget) landed.** Design at
`docs/games/foundation/F4-scoreboard.md`. Implementation: single ESM
module at `v2/games/lib/scoreboard-widget.js` exporting `mountScoreboard`.

- Two view modes — compact (4 rows sorted by personalBest, day-page
  inline) and full (4 player sections in canonical order, top-3 personal
  scores with relative timestamps, game-modal post-round)
- Caller-driven refresh — `handle.refresh()` issues `getScores({ force: true })`;
  concurrent calls dedupe to a single in-flight promise
- Idempotent `unmount()` clears DOM + active-owner state
- Defensive on bad F3 data — entries missing `ts` or non-numeric `score`
  are skipped silently
- `highlightId` defaults to F2's `getCurrentPlayer()?.id`; rust accent
  on the highlighted row/section
- Styles injected via `injectStyles()` template-string `<style>` tag

Hello-world QA harness updated: scoreboard mounted under the canvas
after player selection. Auto-refresh every 5s so submits round-trip
to display in the harness. Real F5 will do proper post-submit refresh
without polling.

Static checks: single export, no innerHTML on dynamic content, no
top-level await, no window globals, no hardcoded player IDs (imports
PLAYERS from F2). Codex's logic walk-through covered all paths.

**Three flying games added to wave 2/3 deferred list:**
- Day 7: **Bush Pilot** — Cessna landing at HDS / Arathusa shuttle
- Days 8–10: **Sunrise Balloon** — hot-air balloon drift over the Lowveld
- Days 8–10: **Bateleur** — soaring raptor hunt (honours HESC + Moholoholo)

All three need a shared "altitude-and-drift" template. Templating cost
bundles into whichever is built first.

### Next

**F5 (Game modal infrastructure)** — `claude (design) → codex-delegate (impl)`,
~3h. Extends the existing `.photo-modal` pattern in v2 with a
`.game-modal` class: full-bleed canvas inside, persistent score+player
badge (the in-modal `[change]` affordance from F2), sound-toggle button,
escape-to-close (with "are you sure?" if mid-game). After F5 lands,
hello-world can be tested as an embedded modal launch instead of a
standalone harness.

### Gotchas for next session

- F4 visual verification still owed by Giles — open
  `https://june-sa-road-trip.vercel.app/v2/games/hello-world/` and
  confirm the scoreboard renders under the game canvas with a
  `personalBest: 100` row for `twin-a` (from my F3 curl test).
- F4's QA polling in hello-world is throwaway — F5 will replace it
  with a proper post-submit refresh.
- The wave 2/3 deferred list mostly uses pre-schedule-shift day
  numbers. A "canonical day-number sweep" is a separate housekeeping
  task before wave-2 build starts.

---

## 2026-05-23 AEST — Phase 0 F3 complete + F1/F2 visually verified

Runner: Claude (design + orchestration) → codex-cli (F3 impl) → Claude (review + commit).

**F1 + F2 visually verified.** Giles ran `python3 -m http.server 8765`
(8000 was held by an unrelated FastAPI service) and opened
`http://localhost:8765/v2/games/hello-world/`. Picker rendered, player
selection persisted, game loaded with player name in heading. Click-target
loop, 30s timer, "Pick player" change-affordance all worked. F1 and F2
gates closed.

**F3 (Backend score storage) landed.** Design at
`docs/games/foundation/F3-score-storage.md`. Resolved the plan's
co-locate-vs-split-file tension as **split-file** — every score submit
would have rewritten the action items list otherwise, and Gist PATCH
supports per-file updates so we get the benefit at no infra cost.

Server side (`api/actions.js`):
- New `scores.json` file in the same Gist (lazy-init on first submit)
- Canonical ID lists for gameIds + playerIds with "keep in sync with
  v2/games/lib/player.js" comment
- New `submit-score` action with validation (unknown id → 400, invalid
  score → 400, score rounded to integer)
- `readBothFiles()` parses both files in one Gist fetch; `writeScores()`
  PATCHes only `scores.json`; existing `writeState()` still PATCHes
  only `actions.json` — existing action handlers untouched
- Per-player top-10 history (FIFO truncate) + `personalBest`
  denormalised for cheap in-game ghost reads
- Last-write-wins (no ETag retry), per plan's tensions-resolved section

Client side (`v2/games/lib/scoreboard.js`, new ESM module):
- `submitScore`, `getScores`, `getPersonalBest`, `getTopByGame`
- 30s cache TTL on the scores blob
- `AbortController` 5s timeout + retry-once at 250ms backoff
- 4xx → throw typed `ScoreSubmitError`; 5xx/network → fall back to
  local optimistic estimate (forward-compatible with F7's eventual
  IndexedDB offline queue)
- `getTopByGame` always returns all 4 canonical players even if score 0

Hello-world demo wired through: `game.js` now imports `submitScore` and
`getCurrentPlayer`, fires `submitScore` at round end. Real Phase 0
acceptance gate — Kaplay game + identity + storage — clicks together.
F4 (scoreboard widget) will close the loop with "appears on scoreboard"
visual side.

Static checks: 6 exports load under Node, `node --check api/actions.js`
passes, server mock submit-score logic passes, client retry/fallback
mock passes. Visual verification of the full hello-world → submit flow
needs Giles to (a) ensure Gist `scores.json` initialises on first submit
and (b) check Vercel logs / GitHub Gist to confirm a real submitted
score lands.

### Next

**F4 (Family scoreboard widget)** — `claude (design) → codex-delegate (impl)`,
~3h. Renders per-game leaderboards reading from `getScores()` + `getTopByGame()`.
Two embedding contexts: inside each game modal, and inline on day pages.

### Gotchas for next session

- F3 server logic depends on env vars `GITHUB_TOKEN` and `GIST_ID`
  already set on Vercel. The existing `/api/actions` works in prod, so
  these are already wired — but if a future fresh-clone tries to test
  locally, they'll need `vercel env pull`.
- F3 visual smoke from Giles: open hello-world, play a round, submit
  fires automatically. Check Vercel function logs for the submit, then
  open the Gist on github.com to confirm `scores.json` was created and
  contains the entry.
- Schema migration is forward-only. If the schema ever bumps from
  v1, the F3 server will need to handle the upgrade. Document this
  before F4 if the schema changes.

---

## 2026-05-23 AEST — Phase 0 F2 complete + remaining spreadsheet tabs swept

Runner: Claude (design + orchestration) → codex-cli (F2 impl) → Claude (review + commit).

**F2 (Player identity picker) landed.** Design doc lives at
`docs/games/foundation/F2-player-picker.md` — that's the contract codex
built against. Implementation: single ESM module at `v2/games/lib/player.js`
(~440 lines) exporting `PLAYERS`, `getCurrentPlayer`, `setCurrentPlayer`,
`isConfirmationFresh`, `ensurePlayerForGame`, `showPicker`, plus constants
(`STORAGE_KEY`, `CONFIRM_WINDOW_MS = 10 min`, `SCHEMA_VERSION = 1`).

Key calls in the design (override these if you disagree):
- Display names = real names (Griff / Connor / Matti / Grown-up) rather
  than role labels (Twin A/B/etc). Easier for kids to recognise themselves.
- 10-minute confirmation window before re-prompting (per architecture-review
  insight from the deepened plan).
- In-modal `[change]` affordance instead of a separate settings gear icon
  — pulls the change UX onto the launch screen where it belongs.
- Single self-contained module (logic + inline CSS injection) rather than
  splitting into `player.js + player-ui.js + player.css`. Keeps the unit
  tight and codex-implementable in one pass.

Static checks: 9 exports load cleanly under Node, all 4 canonical IDs
present, no `window.*` globals, no top-level await, `tripArcade` storage
key only appears in `lib/player.js`. `v2/games/hello-world/index.html`
got a "Pick player" button + the picker-on-load wiring so Giles can
visually verify in a browser.

Visual verification still owed: serve `python3 -m http.server` from repo
root, open `http://localhost:8000/v2/games/hello-world/`. First load
should show picker. Pick. Game loads with player tagged.

**Spreadsheet sweep extended.** The two stale tabs flagged in earlier
handoff swept:
- `Jun 2026- Holiday costs / budget` — text-only updates to OPTION 2
  ("6 nights from Kenton to Kruger 18th–23rd June" replaces "4 nights
  19th-22nd"; "Meals for 6 days" replaces "4 days"). Back-end accommodation
  block updated in all three options to "4 nights from 27th June - 1st July
  (3 KPL + 1 JHB)" replacing the stale "6 nights" reading. ZAR cost cells
  left untouched — user to recalc with updated lodging info from the
  June 2026 tab.
- `June 2026 Accomodation` (the "Where" lodging × date matrix) — 13 lodging
  cells filled in for the new schedule. Funny Farm Thu 18 + Fri 19,
  Clarens Sat 20, Dullstroom Sun 21, Graskop Mon 22 + Tue 23 (NEW),
  Arathusa/Lissitaba Wed 24-Fri 26, KPL Sat 27-Mon 29, Jo'ies Tue 30,
  Kenton/Oz Wed 1 Jul (✈ Fly home). KDay marker on Old Oak Sat 13
  preserved.

### Next

**F3 (Backend score storage)** — `claude (design) → codex-delegate (impl)`,
~4h total. Extend the existing `/api/actions` Gist endpoint to accept and
emit a `scores` blob. Plan deepen-pass recommends splitting `scores` into
a second file in the same Gist (different write profiles from `items`)
and dropping the ETag-retry logic.

### Gotchas for next session

- F1 hello-world demo + F2 picker visual verification both still on Giles
  — neither has been clicked in a browser yet. If anything breaks
  visually, F1 (loader contract) and F2 (picker DOM rendering) are the
  prime suspects.
- F3 design needs a call on the "co-locate or split into scores.json file"
  question. The deepen-pass research argued split; the tensions-resolved
  section locked co-locate. Architecture changed; need to revisit.

---

## 2026-05-23 AEST — Phase 0 F1 complete + spreadsheet sync done

Runner: Claude (orchestration) → codex-cli (F1 impl) → Claude (review + commit).

**Schedule shift first.** Earlier in the session, the trip itinerary was updated
to depart Thu 18 June (was Fri 19) with an extra Graskop chill day on Tue 23 June
inserted as new Day 6. Old Days 6–14 renumbered to 7–15. Back-end anchors (HDS
Wed 24, Lissataba Wed–Sat, KPL Sat–Tue, fly home Wed 1 Jul) all unchanged.

**Spreadsheet sync done.** The June 2026 tab in "One Spreadsheet to Rule Them
All" (15goyS2aXj64DOkRSiw6MHilMZ3gJj38baHjxJ8HaftU) — rows 10–22 (Thu 18 Jun →
Tue 30 Jun) rewritten via google-workspace MCP to match v2 itinerary. Old
"Wakkerstroom" + "Lodge 603" + "Jill's birthday Wed 24" labels retired. Vonnie's
leave-day column (A) left untouched — that's a separate concern for Vonnie.

**F1 (Kaplay bootstrap) landed.** Codex executed F1 spec under workspace-write
sandbox. Files created:
- `v2/games/README.md` — scaffold convention
- `v2/games/lib/kaplay-loader.js` — single source of Kaplay URL + init config
  (Kaplay pinned to 3001.0.19, ESM import, `global: false`, maxFPS 60, etc.)
- `v2/games/_template/{game.js,index.html,assets/.../.gitkeep}` — copy-rename starter
- `v2/games/hello-world/{game.js,index.html,assets/.../.gitkeep}` — Phase 0
  acceptance-gate demo (tap target, 30s timer, console.log final score)

Static checks passed: one Kaplay pin in the codebase, no `window.kaplay`/`window.k`
leaks, no top-level await. Codex couldn't run a local HTTP server due to
sandbox socket restrictions, so visual interaction (clicking the target) is
on Giles to verify in a browser. Acceptance-gate demo runs at
`http://localhost:<port>/v2/games/hello-world/` when served locally.

**Plan F7 = Keep, confirmed.** Service-worker is staying in scope. Plan file
line-244 contradiction (deepen-pass author leaned "drop", original tension
resolved "keep") tidied to reflect the final keep decision.

### Next

**F2 (Player identity picker)** — `claude (design) → codex-delegate (impl)`,
~3h total. The design half lands first: modal markup, identity model
(Twin A / Twin B / Matti / Adult), localStorage key, re-pick affordance.
Critical detail from research: persistent player badge on modal launch
screen, not buried in settings (shared-iPad device profile silently corrupts
the leaderboard if a single localStorage slot serves 3 boys).

**Gotcha for next session:** the hello-world demo is not yet visually verified
by Giles. If anything broken shows up on first run, F1 is the line to inspect
(loader contract or Kaplay 3001 API drift are the prime suspects).
