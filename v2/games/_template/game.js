import { mount } from "../lib/kaplay-loader.js";

export async function startGame(canvas) {
  const k = await mount(canvas);

  k.add([
    k.text("New game scaffold", { size: 32 }),
    k.pos(400, 225),
    k.anchor("center"),
    k.color(255, 255, 255),
  ]);

  return k;
}
