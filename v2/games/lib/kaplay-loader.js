const KAPLAY_URL = "https://unpkg.com/kaplay@3001.0.19/dist/kaplay.mjs";

export async function mount(canvas) {
  const { default: kaplay } = await import(KAPLAY_URL);

  canvas.style.touchAction = "none";

  return kaplay({
    global: false,
    canvas,
    width: 800,
    height: 450,
    background: [0, 0, 0, 0],
    loadingScreen: false,
    backgroundAudio: false,
    touchToMouse: true,
    maxFPS: 60,
    crisp: true,
    debug: false,
  });
}

export function unmount(k, canvas) {
  if (k) {
    k.quit();
  }

  if (canvas) {
    canvas.remove();
  }
}
