import { mount } from "../lib/kaplay-loader.js";

const GAME_ID = "hello-world";
const ROUND_SECONDS = 30;
const TARGET_SIZE = 40;
const WIDTH = 800;
const HEIGHT = 450;

export async function startGame(canvas) {
  const k = await mount(canvas);

  k.add([
    k.rect(WIDTH, HEIGHT),
    k.pos(0, 0),
    k.color(20, 30, 40),
    k.opacity(1),
  ]);

  let score = 0;
  let remaining = ROUND_SECONDS;
  let active = true;
  let target;
  let playAgain;
  let finalScoreLabel;

  const scoreLabel = k.add([
    k.text("Score: 0", { size: 24 }),
    k.pos(24, 22),
    k.color(255, 255, 255),
  ]);

  const timerLabel = k.add([
    k.text(`Time: ${ROUND_SECONDS}`, { size: 24 }),
    k.pos(WIDTH - 24, 22),
    k.anchor("topright"),
    k.color(255, 255, 255),
  ]);

  const helpLabel = k.add([
    k.text("Tap me", { size: 22 }),
    k.pos(WIDTH / 2, HEIGHT / 2 + TARGET_SIZE),
    k.anchor("center"),
    k.color(255, 255, 255),
  ]);

  function randomTargetPos() {
    return k.vec2(
      k.rand(TARGET_SIZE, WIDTH - TARGET_SIZE),
      k.rand(96, HEIGHT - TARGET_SIZE),
    );
  }

  function moveTarget() {
    target.pos = randomTargetPos();
    helpLabel.pos = target.pos.add(0, TARGET_SIZE);
  }

  function resetRound() {
    score = 0;
    remaining = ROUND_SECONDS;
    active = true;
    scoreLabel.text = "Score: 0";
    timerLabel.text = `Time: ${ROUND_SECONDS}`;

    if (playAgain) {
      k.destroy(playAgain);
      playAgain = null;
    }

    if (finalScoreLabel) {
      k.destroy(finalScoreLabel);
      finalScoreLabel = null;
    }

    if (target) {
      target.hidden = false;
      target.paused = false;
      helpLabel.hidden = false;
      moveTarget();
    }
  }

  function endRound() {
    active = false;
    remaining = 0;
    timerLabel.text = "Time: 0";
    target.hidden = true;
    target.paused = true;
    helpLabel.hidden = true;

    console.log({ game: GAME_ID, score });

    finalScoreLabel = k.add([
      k.text(`Final score: ${score}`, { size: 36 }),
      k.pos(WIDTH / 2, HEIGHT / 2 - 38),
      k.anchor("center"),
      k.color(255, 255, 255),
    ]);

    playAgain = k.add([
      k.rect(170, 48, { radius: 6 }),
      k.pos(WIDTH / 2, HEIGHT / 2 + 36),
      k.anchor("center"),
      k.area(),
      k.color(56, 191, 160),
      "play-again",
    ]);

    playAgain.add([
      k.text("Play again", { size: 22 }),
      k.anchor("center"),
      k.color(0, 0, 0),
    ]);
  }

  target = k.add([
    k.rect(TARGET_SIZE, TARGET_SIZE),
    k.pos(WIDTH / 2, HEIGHT / 2),
    k.anchor("center"),
    k.area(),
    k.color(56, 191, 160),
    "target",
  ]);

  k.onClick("target", () => {
    if (!active) {
      return;
    }

    score += 1;
    scoreLabel.text = `Score: ${score}`;
    k.burp();
    moveTarget();
  });

  k.onClick("play-again", () => {
    resetRound();
  });

  k.onUpdate(() => {
    if (!active) {
      return;
    }

    remaining = Math.max(0, remaining - k.dt());
    timerLabel.text = `Time: ${Math.ceil(remaining)}`;

    if (remaining <= 0) {
      endRound();
    }
  });

  return k;
}
