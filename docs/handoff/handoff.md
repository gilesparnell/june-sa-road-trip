# Handoff log — Trip Game Arcade (Wave 1)

Running log of significant work landing on this project. Newest entry at the top.
Per `~/.claude/CLAUDE.md` → Plan Execution Continuity rule.

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
