export const MUTE_KEY = "tripArcade.muted";

let storageWarningShown = false;
let fallbackMuted = false;

function warnStorageUnavailable(err) {
  if (storageWarningShown) {
    return;
  }

  storageWarningShown = true;
  console.warn("[sound] localStorage unavailable; mute preference is per-session only", err);
}

export function isMuted() {
  try {
    const storage = globalThis.localStorage;
    if (!storage) {
      return fallbackMuted;
    }

    fallbackMuted = storage.getItem(MUTE_KEY) === "true";
    return fallbackMuted;
  } catch (err) {
    warnStorageUnavailable(err);
    return fallbackMuted;
  }
}

export function setMuted(muted) {
  fallbackMuted = Boolean(muted);

  try {
    globalThis.localStorage?.setItem(MUTE_KEY, fallbackMuted ? "true" : "false");
  } catch (err) {
    warnStorageUnavailable(err);
  }

  return fallbackMuted;
}

export function applyMute(k) {
  if (k && typeof k.volume === "function") {
    k.volume(isMuted() ? 0 : 1);
  }
}

export async function loadSounds(k, manifest) {
  const loads = Object.entries(manifest ?? {}).map(([id, url]) => (
    Promise.resolve()
      .then(() => k.loadSound(id, url))
      .catch((err) => {
        console.warn(`[sound] Could not load sound "${id}"`, err);
      })
  ));

  await Promise.allSettled(loads);
}

export function unlockAudio(k) {
  const audioCtx = k?.audioCtx;
  if (audioCtx && typeof audioCtx.resume === "function") {
    audioCtx.resume();
  }

  if (typeof k?.burp === "function") {
    k.burp({ volume: 0 });
  }
}
