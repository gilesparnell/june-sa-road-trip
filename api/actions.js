const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GIST_ID = process.env.GIST_ID;
const FILE_NAME = 'actions.json';
const SCORES_FILE_NAME = 'scores.json';

// Keep these in sync with v2/games/lib/player.js PLAYERS.
// If you add an ID here, add it there too.
// `adult` retired 2026-05-23 — replaced by named grown-up identities.
const CANONICAL_PLAYER_IDS = ['twin-a', 'twin-b', 'matti', 'gilo', 'vonnies', 'julz'];

// Wave 1 game ids. Includes 'hello-world' for the Phase 0 acceptance gate.
const CANONICAL_GAME_IDS = [
  'hello-world',
  'long-tom',
  'gold-pan',
  'hairpin-drift',
  'camera-safari-bushveld',
  'camera-safari-kruger',
];

const HISTORY_LIMIT = 10;
const SCORES_SCHEMA_VERSION = 1;

const DEFAULT_ITEMS = [
  { id: 'act-car', text: 'Book car hire' },
  { id: 'act-clarens', text: 'Book night in Clarens — 20 June' },
  { id: 'act-wakkerstroom', text: 'Book night in Wakkerstroom — 21 June' },
  { id: 'act-dullstroom', text: 'Book night in Dullstroom — 22 June' },
  { id: 'act-hoedspruit', text: 'Book night in Hoedspruit — 23 June' },
  { id: 'act-jhb', text: 'Book night in JHB with family friends — 30 June' },
];

const gistHeaders = {
  Authorization: `token ${GITHUB_TOKEN}`,
  'User-Agent': 'june-sa-trip',
  Accept: 'application/vnd.github.v3+json',
  'Content-Type': 'application/json',
};

function normalise(raw) {
  // New shape: { items: [{ id, text, done, owner }] }
  if (raw && Array.isArray(raw.items)) {
    return {
      items: raw.items.map((it) => ({
        id: String(it.id),
        text: String(it.text || ''),
        done: !!it.done,
        owner: String(it.owner || ''),
      })),
    };
  }
  // Legacy shape: { "act-foo": true, "act-bar": false }
  if (raw && typeof raw === 'object') {
    const items = DEFAULT_ITEMS.map((seed) => ({
      id: seed.id,
      text: seed.text,
      done: !!raw[seed.id],
      owner: '',
    }));
    // Preserve any unknown legacy keys as items with the id as text
    Object.keys(raw).forEach((k) => {
      if (!items.find((i) => i.id === k)) {
        items.push({ id: k, text: k, done: !!raw[k], owner: '' });
      }
    });
    return { items };
  }
  return { items: DEFAULT_ITEMS.map((s) => ({ ...s, done: false, owner: '' })) };
}

function defaultScoresState() {
  return { version: SCORES_SCHEMA_VERSION, scores: {}, dailySeed: null };
}

function normaliseScores(raw) {
  if (!raw || typeof raw !== 'object' || !raw.scores || typeof raw.scores !== 'object' || Array.isArray(raw.scores)) {
    return defaultScoresState();
  }

  return {
    version: SCORES_SCHEMA_VERSION,
    scores: raw.scores,
    dailySeed: Object.prototype.hasOwnProperty.call(raw, 'dailySeed') ? raw.dailySeed : null,
  };
}

async function readBothFiles() {
  const r = await fetch(`https://api.github.com/gists/${GIST_ID}`, { headers: gistHeaders });
  const gist = await r.json();
  let rawItems = {};
  let rawScores = null;

  try {
    rawItems = JSON.parse(gist.files[FILE_NAME].content);
  } catch (_) {
    rawItems = {};
  }

  try {
    rawScores = JSON.parse(gist.files[SCORES_FILE_NAME].content);
  } catch (_) {
    rawScores = null;
  }

  return {
    items: normalise(rawItems).items,
    scores: normaliseScores(rawScores),
  };
}

async function readState() {
  const state = await readBothFiles();
  return { items: state.items };
}

