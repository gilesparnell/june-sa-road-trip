import { loadSounds } from "../lib/sound.js";

const WIDTH = 800;
const HEIGHT = 450;
const GRAVITY = 1400;
const WIND_SPEED_RANGE = 200;
const MAX_POWER = 1100;
const SHELL_RADIUS = 8;
const TARGET_RADIUS = 22;
const COOLDOWN_MS = 800;
const PREVIEW_TICKS = 30;
const PREVIEW_TICK_DT = 0.05;
const MIN_DRAG = 50;
const MAX_DRAG = 300;
const MIN_ANGLE = 5;
const MAX_ANGLE = 85;
const GROUND_Y = 415;
const DIRECT_HIT_GROUND_Y = 410;

const LEVELS = [
  {
    name: "Sighting in",
    wind: 0,
    shellBudget: 5,
    targets: [{ x: 550, y: 380 }, { x: 620, y: 380 }, { x: 700, y: 380 }],
  },
  {
    name: "Wind picks up",
    wind: 120,
    shellBudget: 6,
    targets: [{ x: 500, y: 380 }, { x: 580, y: 340 }, { x: 640, y: 380 }, { x: 720, y: 300 }],
  },
  {
    name: "Headwind",
    wind: -180,
    shellBudget: 7,
    targets: [{ x: 520, y: 320 }, { x: 580, y: 380 }, { x: 640, y: 240 }, { x: 690, y: 380 }, { x: 740, y: 290 }],
  },
];

export const meta = {
  title: "Long Tom: Aim & Fire",
  width: WIDTH,
  height: HEIGHT,
};

