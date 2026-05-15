const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GIST_ID = process.env.GIST_ID;
const FILE_NAME = 'actions.json';

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
  // New shape: { items: [{ id, text, done }] }
  if (raw && Array.isArray(raw.items)) {
    return {
      items: raw.items.map((it) => ({
        id: String(it.id),
        text: String(it.text || ''),
        done: !!it.done,
      })),
    };
  }
  // Legacy shape: { "act-foo": true, "act-bar": false }
  if (raw && typeof raw === 'object') {
    const items = DEFAULT_ITEMS.map((seed) => ({
      id: seed.id,
      text: seed.text,
      done: !!raw[seed.id],
    }));
    // Preserve any unknown legacy keys as items with the id as text
    Object.keys(raw).forEach((k) => {
      if (!items.find((i) => i.id === k)) {
        items.push({ id: k, text: k, done: !!raw[k] });
      }
    });
    return { items };
  }
  return { items: DEFAULT_ITEMS.map((s) => ({ ...s, done: false })) };
}

async function readState() {
  const r = await fetch(`https://api.github.com/gists/${GIST_ID}`, { headers: gistHeaders });
  const gist = await r.json();
  let raw = {};
  try {
    raw = JSON.parse(gist.files[FILE_NAME].content);
  } catch (_) {
    raw = {};
  }
  return normalise(raw);
}

async function writeState(state) {
  await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method: 'PATCH',
    headers: gistHeaders,
    body: JSON.stringify({ files: { [FILE_NAME]: { content: JSON.stringify(state) } } }),
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
      const state = await readState();
      return res.json(state);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const action = body.action;
      const state = await readState();

      if (action === 'add') {
        const text = String(body.text || '').trim();
        if (!text) return res.status(400).json({ error: 'text required' });
        const id = makeId(text);
        state.items.push({ id, text, done: false });
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
