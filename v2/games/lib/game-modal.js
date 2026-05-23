import { mount } from "./kaplay-loader.js";
import { ensurePlayerForGame, showPicker } from "./player.js";
import { submitScore } from "./scoreboard.js";
import { mountScoreboard } from "./scoreboard-widget.js";

const STYLE_ID = "game-modal-styles";
const MUTE_KEY = "tripArcade.muted";
const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 450;
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export async function openGameModal({ gameId, title, gameModule } = {}) {
  if (!gameId) {
    throw new Error("[game-modal] gameId is required");
  }

  injectStyles();

  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const state = {
    gameId,
    gameModule,
    player: null,
    k: null,
    canvas: null,
    scoreboardHandle: null,
    modal: null,
    body: null,
    titleEl: null,
    playerEmojiEl: null,
    playerNameEl: null,
    soundButton: null,
    roundInProgress: false,
    closing: false,
    resolved: false,
    muted: readMuted(),
    focusables: [],
    opener,
  };

  return new Promise((resolve, reject) => {
    state.resolve = resolve;
    state.reject = reject;

    const modal = buildModal(title || gameId);
    state.modal = modal;
    state.body = modal.querySelector(".game-modal-body");
    state.titleEl = modal.querySelector(".game-modal-title");
    state.playerEmojiEl = modal.querySelector(".game-modal-player-emoji");
    state.playerNameEl = modal.querySelector(".game-modal-player-name");
    state.soundButton = modal.querySelector(".game-modal-sound");

    document.body.append(modal);
    document.body.classList.add("game-modal-open");
    bindEvents(state, opener);
    updateSoundButton(state);
    refreshFocusables(state);
    focusFirst(state);

    initialise(state, title).catch((err) => {
      reject(new Error(`[game-modal] Could not open ${gameId}: ${err.message}`));
      closeModal(state, opener, { force: true });
    });
  });
}

async function initialise(state, title) {
  const module = await loadGameModule(state);
  state.gameModule = module;

  const resolvedTitle = title || module.meta?.title || state.gameId;
  state.titleEl.textContent = resolvedTitle;

  state.player = await ensurePlayerForGame(state.body);
  if (state.closing) {
    return;
  }

  updatePlayerBadge(state);
  renderSplash(state);
}

function buildModal(title) {
  const modal = document.createElement("div");
  modal.className = "game-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "game-modal-title");

  const backdrop = document.createElement("div");
  backdrop.className = "game-modal-backdrop";
  backdrop.dataset.close = "";

  const content = document.createElement("div");
  content.className = "game-modal-content";

  const header = document.createElement("header");
  header.className = "game-modal-header";

  const titleEl = document.createElement("h2");
  titleEl.id = "game-modal-title";
  titleEl.className = "game-modal-title";
  titleEl.textContent = title;

  const controls = document.createElement("div");
  controls.className = "game-modal-controls";

  const player = document.createElement("div");
  player.className = "game-modal-player";
  player.setAttribute("role", "status");

  const playerLabel = document.createElement("span");
  playerLabel.className = "game-modal-player-label";
  playerLabel.textContent = "Playing as";

  const playerEmoji = document.createElement("span");
  playerEmoji.className = "game-modal-player-emoji";
  playerEmoji.setAttribute("aria-hidden", "true");
  playerEmoji.textContent = "";

  const playerName = document.createElement("span");
  playerName.className = "game-modal-player-name";
  playerName.textContent = "";

  const changeButton = document.createElement("button");
  changeButton.className = "game-modal-player-change";
  changeButton.type = "button";
  changeButton.setAttribute("aria-label", "Change player");
  changeButton.textContent = "change";

  const soundButton = document.createElement("button");
  soundButton.className = "game-modal-sound";
  soundButton.type = "button";
  soundButton.setAttribute("aria-label", "Toggle sound");
  soundButton.setAttribute("aria-pressed", "false");
  soundButton.textContent = "🔊";

  const closeButton = document.createElement("button");
  closeButton.className = "game-modal-close";
  closeButton.type = "button";
  closeButton.dataset.close = "";
  closeButton.setAttribute("aria-label", "Close");
  closeButton.textContent = "×";

  const body = document.createElement("div");
  body.className = "game-modal-body";

  player.append(playerLabel, playerEmoji, playerName, changeButton);
  controls.append(player, soundButton, closeButton);
  header.append(titleEl, controls);
  content.append(header, body);
  modal.append(backdrop, content);

  return modal;
}