export async function startGame(canvas, ctx) {
  const k = ctx.k;

  // G1.3 polish will source 5 CC0 SFX from Freesound (aim, fire, hit,
  // miss, fanfare) and drop them at the paths below. Until then we
  // skip loadSounds entirely so the game runs silent without polluting
  // Kaplay's asset queue with 404s.
  // await loadSounds(k, {
  //   aim: "/v2/games/long-tom/assets/audio/aim.m4a",
  //   fire: "/v2/games/long-tom/assets/audio/fire.m4a",
  //   hit: "/v2/games/long-tom/assets/audio/hit.m4a",
  //   miss: "/v2/games/long-tom/assets/audio/miss.m4a",
  //   fanfare: "/v2/games/long-tom/assets/audio/fanfare.m4a",
  // });

  const cannonPos = k.vec2(90, 382);
  const state = {
    phase: "title",
    levelIndex: 0,
    currentLevel: LEVELS[0],
    shellsFired: 0,
    targetsDestroyed: 0,
    directHits: 0,
    totalScore: 0,
    bestScore: Number(ctx.bestScore ?? ctx.personalBest ?? 0),
    isDragging: false,
    inCooldown: false,
    hasEnded: false,
    aim: {
      angleDeg: 45,
      power: 0,
      dragMagnitude: 0,
      vx: 0,
      vy: 0,
    },
  };

  const activeTargets = [];
  const previewDots = [];
  let barrel;
  let windLabel;
  let levelLabel;
  let shellsLabel;
  let bestLabel;
  let aimLabel;

  drawStaticScene();
  drawHud();
  drawTitleCard();

  k.onMouseDown(() => {
    if (k.paused) {
      return;
    }

    const pointer = k.mousePos();

    if (state.phase === "title") {
      clearCards();
      loadLevel(0);
      return;
    }

    if (state.phase !== "aim" || state.inCooldown || !isInCannonArea(pointer)) {
      return;
    }

    state.isDragging = true;
    updateAimFromPointer(pointer);
    updateBarrel();
    drawPreview();
    aimLabel.hidden = false;
    k.play("aim");
  });

  k.onMouseMove(() => {
    if (k.paused || !state.isDragging) {
      return;
    }

    updateAimFromPointer(k.mousePos());
    updateBarrel();
    drawPreview();
    updateHud();
  });

  k.onMouseRelease(() => {
    if (k.paused || !state.isDragging) {
      return;
    }

    state.isDragging = false;
    clearPreview();
    aimLabel.hidden = true;

    if (state.aim.dragMagnitude < MIN_DRAG) {
      return;
    }

    fireShell();
  });

  k.onClick("continue-level", () => {
    if (k.paused || state.phase !== "level-complete") {
      return;
    }

    clearCards();
    loadLevel(state.levelIndex + 1);
  });

  k.onClick("play-again", () => {
    if (k.paused || state.phase !== "final") {
      return;
    }

    clearCards();
    resetSession();
    loadLevel(0);
  });

  return k;

  function drawStaticScene() {
    k.add([
      k.rect(WIDTH, HEIGHT),
      k.pos(0, 0),
      k.color(42, 58, 82),
    ]);

    k.add([
      k.rect(WIDTH, 230),
      k.pos(0, 0),
      k.color(90, 111, 138),
      k.opacity(0.6),
    ]);

    k.add([
      k.polygon([
        k.vec2(450, 450),
        k.vec2(500, 380),
        k.vec2(620, 320),
        k.vec2(800, 360),
        k.vec2(800, 450),
      ]),
      k.pos(0, 0),
      k.color(74, 58, 42),
    ]);

    k.add([
      k.rect(WIDTH, 35),
      k.pos(0, GROUND_Y),
      k.color(58, 46, 31),
    ]);

    k.add([
      k.rect(78, 12),
      k.pos(24, 404),
      k.color(82, 72, 58),
    ]);

    k.add([
      k.rect(60, 24),
      k.pos(40, 380),
      k.color(68, 68, 68),
    ]);

    k.add([
      k.rect(70, 10),
      k.pos(34, 398),
      k.color(38, 38, 38),
    ]);

    barrel = k.add([
      k.rect(54, 12),
      k.pos(cannonPos),
      k.anchor("left"),
      k.rotate(-state.aim.angleDeg),
      k.color(102, 102, 102),
      k.outline(2, k.BLACK),
    ]);
  }

  function drawHud() {
    windLabel = k.add([
      k.text("", { size: 18 }),
      k.pos(20, 18),
      k.fixed(),
      k.color(255, 255, 255),
    ]);

    levelLabel = k.add([
      k.text("", { size: 18 }),
      k.pos(WIDTH / 2, 18),
      k.anchor("top"),
      k.fixed(),
      k.color(255, 255, 255),
    ]);

    shellsLabel = k.add([
      k.text("", { size: 18 }),
      k.pos(WIDTH - 20, 18),
      k.anchor("topright"),
      k.fixed(),
      k.color(255, 255, 255),
    ]);

    bestLabel = k.add([
      k.text("", { size: 16 }),
      k.pos(WIDTH - 20, 42),
      k.anchor("topright"),
      k.fixed(),
      k.color(220, 232, 234),
    ]);

    aimLabel = k.add([
      k.text("", { size: 18 }),
      k.pos(WIDTH / 2, 46),
      k.anchor("top"),
      k.fixed(),
      k.color(235, 244, 245),
    ]);
    aimLabel.hidden = true;

    updateHud();
  }

  function drawTitleCard() {
    state.phase = "title";
    addOverlayCard([
      { text: "Long Tom: Aim & Fire", size: 34, y: 150 },
      { text: "Tap once, then drag from the cannon to fire.", size: 18, y: 205 },
      { text: "Clear the tents before the shells run out.", size: 18, y: 235 },
    ]);
  }

  function loadLevel(levelIndex) {
    clearLevelObjects();
    state.levelIndex = levelIndex;
    state.currentLevel = LEVELS[levelIndex];
    state.shellsFired = 0;
    state.targetsDestroyed = 0;
    state.directHits = 0;
    state.isDragging = false;
    state.inCooldown = false;
    state.phase = "aim";
    clearPreview();

    for (const target of state.currentLevel.targets) {
      const tent = k.add([
        k.polygon([k.vec2(0, 28), k.vec2(36, 28), k.vec2(18, 0)]),
        k.pos(target.x - 18, target.y - 14),
        k.color(197, 117, 90),
        k.outline(2, k.BLACK),
        "level-object",
      ]);

      activeTargets.push({
        center: k.vec2(target.x, target.y),
        obj: tent,
        destroyed: false,
      });
    }

    updateHud();
    updateBarrel();
  }

  function resetSession() {
    state.levelIndex = 0;
    state.currentLevel = LEVELS[0];
    state.totalScore = 0;
    state.hasEnded = false;
    state.inCooldown = false;
    state.isDragging = false;
  }

  function fireShell() {
    state.phase = "shell-flight";
    state.inCooldown = true;
    state.shellsFired += 1;
    updateHud();
    k.play("fire");

    const shell = k.add([
      k.circle(SHELL_RADIUS),
      k.pos(cannonPos),
      k.color(34, 34, 34),
      k.outline(2, k.WHITE),
      "shell",
      "level-object",
      {
        vx: state.aim.vx,
        vy: state.aim.vy,
        touchedGround: false,
        resolved: false,
      },
    ]);

    shell.onUpdate(() => {
      if (k.paused || shell.resolved) {
        return;
      }

      const dt = k.dt();
      shell.vy += GRAVITY * dt;
      shell.vx += state.currentLevel.wind * dt;
      shell.pos.x += shell.vx * dt;
      shell.pos.y += shell.vy * dt;

      if (shell.pos.y > DIRECT_HIT_GROUND_Y) {
        shell.touchedGround = true;
      }

      for (const target of activeTargets) {
        if (target.destroyed) {
          continue;
        }

        if (distance(shell.pos, target.center) <= TARGET_RADIUS + SHELL_RADIUS) {
          handleShellExpended(shell, target);
          return;
        }
      }

      if (shell.pos.x < 0 || shell.pos.x > WIDTH || shell.pos.y > GROUND_Y) {
        handleShellExpended(shell, null);
      }
    });
  }

  function handleShellExpended(shell, hitTarget) {
    if (shell.resolved) {
      return;
    }

    shell.resolved = true;

    if (hitTarget) {
      hitTarget.destroyed = true;
      state.targetsDestroyed += 1;

      if (!shell.touchedGround) {
        state.directHits += 1;
      }

      k.play("hit");
      k.destroy(hitTarget.obj);
    } else {
      k.play("miss");
      addCrater(shell.pos.x);
    }

    k.destroy(shell);

    if (allTargetsDestroyed()) {
      state.inCooldown = false;
      completeLevel();
      return;
    }

    if (state.shellsFired >= state.currentLevel.shellBudget) {
      state.inCooldown = false;
      failLevel();
      return;
    }

    k.wait(COOLDOWN_MS / 1000, () => {
      if (k.paused || state.phase === "final") {
        return;
      }

      state.inCooldown = false;
      state.phase = "aim";
      updateHud();
    });
  }

  function completeLevel() {
    const levelScore = scoreCurrentLevel({ levelComplete: true, failedLevel: false });
    state.totalScore += levelScore;
    state.phase = "level-complete";
    updateHud();
    k.play("fanfare");

    if (state.levelIndex >= LEVELS.length - 1) {
      showFinalSummary("Campaign cleared", levelScore);
      return;
    }

    addOverlayCard([
      { text: "Level complete", size: 32, y: 146 },
      { text: `Score this level: ${levelScore}`, size: 20, y: 198 },
      { text: `Total score: ${Math.max(0, state.totalScore)}`, size: 20, y: 228 },
    ], {
      label: "Continue",
      tag: "continue-level",
      y: 292,
    });
  }

  function failLevel() {
    const levelScore = scoreCurrentLevel({ levelComplete: false, failedLevel: true });
    state.totalScore += levelScore;
    state.phase = "level-fail";
    updateHud();
    showFinalSummary("Level failed", levelScore);
  }

  function showFinalSummary(title, lastLevelScore) {
    state.phase = "final";
    clearPreview();
    const finalScore = Math.max(0, state.totalScore);

    addOverlayCard([
      { text: title, size: 32, y: 134 },
      { text: `Last level: ${lastLevelScore}`, size: 20, y: 190 },
      { text: `Final score: ${finalScore}`, size: 26, y: 226 },
      { text: "The scoreboard will update outside the canvas.", size: 16, y: 262 },
    ], {
      label: "Play again",
      tag: "play-again",
      y: 318,
    });

    endRoundOnce(finalScore);
  }

  function endRoundOnce(score) {
    if (state.hasEnded) {
      return;
    }

    state.hasEnded = true;
    ctx.onRoundEnd({ score });
  }

  function scoreCurrentLevel({ levelComplete, failedLevel }) {
    const shellsRemaining = Math.max(0, state.currentLevel.shellBudget - state.shellsFired);
    const levelScore = (state.targetsDestroyed * 200)
      + (shellsRemaining * 150)
      + (state.directHits * 100)
      + (levelComplete ? 500 : 0)
      - (failedLevel ? 200 : 0);

    return Math.max(0, levelScore);
  }

  function updateAimFromPointer(pointer) {
    const dx = pointer.x - cannonPos.x;
    const dy = pointer.y - cannonPos.y;
    const rawMagnitude = Math.sqrt((dx * dx) + (dy * dy));
    const dragMagnitude = Math.min(rawMagnitude, MAX_DRAG);
    const angleRad = clamp(Math.atan2(-dy, dx), degToRad(MIN_ANGLE), degToRad(MAX_ANGLE));
    const powerMagnitude = clamp(dragMagnitude, MIN_DRAG, MAX_DRAG);
    const power = (powerMagnitude / MAX_DRAG) * MAX_POWER;

    state.aim.angleDeg = radToDeg(angleRad);
    state.aim.power = power;
    state.aim.dragMagnitude = dragMagnitude;
    state.aim.vx = Math.cos(angleRad) * power;
    state.aim.vy = -Math.sin(angleRad) * power;
  }

  function drawPreview() {
    if (k.paused) {
      return;
    }

    clearPreview();

    for (const point of previewPoints(cannonPos.x, cannonPos.y, state.aim.vx, state.aim.vy, state.currentLevel.wind)) {
      previewDots.push(k.add([
        k.circle(2),
        k.pos(point),
        k.color(255, 255, 255),
        k.opacity(0.4),
        "preview-dot",
      ]));
    }
  }

  function previewPoints(originX, originY, vx, vy, wind) {
    const points = [];
    let x = originX;
    let y = originY;
    let px = vx;
    let py = vy;

    for (let i = 0; i < PREVIEW_TICKS; i += 1) {
      py += GRAVITY * PREVIEW_TICK_DT;
      px += wind * PREVIEW_TICK_DT;
      x += px * PREVIEW_TICK_DT;
      y += py * PREVIEW_TICK_DT;

      if (y > GROUND_Y || x < 0 || x > WIDTH) {
        break;
      }

      points.push(k.vec2(x, y));
    }

    return points;
  }

  function updateHud() {
    const level = state.currentLevel;
    const levelNumber = state.levelIndex + 1;
    const shellsRemaining = Math.max(0, level.shellBudget - state.shellsFired);
    const windPrefix = level.wind > 0 ? "+" : "";

    windLabel.text = `Wind: ${windPrefix}${level.wind}`;
    levelLabel.text = `Level ${levelNumber} — ${level.name}`;
    shellsLabel.text = `Shells: ${shellsRemaining}`;
    bestLabel.text = `Best: ${state.bestScore}`;
    aimLabel.text = `Angle: ${Math.round(state.aim.angleDeg)}° · Power: ${Math.round((state.aim.power / MAX_POWER) * 100)}%`;
  }

  function updateBarrel() {
    barrel.angle = -state.aim.angleDeg;
  }

  function addCrater(x) {
    k.add([
      k.circle(11),
      k.pos(clamp(x, 12, WIDTH - 12), GROUND_Y + 3),
      k.scale(1.6, 0.35),
      k.color(26, 20, 14),
      k.opacity(0.75),
      "level-object",
    ]);
  }

  function addOverlayCard(lines, button = null) {
    k.add([
      k.rect(WIDTH, HEIGHT),
      k.pos(0, 0),
      k.color(0, 0, 0),
      k.opacity(0.48),
      k.fixed(),
      "ui-card",
    ]);

    k.add([
      k.rect(480, 250, { radius: 8 }),
      k.pos(WIDTH / 2, HEIGHT / 2),
      k.anchor("center"),
      k.color(20, 29, 38),
      k.outline(2, k.WHITE),
      k.fixed(),
      "ui-card",
    ]);

    for (const line of lines) {
      k.add([
        k.text(line.text, { size: line.size }),
        k.pos(WIDTH / 2, line.y),
        k.anchor("center"),
        k.color(255, 255, 255),
        k.fixed(),
        "ui-card",
      ]);
    }

    if (!button) {
      return;
    }

    const buttonObj = k.add([
      k.rect(180, 48, { radius: 6 }),
      k.pos(WIDTH / 2, button.y),
      k.anchor("center"),
      k.area(),
      k.color(56, 191, 160),
      k.fixed(),
      button.tag,
      "ui-card",
    ]);

    buttonObj.add([
      k.text(button.label, { size: 21 }),
      k.anchor("center"),
      k.color(0, 0, 0),
      k.fixed(),
    ]);
  }

  function clearCards() {
    k.destroyAll("ui-card");
  }

  function clearLevelObjects() {
    k.destroyAll("level-object");
    activeTargets.length = 0;
    clearPreview();
  }

  function clearPreview() {
    while (previewDots.length > 0) {
      const dot = previewDots.pop();
      if (dot) {
        k.destroy(dot);
      }
    }

    k.destroyAll("preview-dot");
  }

  function allTargetsDestroyed() {
    return activeTargets.every((target) => target.destroyed);
  }

  function isInCannonArea(point) {
    return point.x >= 20 && point.x <= 150 && point.y >= 340 && point.y <= 410;
  }

  function distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt((dx * dx) + (dy * dy));
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function degToRad(degrees) {
    return degrees * (Math.PI / 180);
  }

  function radToDeg(radians) {
    return radians * (180 / Math.PI);
  }
}
