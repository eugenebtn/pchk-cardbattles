// Opening clip after «Нажмите, чтобы начать»: a short video made from the game's own art (assets/ui/intro/<name>.mp4)
// plays full screen while the Leader greets the player; a click skips it; its last frame fades into the menu.
let done = Promise.resolve();
const ready = new Map(); // name -> Promise<object URL>: the clip downloaded whole while the title screen is shown

/** Starts downloading the clip in the background (call when the title screen appears). */
export function preloadIntro(name = 'studio') {
  if (!ready.has(name)) ready.set(name, fetch(`assets/ui/intro/${name}.mp4`).then((r) => (r.ok ? r.blob() : null)).then((b) => (b ? URL.createObjectURL(b) : null)).catch(() => null));
  return ready.get(name);
}

/** Plays the clip; resolves when it has finished or was skipped (or at once if it cannot play). */
export function playIntro(name = 'studio') {
  done = new Promise((resolve) => {
    const box = document.createElement('div');
    box.id = 'intro';
    box.innerHTML = `<video playsinline muted preload="auto"></video><button class="intro-skip">Пропустить ›</button>`;
    document.body.appendChild(box);
    const v = box.querySelector('video');
    let over = false;
    const end = () => {
      if (over) return; over = true;
      box.classList.add('out'); // the clip fades into the menu that is already behind it
      setTimeout(() => { box.remove(); resolve(); }, 900);
    };
    v.addEventListener('ended', end);
    v.addEventListener('error', end);
    box.addEventListener('click', end);
    setTimeout(end, 12000); // never keep the player waiting if the clip stalls
    v.muted = true;
    // The first play() is sometimes interrupted while the video is still loading (AbortError): start again once it can play.
    const start = (retry) => v.play().catch((e) => { if (e.name === 'AbortError' && retry) v.addEventListener('canplay', () => start(false), { once: true }); else end(); });
    // Play from memory (downloaded in advance); if the download failed, fall back to the file itself.
    Promise.race([preloadIntro(name), new Promise((r) => setTimeout(() => r(null), 2500))]).then((url) => { v.src = url || `assets/ui/intro/${name}.mp4`; start(true); });
  });
  return done;
}
/** Resolves once the opening (if any) is over — for things that must not pop up on top of it. */
export function introDone() { return done; }
