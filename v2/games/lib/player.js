// Keep these in sync with api/actions.js CANONICAL_PLAYER_IDS.
// If you add an ID here, add it there too.
// Canonical IDs: twin-a, twin-b, matti, gilo, vonnies, julz.
// `adult` retired 2026-05-23 — replaced by named grown-up identities.
export const PLAYERS = [
  { id: "twin-a", displayName: "Griff", emoji: "🦓" },
  { id: "twin-b", displayName: "Connor", emoji: "🐘" },
  { id: "matti", displayName: "Matti", emoji: "🦁" },
  { id: "gilo", displayName: "Gilo", emoji: "🦘" },
  { id: "vonnies", displayName: "Vonnies", emoji: "🐨" },
  { id: "julz", displayName: "Julz", emoji: "🦒" },
];

export const CONFIRM_WINDOW_MS = 10 * 60 * 1000;
/**
 * Browser storage slot for the current arcade player.
 * Callers should use this module instead of reading tripArcade.player directly.
 */
export const STORAGE_KEY = "tripArcade.player";
export const SCHEMA_VERSION = 1;

const STYLE_ID = "player-picker-styles";
const DEBOUNCE_MS = 250;
let storageWarningShown = false;

function findPlayer(id) {
  return PLAYERS.find((player) => player.id === id) ?? null;
}

function warnStorageUnavailable() {
  if (storageWarningShown) {
    return;
  }

  storageWarningShown = true;
  console.warn("[player] localStorage unavailable; identity is per-session only");
}

function readStoredPlayerRecord() {
  let rawValue;

  try {
    rawValue = globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    warnStorageUnavailable();
    return null;
  }

  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue);
  } catch {
    clearStoredPlayer();
    return null;
  }
}

function clearStoredPlayer() {
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    warnStorageUnavailable();
  }
}

function getValidatedStoredPlayer() {
  const record = readStoredPlayerRecord();

  if (!record || record.version !== SCHEMA_VERSION) {
    if (record) {
      clearStoredPlayer();
    }
    return null;
  }

  const player = findPlayer(record.id);
  if (!player || !Number.isFinite(record.lastConfirmedAt)) {
    clearStoredPlayer();
    return null;
  }

  return { player, lastConfirmedAt: record.lastConfirmedAt };
}

export function getCurrentPlayer() {
  return getValidatedStoredPlayer()?.player ?? null;
}

export function setCurrentPlayer(id) {
  const player = findPlayer(id);

  if (!player) {
    throw new Error(`[player] Unknown player id: ${id}`);
  }

  const record = {
    id: player.id,
    displayName: player.displayName,
    lastConfirmedAt: Date.now(),
    version: SCHEMA_VERSION,
  };

  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    warnStorageUnavailable();
  }

  return player;
}

export function isConfirmationFresh() {
  const stored = getValidatedStoredPlayer();

  if (!stored) {
    return false;
  }

  return Date.now() - stored.lastConfirmedAt <= CONFIRM_WINDOW_MS;
}

export async function ensurePlayerForGame(container) {
  const stored = getValidatedStoredPlayer();

  if (!stored) {
    return showPicker(container);
  }

  if (Date.now() - stored.lastConfirmedAt <= CONFIRM_WINDOW_MS) {
    return stored.player;
  }

  return showConfirmStale(container, stored.player);
}

export async function showPicker(container) {
  assertContainer(container);
  injectStyles();
  container.replaceChildren(buildPickerShell());

  const picker = container.querySelector(".player-picker");
  focusFirstButton(picker);

  return new Promise((resolve) => {
    const lastClickById = new Map();

    picker.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-player-id]");
      if (!button || !picker.contains(button)) {
        return;
      }

      const id = button.dataset.playerId;
      const now = Date.now();
      const lastClick = lastClickById.get(id) ?? 0;
      if (now - lastClick < DEBOUNCE_MS) {
        return;
      }

      lastClickById.set(id, now);
      const player = setCurrentPlayer(id);
      container.replaceChildren();
      resolve(player);
    });
  });
}

function showConfirmStale(container, player) {
  assertContainer(container);
  injectStyles();
  container.replaceChildren(buildConfirmShell(player));

  const confirm = container.querySelector(".player-confirm");
  focusFirstButton(confirm);

  return new Promise((resolve) => {
    let lastClickAt = 0;

    confirm.addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button || !confirm.contains(button)) {
        return;
      }

      const now = Date.now();
      if (now - lastClickAt < DEBOUNCE_MS) {
        return;
      }

      lastClickAt = now;

      if (button.dataset.action === "confirm") {
        const confirmedPlayer = setCurrentPlayer(player.id);
        container.replaceChildren();
        resolve(confirmedPlayer);
        return;
      }

      if (button.dataset.action === "change") {
        resolve(await showPicker(container));
      }
    });
  });
}