function bindEvents(state, opener) {
  state.onClick = async (event) => {
    const target = event.target;
    if (target.closest("[data-close]")) {
      attemptClose(state, opener);
      return;
    }

    if (target.closest(".game-modal-sound")) {
      toggleSound(state);
      return;
    }

    if (target.closest(".game-modal-player-change")) {
      if (state.roundInProgress) {
        renderQuitConfirm(state, opener);
        return;
      }

      state.player = await showPicker(state.body);
      updatePlayerBadge(state);
      renderSplash(state);
    }
  };

  state.onKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      attemptClose(state, opener);
      return;
    }

    if (event.key === "Tab") {
      trapFocus(event, state);
    }
  };

  state.modal.addEventListener("click", state.onClick);
  document.addEventListener("keydown", state.onKeyDown);
}

function renderSplash(state) {
  state.scoreboardHandle?.unmount();
  state.scoreboardHandle = null;

  const splash = document.createElement("button");
  splash.className = "game-modal-splash";
  splash.type = "button";
  splash.textContent = "Tap to play";

  const hint = document.createElement("span");
  hint.className = "game-modal-splash-hint";
  hint.textContent = "Sound unlocks on this tap";
  splash.append(hint);

  splash.addEventListener("click", () => {
    startFromSplashTap(state).catch((err) => failModal(state, err));
  }, { once: true });

  state.body.replaceChildren(splash);
  refreshFocusables(state);
  splash.focus();
}

async function startFromSplashTap(state) {
  const currentModule = state.gameModule;
  const meta = currentModule?.meta || {};

  const canvas = document.createElement("canvas");
  canvas.className = "game-modal-canvas";
  canvas.width = meta.width || DEFAULT_WIDTH;
  canvas.height = meta.height || DEFAULT_HEIGHT;
  canvas.tabIndex = -1;
  state.body.replaceChildren(canvas);
  state.canvas = canvas;
  refreshFocusables(state);

  const k = await mount(canvas);
  if (state.closing) {
    k.quit();
    canvas.remove();
    return;
  }

  state.k = k;

  const audioCtx = k.audioCtx();
  if (audioCtx && typeof audioCtx.resume === "function") {
    audioCtx.resume();
  }
  k.burp({ volume: 0 });
  applyVolume(state);

  const module = currentModule || await loadGameModule(state);
  if (state.closing) {
    return;
  }

  state.gameModule = module;

  const ctx = {
    player: state.player,
    k,
    onRoundEnd: ({ score }) => handleRoundEnd(state, score),
    onAudioUnlock: () => {
      const ctx = state.k?.audioCtx();
      if (ctx && typeof ctx.resume === "function") {
        return ctx.resume();
      }
      return undefined;
    },
  };

  const gameK = await module.startGame(canvas, ctx);
  if (state.closing) {
    gameK?.quit();
    return;
  }

  if (gameK) {
    state.k = gameK;
    applyVolume(state);
  }
  state.roundInProgress = true;
}

async function handleRoundEnd(state, score) {
  if (state.closing) {
    return;
  }

  state.roundInProgress = false;

  try {
    await submitScore({
      gameId: state.gameId,
      playerId: state.player.id,
      score,
    });
  } catch (err) {
    console.error("[game-modal] submitScore failed", err);
  }

  renderScoreboard(state);
}

function renderScoreboard(state) {
  if (state.closing) {
    return;
  }

  state.canvas?.classList.add("game-modal-canvas--covered");

  const overlay = document.createElement("div");
  overlay.className = "game-modal-scoreboard";

  const mountPoint = document.createElement("div");
  mountPoint.className = "game-modal-scoreboard-mount";

  const actions = document.createElement("div");
  actions.className = "game-modal-scoreboard-actions";

  const again = document.createElement("button");
  again.className = "game-modal-play-again";
  again.type = "button";
  again.textContent = "Play again";
  again.addEventListener("click", () => restartRound(state));

  const close = document.createElement("button");
  close.className = "game-modal-scoreboard-close";
  close.type = "button";
  close.dataset.close = "";
  close.textContent = "Close";

  actions.append(again, close);
  overlay.append(mountPoint, actions);
  state.body.append(overlay);

  state.scoreboardHandle = mountScoreboard(mountPoint, {
    gameId: state.gameId,
    view: "full",
    highlightId: state.player.id,
    title: "Family scoreboard",
  });
  state.scoreboardHandle.refresh();
  refreshFocusables(state);
  again.focus();
}

async function restartRound(state) {
  state.scoreboardHandle?.unmount();
  state.scoreboardHandle = null;
  state.k?.quit();
  state.canvas?.remove();
  state.k = null;
  state.canvas = null;
  renderSplash(state);
}

