---
date: 2026-05-16
topic: trip-game-arcade
---

# Trip Game Arcade — Mini-games per day for the boys

## Problem Frame

The June SA Road Trip site (v2) has rich written content per day, but Matti and the twins are real gamers — they will not engage with parent-written prose unprompted. The site needs an engagement layer that pulls them BACK repeatedly:

- **Pre-trip** (now → 19 Jun) — to build anticipation and quietly learn the territory
- **During-trip** (19 → 30 Jun) — in-car downtime, at-lodge downtime
- **Post-trip** — replay value as a souvenir

The layer must FEEL like real games. Quizzes-with-badges read as homework and would fail with this audience.

## Requirements

- **R1. Per-day mini-game model.** Each of the 14 day-positions can host its own bespoke mini-game, launched via a modal button on that day's page (same UX pattern as the existing photo modal).
- **R2. Wave-1 must-haves (build first, polish hard, ship by mid-May):**
  - *Long Tom: Aim & Fire* (Day 5, physics / cannon)
  - *Pilgrim's Rest Gold Panner* (Day 5, reaction)
  - *Naude's Nek Hairpin Drift* (Day 2, driving)
  - *Bushveld + Kruger Camera Safari* (Days 7–9 and 11–13, spotting — one mechanic, two skins)
- **R3. Wave-2 / wave-3 sequencing** — the remaining day-position games (1, 3, 4, 6, 8, 10, 14) get built AFTER wave 1 proves the loop, in priority order set by which wave-1 mechanics the boys play most.
- **R4. Per-game scope: "snack" tier** — ~3–5 minute play sessions, 2–3 levels each, polished animations + sound, score-attack replay value. Hard cap to keep 14-game ambition realistic.
- **R5. NOT-homework guarantee.** No multiple-choice quizzes as primary mechanic. Animation, agency, responsive feedback first. Educational content lives as flavour text / level theming, never as a quiz gate.
- **R6. Player identity.** Pick-your-name picker on first visit (Twin A / Twin B / Matti / Adult). Persists per device. Scores tagged per player.
- **R7. Family scoreboard — SHARED.** Cross-device per-player scores visible to the whole family, so the boys see each other's records and compete. Backend extends the existing `/api/actions` Gist storage.
- **R8. Replay value.** Every game supports score-attack ("beat your best"). No one-shot puzzles that lose value after first completion.
- **R9. Offline support.** Games run in-car where 4G is patchy (Eastern Cape, Lesotho border, Naude's Nek). Service worker precaches game assets.
- **R10. Sound.** Required for game feel. Persistent mute toggle per device.

## Success Criteria

- By 19 June departure: 4 wave-1 games shipped at snack scope and polish.
- Each of Matti + twin A + twin B plays each wave-1 game at least 5 times pre-trip.
- Family scoreboard shows live competition data from all 3 boys before departure.
- Wave-1 games are playable offline during at least 2 of the long driving days (e.g., Day 1 + Day 3 / Day 14).
- After the trip, at least one game still gets opened occasionally as a souvenir (qualitative — the parent eyeballs this).

## Scope Boundaries

- **Out of scope for v1:**
  - Real-time multiplayer (twin-vs-twin live races) — not in v1.
  - GPS-aware triggers (location-based unlocks) — not in v1, manual launch only.
  - Original or licenced music — use Creative Commons / Freesound / royalty-free.
  - Persistent cross-trip accounts (e.g., for next year's holiday).
  - Adult / parent gameplay as a first-class experience — adults can play, but the design centres on the boys.
  - Wave 2 / wave 3 games — explicitly *not* in v1 (decision-deferred until wave 1 ships and the boys engage).

## Key Decisions

- **Phased rollout (wave model).** Wave 1 = 4 games (snack scope, polished). Decide on wave 2 only after the boys engage with wave 1. Better to ship 4 great games than 14 thin ones. Failure mode being avoided: "boys play one thin game, declare the arcade mid, stop opening the app." For real gamers, quality variance is more damaging than quantity gap.
- **Kaplay** as the game framework. ~50KB, kid-friendly API, fast iteration. Phaser 3 was rejected as overkill (~600KB, steeper curve, industrial). Vanilla canvas was rejected as too much boilerplate for 14 unique games.
- **One game per day-position**, with Day 5 (the showcase day) getting two games (Long Tom + Gold Panner).
- **Modal launch from each day page.** Same pattern as the existing photo modal already shipped on v2. Familiar, no new navigation, no separate "arcade" hub URL needed in v1.
- **SHARED scoreboard** (everyone sees everyone). Rationale: competition is the engagement driver — private scores defeat the point. Fallback if it backfires on one boy: add a "personal best" view in v1.1.
- **Family-only audience.** No anonymous players, no public scoreboards. The site stays a family-facing artefact; identity is "Twin A / Twin B / Matti / Adult" with no email or account needed.

## Dependencies / Assumptions

- The existing v2 site at `/v2/` is the host. Games are additive — the magazine-itinerary content stays as-is.
- Kaplay's current major version is stable enough for a production family site (to verify in planning).
- The existing `/api/actions` Gist-backed endpoint can be extended with a per-player scores blob without disrupting the current action-items behaviour (to verify in planning).
- Existing v2 design system (navy / rust / cream / DM Sans / Fraunces) holds — games should *not* introduce a new visual language outside the canvas. Modal chrome, buttons, scoreboards all follow v2 styles.

## Outstanding Questions

### Resolve Before Planning

*(none — all blocking product decisions made or explicitly defaulted with reversal path)*

### Deferred to Planning

- *[Affects R1] [Technical]* Modal architecture: reuse the existing photo-modal markup pattern, or build a separate `game-modal` element with different sizing / sound behaviour?
- *[Affects R4] [Needs research]* Per-game scoring rules, difficulty curve, win-lose conditions — fleshed out per game during planning.
- *[Affects R7] [Technical]* Backend extension to `/api/actions`: new fields vs new endpoint vs separate Gist file. Conflict-resolution and write contention with the existing actions list.
- *[Affects R6] [Technical]* Player picker persistence — localStorage only, or set a cookie + server-side ID?
- *[Affects R9] [Technical]* Service-worker cache strategy — which assets precache, which lazy. Cache-busting on updates.
- *[Affects R10] [Needs research]* Sound asset sourcing — Freesound.org / OpenGameArt.org / generated. Per-game sound pack design.
- *[Affects R3]* Wave-2 build sequence — depends on which wave-1 mechanics get played most.
- *[Affects R2]* Visual style direction per game (pixel art / cartoon / flat / mixed) — decided per game during planning. Constraint: it must feel coherent across the arcade.
- *[Affects R7]* Identity edge cases — what happens if Matti picks "Twin A" by accident? Lock the picker or allow re-selection?
- *[Affects all]* Build-and-test workflow — Claude writes the game JS, user playtests in browser and feeds back. Need a tight iteration loop.

## Next Steps

→ `/ce:plan` for structured implementation planning.