function buildPickerShell() {
  const shell = document.createElement("div");
  shell.className = "player-picker";
  shell.setAttribute("role", "dialog");
  shell.setAttribute("aria-labelledby", "player-picker-title");

  const title = document.createElement("h2");
  title.id = "player-picker-title";
  title.textContent = "Who's playing?";
  shell.append(title);

  const list = document.createElement("ul");
  list.className = "player-grid";

  for (const player of PLAYERS) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.className = "player-tile";
    button.type = "button";
    button.dataset.playerId = player.id;

    const emoji = document.createElement("span");
    emoji.className = "player-emoji";
    emoji.setAttribute("aria-hidden", "true");
    emoji.textContent = player.emoji;

    const name = document.createElement("span");
    name.className = "player-name";
    name.textContent = player.displayName;

    button.append(emoji, name);
    item.append(button);
    list.append(item);
  }

  shell.append(list);
  return shell;
}

function buildConfirmShell(player) {
  const shell = document.createElement("div");
  shell.className = "player-confirm";
  shell.setAttribute("role", "dialog");
  shell.setAttribute("aria-labelledby", "player-confirm-title");

  const title = document.createElement("h2");
  title.id = "player-confirm-title";
  title.append("Still you, ");

  const playerName = document.createElement("span");
  playerName.className = "player-name";
  playerName.textContent = player.displayName;
  title.append(playerName, "?");
  shell.append(title);

  const subtitle = document.createElement("p");
  subtitle.className = "player-confirm-sub";
  subtitle.textContent = "It's been more than 10 minutes since you last confirmed.";
  shell.append(subtitle);

  const actions = document.createElement("div");
  actions.className = "player-confirm-actions";
  actions.append(
    buildActionTile("confirm", "✅", "Yes, play", "player-tile-confirm"),
    buildActionTile("change", "🔁", "No, change player", "player-tile-change"),
  );
  shell.append(actions);

  return shell;
}

function buildActionTile(action, emojiText, label, extraClass) {
  const button = document.createElement("button");
  button.className = `player-tile ${extraClass}`;
  button.type = "button";
  button.dataset.action = action;

  const emoji = document.createElement("span");
  emoji.className = "player-emoji";
  emoji.setAttribute("aria-hidden", "true");
  emoji.textContent = emojiText;

  const name = document.createElement("span");
  name.className = "player-name";
  name.textContent = label;

  button.append(emoji, name);
  return button;
}

function focusFirstButton(container) {
  container?.querySelector("button")?.focus();
}

function assertContainer(container) {
  if (!container || typeof container.replaceChildren !== "function") {
    throw new TypeError("[player] A valid container element is required");
  }
}

function injectStyles() {
  if (typeof document === "undefined") {
    return;
  }

  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .player-picker,
    .player-confirm {
      box-sizing: border-box;
      width: 100%;
      color: #152238;
      background: #f3dfc1;
      border: 1px solid rgba(122, 70, 38, 0.24);
      border-radius: 8px;
      padding: 18px;
    }

    .player-picker *,
    .player-confirm * {
      box-sizing: border-box;
    }

    .player-picker h2,
    .player-confirm h2 {
      margin: 0;
      color: #152238;
      font-size: 24px;
      line-height: 1.15;
      font-weight: 700;
      letter-spacing: 0;
    }

    .player-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin: 16px 0 0;
      padding: 0;
      list-style: none;
    }

    .player-grid li {
      margin: 0;
      padding: 0;
    }

    .player-tile {
      width: 100%;
      min-width: 88px;
      min-height: 88px;
      display: grid;
      justify-items: center;
      align-content: center;
      gap: 8px;
      padding: 12px;
      color: #152238;
      background: #fff7e8;
      border: 2px solid rgba(157, 85, 45, 0.32);
      border-radius: 8px;
      box-shadow: 0 10px 18px rgba(21, 34, 56, 0.12);
      cursor: pointer;
      font: inherit;
      text-align: center;
      touch-action: manipulation;
      transition:
        transform 140ms ease,
        border-color 140ms ease,
        box-shadow 140ms ease;
    }

    .player-tile:hover {
      transform: translateY(-2px);
      border-color: #9d552d;
      box-shadow: 0 14px 24px rgba(21, 34, 56, 0.16);
    }

    .player-tile:active {
      transform: translateY(1px);
      box-shadow: 0 6px 14px rgba(21, 34, 56, 0.14);
    }

    .player-tile:focus-visible {
      outline: 3px solid #bf5f35;
      outline-offset: 3px;
    }

    .player-emoji {
      font-size: 40px;
      line-height: 1;
    }

    .player-name {
      font-size: 18px;
      line-height: 1.2;
      font-weight: 400;
    }

    .player-confirm-sub {
      margin: 8px 0 0;
      color: rgba(21, 34, 56, 0.78);
      font-size: 16px;
      line-height: 1.4;
    }

    .player-confirm-actions {
      display: grid;
      grid-template-columns: 1fr;
      gap: 12px;
      margin-top: 16px;
    }

    .player-tile-confirm {
      background: #f8f1dd;
      border-color: rgba(56, 121, 94, 0.48);
    }

    .player-tile-change {
      background: #fff7e8;
    }

    @media (min-width: 480px) {
      .player-confirm-actions {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (min-width: 720px) {
      .player-grid {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }
    }
  `;

  document.head.append(style);
}