function renderQuitConfirm(state, opener) {
  state.body.querySelector(".game-modal-confirm")?.remove();

  const confirm = document.createElement("div");
  confirm.className = "game-modal-confirm";
  confirm.setAttribute("role", "alertdialog");

  const message = document.createElement("p");
  message.textContent = "Quit now? You'll lose this round's score.";

  const actions = document.createElement("div");
  actions.className = "game-modal-confirm-actions";

  const quit = document.createElement("button");
  quit.className = "game-modal-confirm-quit";
  quit.type = "button";
  quit.textContent = "Yes, quit";
  quit.addEventListener("click", () => closeModal(state, opener, { force: true }));

  const keepPlaying = document.createElement("button");
  keepPlaying.className = "game-modal-confirm-keep";
  keepPlaying.type = "button";
  keepPlaying.textContent = "No, keep playing";
  keepPlaying.addEventListener("click", () => {
    confirm.remove();
    refreshFocusables(state);
    state.canvas?.focus();
  });

  actions.append(quit, keepPlaying);
  confirm.append(message, actions);
  state.body.append(confirm);
  refreshFocusables(state);
  keepPlaying.focus();
}

function attemptClose(state, opener) {
  if (state.roundInProgress) {
    renderQuitConfirm(state, opener);
    return;
  }

  closeModal(state, opener, { force: true });
}

function closeModal(state, opener) {
  if (state.closing) {
    return;
  }

  state.closing = true;
  state.roundInProgress = false;
  document.removeEventListener("keydown", state.onKeyDown);
  state.modal?.removeEventListener("click", state.onClick);

  if (state.k) {
    state.k.quit();
  }

  if (state.canvas) {
    state.canvas.remove();
  }

  state.k = null;
  state.canvas = null;
  state.scoreboardHandle?.unmount();
  state.scoreboardHandle = null;
  state.gameModule = null;
  state.modal?.remove();
  state.modal = null;
  state.body = null;
  document.body.classList.remove("game-modal-open");

  const focusTarget = opener || state.opener;
  if (focusTarget && typeof focusTarget.focus === "function") {
    focusTarget.focus();
  }

  if (!state.resolved) {
    state.resolved = true;
    state.resolve();
  }
}

function failModal(state, err) {
  if (!state.resolved) {
    state.resolved = true;
    state.reject(new Error(`[game-modal] Could not start ${state.gameId}: ${err.message}`));
  }

  closeModal(state, null);
}

async function loadGameModule(state) {
  if (state.gameModule) {
    return state.gameModule;
  }

  return import(`/v2/games/${state.gameId}/game.js`);
}

function updatePlayerBadge(state) {
  state.playerEmojiEl.textContent = state.player?.emoji || "";
  state.playerNameEl.textContent = state.player?.displayName || "";
}

function toggleSound(state) {
  state.muted = !state.muted;
  writeMuted(state.muted);
  updateSoundButton(state);
  applyVolume(state);
}

function updateSoundButton(state) {
  state.soundButton.textContent = state.muted ? "🔇" : "🔊";
  state.soundButton.setAttribute("aria-pressed", state.muted ? "true" : "false");
}

function applyVolume(state) {
  if (state.k && typeof state.k.volume === "function") {
    state.k.volume(state.muted ? 0 : 1);
  }
}

