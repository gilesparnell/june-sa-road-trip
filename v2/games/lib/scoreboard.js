import { PLAYERS } from "./player.js";

export const API_URL = "/api/actions";
export const CACHE_TTL_MS = 30 * 1000;

const FETCH_TIMEOUT_MS = 5000;
const RETRY_BACKOFF_MS = 250;
const HISTORY_LIMIT = 10;
// Derived from PLAYERS so the client-side roster has one source of truth.
// Server-side mirror lives in api/actions.js — keep in sync there.
const CANONICAL_PLAYER_IDS = PLAYERS.map((p) => p.id);
const DEFAULT_SCORES = { version: 1, scores: {}, dailySeed: null };

let cachedScores = null;
let cachedAt = 0;

class ScoreSubmitError extends Error {
  constructor(message) {
    super(message);
    this.name = "ScoreSubmitError";
  }
}

function cloneDefaultScores() {
  return {
    version: DEFAULT_SCORES.version,
    scores: {},
    dailySeed: DEFAULT_SCORES.dailySeed,
  };
}

function normaliseScores(scores) {
  if (!scores || typeof scores !== "object" || !scores.scores || typeof scores.scores !== "object") {
    return cloneDefaultScores();
  }

  return {
    version: 1,
    scores: scores.scores,
    dailySeed: Object.prototype.hasOwnProperty.call(scores, "dailySeed") ? scores.dailySeed : null,
  };
}

function setCache(scores) {
  cachedScores = normaliseScores(scores);
  cachedAt = Date.now();
  return cachedScores;
}

function validateScoreInput({ gameId, playerId, score }) {
  if (!gameId) {
    throw new ScoreSubmitError("[scoreboard] gameId is required");
  }

  if (!playerId) {
    throw new ScoreSubmitError("[scoreboard] playerId is required");
  }

  const numericScore = Number(score);
  if (!Number.isFinite(numericScore) || numericScore < 0) {
    throw new ScoreSubmitError("[scoreboard] score must be a finite non-negative number");
  }

  return {
    gameId: String(gameId),
    playerId: String(playerId),
    score: Math.round(numericScore),
  };
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function readErrorMessage(response) {
  try {
    const payload = await response.json();
    return payload?.error || response.statusText || "score submit failed";
  } catch {
    return response.statusText || "score submit failed";
  }
}

function applyLocalScore({ gameId, playerId, score }) {
  const state = cachedScores ? normaliseScores(cachedScores) : cloneDefaultScores();

  if (!state.scores[gameId] || typeof state.scores[gameId] !== "object") {
    state.scores[gameId] = {};
  }

  if (!state.scores[gameId][playerId] || typeof state.scores[gameId][playerId] !== "object") {
    state.scores[gameId][playerId] = { personalBest: 0, history: [] };
  }

  const playerScores = state.scores[gameId][playerId];
  const existingBest = Number.isFinite(playerScores.personalBest) ? playerScores.personalBest : 0;
  const existingHistory = Array.isArray(playerScores.history) ? playerScores.history : [];
  playerScores.history = [{ score, ts: Date.now() }, ...existingHistory].slice(0, HISTORY_LIMIT);
  playerScores.personalBest = Math.max(existingBest, score);

  return setCache(state);
}

async function postScore(payload) {
  const response = await fetchWithTimeout(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "submit-score", ...payload }),
  });

  if (response.status >= 400 && response.status < 500) {
    throw new ScoreSubmitError(await readErrorMessage(response));
  }

  if (!response.ok) {
    throw new Error(`score submit failed with status ${response.status}`);
  }

  return response.json();
}

export async function submitScore(input) {
  // F7's service worker queues offline submits in IndexedDB and returns 202;
  // this local fallback still covers browsers where the worker is unavailable.
  const payload = validateScoreInput(input || {});

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await postScore(payload);
      return setCache(response.scores);
    } catch (err) {
      if (err instanceof ScoreSubmitError) {
        throw err;
      }

      if (attempt === 0) {
        await wait(RETRY_BACKOFF_MS);
        continue;
      }

      console.error("[scoreboard] submitScore failed; using local estimate", err);
      return applyLocalScore(payload);
    }
  }

  return applyLocalScore(payload);
}

export async function getScores({ force = false } = {}) {
  if (!force && cachedScores && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedScores;
  }

  try {
    const response = await fetchWithTimeout(API_URL);
    if (!response.ok) {
      throw new Error(`score fetch failed with status ${response.status}`);
    }

    const payload = await response.json();
    return setCache(payload.scores);
  } catch (err) {
    console.error("[scoreboard] getScores failed; using local cache", err);
    return cachedScores || cloneDefaultScores();
  }
}

export async function getPersonalBest(gameId, playerId) {
  const scores = await getScores();
  return scores.scores?.[gameId]?.[playerId]?.personalBest || 0;
}

export async function getTopByGame(gameId) {
  const scores = await getScores();

  return CANONICAL_PLAYER_IDS.map((playerId) => ({
    playerId,
    personalBest: scores.scores?.[gameId]?.[playerId]?.personalBest || 0,
  })).sort((a, b) => b.personalBest - a.personalBest);
}
