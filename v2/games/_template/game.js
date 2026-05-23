// Game module template (F5 contract).
//
// When F5 launches a game, it owns the Kaplay instance lifecycle (Pattern A):
//   - F5 creates the canvas + calls mount(canvas) via the kaplay-loader
//   - F5 passes the resulting `k` to startGame in ctx.k
//   - The game uses ctx.k directly; do NOT call mount() yourself
//   - When the round ends, call ctx.onRoundEnd({ score }) — F5 routes the
//     submit to F3 + refreshes F4's scoreboard
//   - F5 owns teardown (k.quit + canvas.remove) on modal close
//
// See docs/games/foundation/F5-game-modal.md for the full contract.

export const meta = {
  title: "Game scaffold",
  width: 800,
  height: 450,
};

// canvas: the <canvas> F5 created (Kaplay already mounted on it)
// ctx: { player, k, onRoundEnd, onAudioUnlock }
export async function startGame(canvas, ctx) {
  const k = ctx.k;

  k.add([
    k.rect(800, 450),
    k.pos(0, 0),
    k.color(20, 30, 40),
  ]);

  k.add([
    k.text("New game scaffold", { size: 32 }),
    k.pos(400, 225),
    k.anchor("center"),
    k.color(255, 255, 255),
  ]);

  // Replace this stub with real game logic. When the round ends:
  //   ctx.onRoundEnd({ score });

  return k;
}