function readMuted() {
  try {
    return globalThis.localStorage?.getItem(MUTE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeMuted(muted) {
  try {
    globalThis.localStorage?.setItem(MUTE_KEY, muted ? "true" : "false");
  } catch {
    // Storage can fail in private browsing; the button still controls this session.
  }
}

function refreshFocusables(state) {
  state.focusables = Array.from(state.modal.querySelectorAll(FOCUSABLE_SELECTOR))
    .filter((element) => element.offsetParent !== null || element === document.activeElement);
}

function focusFirst(state) {
  state.focusables[0]?.focus();
}

function trapFocus(event, state) {
  refreshFocusables(state);

  if (state.focusables.length === 0) {
    event.preventDefault();
    state.modal.focus();
    return;
  }

  const first = state.focusables[0];
  const last = state.focusables[state.focusables.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
    return;
  }

  if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    body.game-modal-open {
      overflow: hidden;
    }

    .game-modal {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: grid;
      place-items: center;
      color: #1a1a1a;
      font-family: "DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
    }

    .game-modal-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
    }

    .game-modal-content {
      position: relative;
      z-index: 1;
      width: min(900px, calc(100vw - 32px));
      max-height: calc(100vh - 32px);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: #ffffff;
      border: 1px solid #d9cfba;
      border-radius: 14px;
      box-shadow: 0 20px 60px rgba(31, 41, 55, 0.18);
    }

    .game-modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 14px 16px;
      background: #ede5d2;
      border-bottom: 1px solid #d9cfba;
      color: #1f3a5f;
    }

    .game-modal-title {
      margin: 0;
      color: #1f3a5f;
      font-family: "Fraunces", Georgia, "Times New Roman", serif;
      font-size: clamp(1.2rem, 2vw, 1.65rem);
      font-weight: 600;
      line-height: 1.1;
      letter-spacing: 0;
    }

    .game-modal-controls {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }

    .game-modal-player {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      color: #4a4a4a;
      font-size: 0.92rem;
      white-space: nowrap;
    }

    .game-modal-player-label {
      color: #7a7163;
    }

    .game-modal-player-name {
      color: #1f3a5f;
      font-weight: 700;
    }

    .game-modal-player-change,
    .game-modal-sound,
    .game-modal-close,
    .game-modal-splash,
    .game-modal-play-again,
    .game-modal-scoreboard-close,
    .game-modal-confirm-quit,
    .game-modal-confirm-keep {
      font: inherit;
      touch-action: manipulation;
      cursor: pointer;
    }

    .game-modal-player-change {
      min-height: 36px;
      padding: 6px 10px;
      border: 1px solid rgba(170, 68, 0, 0.35);
      border-radius: 8px;
      background: #faf7f2;
      color: #aa4400;
      font-weight: 700;
    }

    .game-modal-sound,
    .game-modal-close {
      width: 40px;
      height: 40px;
      display: grid;
      place-items: center;
      border: 1px solid #d9cfba;
      border-radius: 8px;
      background: #faf7f2;
      color: #1f3a5f;
      font-size: 1.2rem;
      line-height: 1;
    }

    .game-modal-close {
      font-size: 1.5rem;
    }

    .game-modal-player-change:hover,
    .game-modal-sound:hover,
    .game-modal-close:hover {
      background: #f2ecdb;
    }

    .game-modal-body {
      position: relative;
      display: grid;
      min-height: min(450px, 56.25vw);
      background: #101820;
      overflow: auto;
    }

    .game-modal-canvas {
      width: 100%;
      height: auto;
      aspect-ratio: 16 / 9;
      display: block;
      background: #000000;
      touch-action: none;
    }

    .game-modal-canvas--covered {
      opacity: 0.18;
      pointer-events: none;
    }

    .game-modal-splash {
      width: 100%;
      min-height: min(450px, 56.25vw);
      display: grid;
      align-content: center;
      justify-items: center;
      gap: 10px;
      border: 0;
      background: linear-gradient(135deg, #1f3a5f, #15294a);
      color: #ffffff;
      font-size: clamp(1.7rem, 5vw, 3rem);
      font-weight: 800;
      letter-spacing: 0;
    }

    .game-modal-splash-hint {
      color: rgba(255, 255, 255, 0.76);
      font-size: 0.95rem;
      font-weight: 500;
    }

    .game-modal-scoreboard {
      position: absolute;
      inset: 0;
      display: grid;
      grid-template-rows: minmax(0, 1fr) auto;
      gap: 12px;
      padding: 18px;
      background: rgba(250, 247, 242, 0.94);
      overflow: auto;
    }

    .game-modal-scoreboard-actions,
    .game-modal-confirm-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 10px;
    }

    .game-modal-play-again,
    .game-modal-confirm-keep {
      min-height: 44px;
      padding: 10px 16px;
      border: 1px solid #aa4400;
      border-radius: 8px;
      background: #aa4400;
      color: #ffffff;
      font-weight: 800;
    }

    .game-modal-scoreboard-close,
    .game-modal-confirm-quit {
      min-height: 44px;
      padding: 10px 16px;
      border: 1px solid #d9cfba;
      border-radius: 8px;
      background: #ffffff;
      color: #1f3a5f;
      font-weight: 800;
    }

    .game-modal-confirm {
      position: absolute;
      left: 50%;
      top: 50%;
      width: min(420px, calc(100% - 32px));
      transform: translate(-50%, -50%);
      display: grid;
      gap: 16px;
      padding: 18px;
      background: #ffffff;
      border: 1px solid #d9cfba;
      border-radius: 14px;
      box-shadow: 0 20px 60px rgba(31, 41, 55, 0.18);
      color: #1a1a1a;
      text-align: center;
    }

    .game-modal-confirm p {
      margin: 0;
      color: #1f3a5f;
      font-weight: 800;
    }

    @media (max-width: 479px) {
      .game-modal {
        place-items: stretch;
      }

      .game-modal-content {
        width: 100vw;
        max-height: 100vh;
        min-height: 100vh;
        border: 0;
        border-radius: 0;
      }

      .game-modal-header {
        align-items: flex-start;
        flex-direction: column;
      }

      .game-modal-controls {
        width: 100%;
        justify-content: space-between;
      }

      .game-modal-player {
        flex: 1;
        flex-wrap: wrap;
        white-space: normal;
      }
    }
  `;
  document.head.append(style);
}
