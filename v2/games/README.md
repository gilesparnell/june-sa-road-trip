# Trip Game Arcade scaffold

Each game lives at:

```text
/v2/games/<game-id>/
  game.js
  index.html
  assets/sprites/
  assets/audio/
```

Keep every game at the shared canvas invariant: `800x450` pixels, 16:9. Do not change the size per game.

To add a game, copy `_template/`, rename it to the new game id, then edit `game.js`. Keep Kaplay init out of game files; use the loader:

```js
import { mount, unmount } from "/v2/games/lib/kaplay-loader.js";

let k = await mount(canvas);

// On close:
unmount(k, canvas);
k = null;
```

F5 owns the modal mount/unmount flow. It also owns the iOS audio unlock: the first user tap inside the modal calls `k.audioCtx().resume()` plus a silent `burp`.

F3 owns real score submit. For now games log final scores with `console.log`.

For local QA, each game has an `index.html` that mounts directly onto a canvas without the modal. From the repo root:

```bash
python3 -m http.server
```

Then visit `http://localhost:8000/v2/games/hello-world/`.

## Player identity (F2)

Player identity lives in `lib/player.js`. Games and modal code import the module; they do not read the browser storage slot directly.

Public API:

- `PLAYERS` — canonical ordered player list for picker display and score ownership.
- `getCurrentPlayer()` — returns the current canonical player object, or `null`.
- `setCurrentPlayer(id)` — validates and saves the selected player, then returns that player.
- `isConfirmationFresh()` — returns whether the saved player confirmation is still inside the 10-minute window.
- `ensurePlayerForGame(container)` — resolves to a player after applying the first-visit, fresh, or stale-confirm flow.
- `showPicker(container)` — always renders the picker and resolves to the chosen player.

The storage key is exported as `STORAGE_KEY`. Callers should never read or write the raw localStorage value because the module owns schema validation, stale confirmation, bad-data cleanup, and private-browsing failure handling.

Future games should consume identity before mounting:

```js
import { ensurePlayerForGame } from "/v2/games/lib/player.js";

const player = await ensurePlayerForGame(modalRoot);
// Use player.id when submitting scores.
```

→ See `docs/games/foundation/F2-player-picker.md` for full design.
