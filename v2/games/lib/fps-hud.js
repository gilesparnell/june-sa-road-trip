const DEBUG_ENABLED = readDebugFlag();
const FRAME_WINDOW = 60;
const HUD_WIDTH = 82;
const HUD_HEIGHT = 28;
const HUD_INSET = 8;
const TEXT_INSET = 10;
const hookedInstances = new WeakSet();

const noopHandle = Object.freeze({
  stop() {},
});

function readDebugFlag() {
  try {
    return new URLSearchParams(globalThis.location?.search || "").get("debug") === "1";
  } catch (_) {
    return false;
  }
}

// Returns true iff the page URL has ?debug=1.
// Read once at module load and cached — toggling the URL won't enable mid-session.
export function isDebugEnabled() {
  return DEBUG_ENABLED;
}

// Attach an FPS HUD to a Kaplay instance.
// Returns a handle: { stop(): void } — callers stop it before tearing down Kaplay.
export function attachFpsHud(k) {
  if (!DEBUG_ENABLED || !k || hookedInstances.has(k)) {
    return noopHandle;
  }

  hookedInstances.add(k);

  const x = k.width() - HUD_INSET;
  const y = HUD_INSET;
  const deltas = [];
  let stopped = false;

  const background = k.add([
    k.rect(HUD_WIDTH, HUD_HEIGHT, { radius: 5 }),
    k.pos(x, y),
    k.anchor("topright"),
    k.color(0, 0, 0),
    k.opacity(0.6),
    k.fixed(),
    k.z(999),
  ]);

  const label = k.add([
    k.text("FPS --", { size: 16, font: "monospace" }),
    k.pos(x - TEXT_INSET, y + 5),
    k.anchor("topright"),
    k.color(255, 255, 255),
    k.fixed(),
    k.z(1000),
  ]);

  const updateController = k.onUpdate(() => {
    if (stopped) return;

    deltas.push(k.dt());
    if (deltas.length > FRAME_WINDOW) {
      deltas.shift();
    }

    if (deltas.length === FRAME_WINDOW) {
      const totalSeconds = deltas.reduce((sum, delta) => sum + delta, 0);
      if (totalSeconds > 0) {
        label.text = `FPS ${Math.round(FRAME_WINDOW / totalSeconds)}`;
      }
    }
  });

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      hookedInstances.delete(k);

      if (typeof updateController?.cancel === "function") {
        try {
          updateController.cancel();
        } catch (_) {
          // Stop must stay safe after a Kaplay quit.
        }
      } else if (typeof updateController === "function") {
        try {
          updateController();
        } catch (_) {
          // Stop must stay safe after a Kaplay quit.
        }
      }

      try {
        label.destroy?.();
        background.destroy?.();
      } catch (_) {
        // Stop must stay safe after a Kaplay quit.
      }
    },
  };
}