async function writeState(state) {
  await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method: 'PATCH',
    headers: gistHeaders,
    body: JSON.stringify({ files: { [FILE_NAME]: { content: JSON.stringify(state) } } }),
  });
}

async function writeScores(scoresState) {
  await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method: 'PATCH',
    headers: gistHeaders,
    body: JSON.stringify({ files: { [SCORES_FILE_NAME]: { content: JSON.stringify(scoresState) } } }),
  });
}

function makeId(text) {
  const slug = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return 'act-' + (slug || 'item') + '-' + Date.now().toString(36);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const state = await readBothFiles();
      return res.json(state);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const action = body.action;

      if (action === 'submit-score') {
        const gameId = String(body.gameId || '');
        const playerId = String(body.playerId || '');
        const rawScore = Number(body.score);

        if (!CANONICAL_GAME_IDS.includes(gameId)) return res.status(400).json({ error: 'unknown gameId' });
        if (!CANONICAL_PLAYER_IDS.includes(playerId)) return res.status(400).json({ error: 'unknown playerId' });
        if (!Number.isFinite(rawScore) || rawScore < 0) return res.status(400).json({ error: 'invalid score' });

        const score = Math.round(rawScore);
        const state = await readBothFiles();
        const scoresState = state.scores;
        if (!scoresState.scores[gameId] || typeof scoresState.scores[gameId] !== 'object') {
          scoresState.scores[gameId] = {};
        }

        if (!scoresState.scores[gameId][playerId] || typeof scoresState.scores[gameId][playerId] !== 'object') {
          scoresState.scores[gameId][playerId] = { personalBest: 0, history: [] };
        }

        const playerScores = scoresState.scores[gameId][playerId];
        const existingBest = Number.isFinite(playerScores.personalBest) ? playerScores.personalBest : 0;
        const existingHistory = Array.isArray(playerScores.history) ? playerScores.history : [];
        playerScores.history = [{ score, ts: Date.now() }, ...existingHistory].slice(0, HISTORY_LIMIT);
        playerScores.personalBest = Math.max(existingBest, score);

        await writeScores(scoresState);
        return res.json({ items: state.items, scores: scoresState });
      }

      const state = await readState();

      if (action === 'add') {
        const text = String(body.text || '').trim();
        if (!text) return res.status(400).json({ error: 'text required' });
        const owner = String(body.owner || '').trim().slice(0, 40);
        const id = makeId(text);
        state.items.push({ id, text, done: false, owner });
        await writeState(state);
        return res.json(state);
      }

      if (action === 'remove') {
        const id = String(body.id || '');
        state.items = state.items.filter((it) => it.id !== id);
        await writeState(state);
        return res.json(state);
      }

      if (action === 'rename') {
        const id = String(body.id || '');
        const text = String(body.text || '').trim();
        if (!text) return res.status(400).json({ error: 'text required' });
        const item = state.items.find((it) => it.id === id);
        if (item) item.text = text;
        await writeState(state);
        return res.json(state);
      }

      if (action === 'set-owner') {
        const id = String(body.id || '');
        const owner = String(body.owner == null ? '' : body.owner).trim().slice(0, 40);
        const item = state.items.find((it) => it.id === id);
        if (item) item.owner = owner;
        await writeState(state);
        return res.json(state);
      }

      if (action === 'reorder') {
        const ids = Array.isArray(body.ids) ? body.ids.map(String) : null;
        if (!ids) return res.status(400).json({ error: 'ids (array) required' });
        const byId = new Map(state.items.map((it) => [it.id, it]));
        const reordered = [];
        ids.forEach((id) => {
          if (byId.has(id)) {
            reordered.push(byId.get(id));
            byId.delete(id);
          }
        });
        byId.forEach((it) => reordered.push(it));
        state.items = reordered;
        await writeState(state);
        return res.json(state);
      }

      if (action === 'toggle' || (body.id && typeof body.checked === 'boolean')) {
        const id = String(body.id || '');
        const checked = !!body.checked;
        const item = state.items.find((it) => it.id === id);
        if (item) item.done = checked;
        await writeState(state);
        return res.json(state);
      }

      return res.status(400).json({ error: 'unknown action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal error' });
  }
};
