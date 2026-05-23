# Perf baseline — Trip Game Arcade

Captured perf measurements per game on real-world iPhone 13 hardware,
Safari Web Inspector → Timelines, sustained gameplay (≥ 30s).

## How to capture

1. Open the live URL with `?debug=1` appended (e.g.
   `https://june-sa-road-trip.vercel.app/v2/games/hello-world/?debug=1`).
2. Connect the iPhone to a Mac via USB, open Safari → Develop → [iPhone] →
   the page.
3. In Web Inspector: Timelines → start recording.
4. Play 30 seconds of normal gameplay.
5. Stop recording. Look at the FPS chart. Note the **min**, **5th percentile**, and **median**.
6. Cross-check with the on-screen FPS HUD — should agree within ±1 fps.
7. Add a row to the table below.

## Target

- p5 ≥ 45 fps sustained (NF-AC3 from the plan)
- Min should not drop below 30 fps for more than a single frame

## Baseline

| Game                       | Device     | iOS  | Min | p5 | Median | Notes |
|----------------------------|------------|------|----:|---:|-------:|-------|
| hello-world                | iPhone 13  |      |     |    |        | placeholder — capture before Phase 1 |
| long-tom                   |            |      |     |    |        | TBD post-G1 ship |
| gold-pan                   |            |      |     |    |        | TBD post-G2 ship |
| camera-safari-bushveld     |            |      |     |    |        | TBD post-G3 ship |
| camera-safari-kruger       |            |      |     |    |        | TBD post-G3 ship |
| hairpin-drift              |            |      |     |    |        | TBD post-G4 ship |
