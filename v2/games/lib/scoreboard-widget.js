import { getScores, getTopByGame } from "./scoreboard.js";
import { getCurrentPlayer, PLAYERS } from "./player.js";

const STYLE_ID = "scoreboard-widget-styles";
// Game-id validation is the server's job (api/actions.js CANONICAL_GAME_IDS).
// The widget renders the natural "no scores yet" state for any unknown id,
// which means we don't have to keep this file's list in sync as new games ship.
const VIEWS = new Set(["compact", "full"]);
const numberFormatter = new Intl.NumberFormat("en-AU");
const mountedContainers = new WeakMap();

export function mountScoreboard(container, options = {}) {
  if (!container || typeof container.replaceChildren !== "function") {
    console.error("[scoreboard-widget] A valid container element is required");
    return createNoopHandle();
  }

  injectStyles();

  const state = {
    container,
    gameId: options.gameId,
    view: VIEWS.has(options.view) ? options.view : "compact",
    highlightId: normaliseHighlightId(options.highlightId ?? getCurrentPlayer()?.id),
    title: options.title || "Family scoreboard",
    mounted: true,
    refreshPromise: null,
  };
  mountedContainers.set(container, state);

  if (!state.gameId) {
    console.error("[scoreboard-widget] gameId is required");
    renderEmpty(state);
    return createHandle(state);
  }

  renderLoading(state);
  loadScores(state);

  return createHandle(state);
}

function createHandle(state) {
  return {
    refresh: () => refresh(state),
    unmount: () => unmount(state),
  };
}

function createNoopHandle() {
  return {
    refresh: () => Promise.resolve(),
    unmount: () => {},
  };
}

function normaliseHighlightId(playerId) {
  return PLAYERS.some((player) => player.id === playerId) ? playerId : null;
}

function loadScores(state) {
  if (state.view === "compact") {
    getCompactData(state.gameId).then((data) => renderFromData(state, data.scores, data.topRows));
    return;
  }

  getScores().then((scores) => renderFromData(state, scores));
}

async function getCompactData(gameId) {
  const scores = await getScores();
  const topRows = await getTopByGame(gameId);
  return { scores, topRows };
}

function refresh(state) {
  if (!state.mounted) {
    return Promise.resolve();
  }

  if (state.refreshPromise) {
    return state.refreshPromise;
  }

  state.refreshPromise = getScores({ force: true })
    .then((scores) => {
      renderFromData(state, scores);
    })
    .finally(() => {
      state.refreshPromise = null;
    });

  return state.refreshPromise;
}

function unmount(state) {
  if (!state.mounted || mountedContainers.get(state.container) !== state) {
    state.mounted = false;
    return;
  }

  state.mounted = false;
  state.refreshPromise = null;
  mountedContainers.delete(state.container);
  state.container.replaceChildren();
}

function renderFromData(state, scores, topRows) {
  if (!state.mounted || mountedContainers.get(state.container) !== state) {
    return;
  }

  const element =
    state.view === "full"
      ? renderFull(scores, state.gameId, state.highlightId, state.title)
      : renderCompact(scores, state.gameId, state.highlightId, state.title, topRows);

  state.container.replaceChildren(element);
}

function renderLoading(state) {
  const loading = document.createElement("div");
  loading.className = "scoreboard-loading";
  loading.textContent = "Loading...";
  state.container.replaceChildren(loading);
}

function renderEmpty(state) {
  const section = createSection(state.view, state.title);
  const empty = document.createElement("p");
  empty.className = "scoreboard-empty";
  empty.textContent = "No scores yet";
  section.append(empty);
  state.container.replaceChildren(section);
}

function renderCompact(scores, gameId, highlightId, title, topRows) {
  const section = createSection("compact", title);
  const rows = document.createElement("ol");
  rows.className = "scoreboard-rows";

  getCompactRows(scores, gameId, topRows).forEach((entry, index) => {
    const player = getPlayer(entry.playerId);
    const item = document.createElement("li");
    item.className = "scoreboard-row";

    if (index === 0) {
      item.classList.add("scoreboard-row--leader");
    }

    if (player.id === highlightId) {
      item.classList.add("scoreboard-row--mine");
    }

    const rank = document.createElement("span");
    rank.className = "scoreboard-rank";
    rank.textContent = String(index + 1);

    const emoji = document.createElement("span");
    emoji.className = "scoreboard-emoji";
    emoji.setAttribute("aria-hidden", "true");
    emoji.textContent = player.emoji;

    const name = document.createElement("span");
    name.className = "scoreboard-name";
    name.textContent = player.displayName;

    const score = document.createElement("span");
    score.className = "scoreboard-score";
    score.textContent = formatScore(entry.personalBest);

    item.append(rank, emoji, name, score);
    rows.append(item);
  });

  section.append(rows);
  return section;
}

