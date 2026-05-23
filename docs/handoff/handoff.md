# Handoff log — Trip Game Arcade (Wave 1)

Running log of significant work landing on this project. Newest entry at the top.
Per `~/.claude/CLAUDE.md` → Plan Execution Continuity rule.

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
