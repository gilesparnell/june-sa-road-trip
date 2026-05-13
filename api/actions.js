const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GIST_ID = process.env.GIST_ID;
const FILE_NAME = 'actions.json';

const gistHeaders = {
  Authorization: `token ${GITHUB_TOKEN}`,
  'User-Agent': 'june-sa-trip',
  Accept: 'application/vnd.github.v3+json',
  'Content-Type': 'application/json',
};

async function readState() {
  const r = await fetch(`https://api.github.com/gists/${GIST_ID}`, { headers: gistHeaders });
  const gist = await r.json();
  return JSON.parse(gist.files[FILE_NAME].content);
}

async function writeState(state) {
  await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method: 'PATCH',
    headers: gistHeaders,
    body: JSON.stringify({ files: { [FILE_NAME]: { content: JSON.stringify(state) } } }),
  });
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
      const { id, checked } = req.body;
      if (!id || typeof checked !== 'boolean') {
        return res.status(400).json({ error: 'id (string) and checked (boolean) required' });
      }
      const state = await readState();
      state[id] = checked;
      await writeState(state);
      return res.json({ ok: true, state });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal error' });
  }
};