function renderFull(scores, gameId, highlightId, title) {
  const section = createSection("full", title);
  const players = document.createElement("div");
  players.className = "scoreboard-players";

  for (const player of PLAYERS) {
    const article = document.createElement("article");
    article.className = "scoreboard-player";

    if (player.id === highlightId) {
      article.classList.add("scoreboard-player--mine");
    }

    const header = document.createElement("header");
    header.className = "scoreboard-player-head";

    const emoji = document.createElement("span");
    emoji.className = "scoreboard-emoji";
    emoji.setAttribute("aria-hidden", "true");
    emoji.textContent = player.emoji;

    const name = document.createElement("span");
    name.className = "scoreboard-name";
    name.textContent = player.displayName;

    const best = document.createElement("span");
    best.className = "scoreboard-best";
    best.textContent = `Best: ${formatScore(getPersonalBest(scores, gameId, player.id))}`;

    header.append(emoji, name, best);
    article.append(header);

    const runs = getTopRuns(scores, gameId, player.id);
    if (runs.length === 0) {
      const empty = document.createElement("p");
      empty.className = "scoreboard-empty";
      empty.textContent = "No runs yet";
      article.append(empty);
    } else {
      const list = document.createElement("ol");
      list.className = "scoreboard-runs";

      for (const run of runs) {
        const item = document.createElement("li");
        item.className = "scoreboard-run";

        const score = document.createElement("span");
        score.className = "scoreboard-run-score";
        score.textContent = formatScore(run.score);

        const timestamp = document.createElement("span");
        timestamp.className = "scoreboard-run-ts";
        timestamp.textContent = formatRelativeTime(Date.now() - run.ts);

        item.append(score, timestamp);
        list.append(item);
      }

      article.append(list);
    }

    players.append(article);
  }

  section.append(players);
  return section;
}

function createSection(view, titleText) {
  const section = document.createElement("section");
  section.className = `scoreboard scoreboard-${view}`;
  section.setAttribute("role", "region");
  section.setAttribute("aria-label", "Family scoreboard");

  const title = document.createElement("h3");
  title.className = "scoreboard-title";
  title.textContent = titleText;
  section.append(title);

  return section;
}

function getCompactRows(scores, gameId, topRows) {
  const byPlayerId = new Map((topRows || []).map((row) => [row.playerId, row.personalBest]));

  return PLAYERS.map((player, index) => ({
    playerId: player.id,
    playerIndex: index,
    personalBest: normaliseScore(byPlayerId.get(player.id) ?? getPersonalBest(scores, gameId, player.id)),
  })).sort((a, b) => b.personalBest - a.personalBest || a.playerIndex - b.playerIndex);
}

function getPlayer(playerId) {
  return PLAYERS.find((player) => player.id === playerId) || PLAYERS[0];
}

function getPersonalBest(scores, gameId, playerId) {
  return normaliseScore(scores?.scores?.[gameId]?.[playerId]?.personalBest);
}

function getTopRuns(scores, gameId, playerId) {
  const history = scores?.scores?.[gameId]?.[playerId]?.history;

  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .map((entry) => ({
      score: Number(entry?.score),
      ts: Number(entry?.ts),
    }))
    .filter((entry) => Number.isFinite(entry.score) && Number.isFinite(entry.ts))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function normaliseScore(score) {
  const numericScore = Number(score);
  return Number.isFinite(numericScore) && numericScore > 0 ? numericScore : 0;
}

function formatScore(score) {
  return numberFormatter.format(normaliseScore(score));
}

function formatRelativeTime(ms) {
  if (!Number.isFinite(ms) || ms < 0) {
    return "long ago";
  }

  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return "just now";
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hr ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days} days ago`;
  }

  return "long ago";
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
    .scoreboard-loading,
    .scoreboard {
      box-sizing: border-box;
      width: 100%;
      max-width: 800px;
      color: var(--ink, #1a1a2e);
      background: var(--sand, #faf6ec);
      border: 1px solid var(--line-soft, #ebe3d0);
      border-radius: var(--r-3, 14px);
      padding: var(--s-5, 1.5rem);
    }

    .scoreboard *,
    .scoreboard-loading * {
      box-sizing: border-box;
    }

    .scoreboard-title {
      margin: 0 0 var(--s-4, 1rem);
      color: var(--navy, #1f3a5f);
      font-family: var(--font-display, Georgia, "Times New Roman", serif);
      font-size: 1.4rem;
      font-weight: 500;
      line-height: 1.15;
      letter-spacing: 0;
    }

    .scoreboard-rows,
    .scoreboard-runs {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .scoreboard-rows {
      display: grid;
      gap: var(--s-3, 0.75rem);
    }

    .scoreboard-row {
      display: grid;
      grid-template-columns: 2rem 2rem minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--s-3, 0.75rem);
      min-height: 3.25rem;
      padding: var(--s-3, 0.75rem) var(--s-4, 1rem);
      background: var(--white, #ffffff);
      border: 1px solid var(--line-soft, #ebe3d0);
      border-radius: var(--r-2, 8px);
    }

    .scoreboard-row--leader {
      border-color: rgba(170, 68, 0, 0.42);
      box-shadow: inset 4px 0 0 var(--rust, #7a3a1f);
    }

    .scoreboard-row--mine,
    .scoreboard-player--mine {
      background: var(--sand-soft, #f2ecdb);
    }

    .scoreboard-rank {
      color: var(--rust, #7a3a1f);
      font-weight: 700;
      text-align: center;
    }

    .scoreboard-emoji {
      font-size: 1.5rem;
      line-height: 1;
      text-align: center;
    }

    .scoreboard-name {
      min-width: 0;
      color: var(--ink, #1a1a2e);
      font-weight: 700;
      overflow-wrap: anywhere;
    }

    .scoreboard-score,
    .scoreboard-best,
    .scoreboard-run-score {
      color: var(--ink, #1a1a2e);
      font-family: var(--font-mono, ui-monospace, "SF Mono", Menlo, monospace);
      font-feature-settings: "tnum";
      white-space: nowrap;
    }

    .scoreboard-score,
    .scoreboard-run-score {
      font-weight: 700;
    }

    .scoreboard-players {
      display: grid;
      gap: var(--s-4, 1rem);
    }

    .scoreboard-player {
      padding: var(--s-4, 1rem);
      background: var(--white, #ffffff);
      border: 1px solid var(--line-soft, #ebe3d0);
      border-radius: var(--r-2, 8px);
    }

    .scoreboard-player--mine {
      border-color: rgba(170, 68, 0, 0.34);
      box-shadow: inset 4px 0 0 var(--rust, #7a3a1f);
    }

    .scoreboard-player-head {
      display: grid;
      grid-template-columns: 2rem minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--s-3, 0.75rem);
    }

    .scoreboard-runs {
      display: grid;
      gap: var(--s-2, 0.5rem);
      margin-top: var(--s-3, 0.75rem);
    }

    .scoreboard-run {
      display: flex;
      justify-content: space-between;
      gap: var(--s-4, 1rem);
      padding-top: var(--s-2, 0.5rem);
      border-top: 1px solid var(--line-soft, #ebe3d0);
    }

    .scoreboard-run-ts,
    .scoreboard-empty,
    .scoreboard-loading {
      color: var(--ink-soft, #4a4a4a);
    }

    .scoreboard-empty {
      margin: var(--s-3, 0.75rem) 0 0;
    }

    @media (max-width: 520px) {
      .scoreboard-loading,
      .scoreboard {
        padding: var(--s-4, 1rem);
      }

      .scoreboard-row {
        grid-template-columns: 1.5rem 1.75rem minmax(0, 1fr) auto;
        gap: var(--s-2, 0.5rem);
        padding: var(--s-3, 0.75rem);
      }

      .scoreboard-player-head {
        grid-template-columns: 2rem minmax(0, 1fr);
      }

      .scoreboard-best {
        grid-column: 2;
      }
    }
  `;

  document.head.append(style);
}
