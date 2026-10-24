// Sound engine: recorded CC0 samples (Kenney, OpenGameArt) layered through a small mixing desk —
// compressor, hall reverb, stereo position by board location, random pitch/volume per hit,
// plus a synthesised sub-bass layer for weight on heavy impacts. Background music loops.
let ctx = null, master, sfxBus, musicBus, verb, verbSend, comp;
let enabled = true, musicOn = true;
let manifest = null;
const buffers = new Map();
let loading = null;
const BASE = 'assets/audio/';

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.25;
    master = ctx.createGain(); master.gain.value = 0.9;
    comp.connect(master); master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.85; sfxBus.connect(comp);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.22; musicBus.connect(master);
    // Hall reverb from a generated impulse response.
    verb = ctx.createConvolver();
    verb.buffer = impulse(2.4, 2.8);
    verbSend = ctx.createGain(); verbSend.gain.value = 0.32;
    verbSend.connect(verb); verb.connect(comp);
    loadAll();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function impulse(seconds, decay) {
  const rate = ctx.sampleRate, len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // Early reflections + diffuse tail, slightly darker over time.
      const early = i < rate * 0.08 && Math.random() < 0.004 ? (Math.random() * 2 - 1) * 0.9 : 0;
      d[i] = early + (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (1 - 0.5 * t);
    }
  }
  return buf;
}
async function loadAll() {
  if (loading) return loading;
  loading = (async () => {
    try {
      manifest = await (await fetch(BASE + 'manifest.json')).json();
      const names = Object.keys(manifest).filter((n) => !n.startsWith('music'));
      await Promise.all(names.flatMap((n) => manifest[n].map((f) => load(f))));
    } catch (e) { console.warn('audio load failed', e); }
  })();
  return loading;
}
async function load(file) {
  if (buffers.has(file)) return buffers.get(file);
  const p = fetch(BASE + file).then((r) => r.arrayBuffer()).then((a) => new Promise((res, rej) => ctx.decodeAudioData(a, res, rej))).catch(() => null);
  buffers.set(file, p);
  const b = await p; buffers.set(file, b); return b;
}
function pickBuf(group) {
  if (!manifest || !manifest[group]) return null;
  const list = manifest[group];
  const f = list[Math.floor(Math.random() * list.length)];
  const b = buffers.get(f);
  return b && !(b instanceof Promise) ? b : null;
}

export function setSound(on) { enabled = on; if (ctx) master.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.05); if (!on) stopMusic(); else if (wantMusic) playMusic(wantMusic); }
export function soundOn() { return enabled; }
export function unlockAudio() { ac(); }

/**
 * Play a sample group.
 * o: { vol, rate (pitch), vary (random pitch range), pan (-1..1) or x (stage px), delay, verb (send), lp (lowpass Hz), dur }
 */
function play(group, o = {}) {
  const c = ac(); if (!c || !enabled) return;
  const b = pickBuf(group); if (!b) return;
  const t = c.currentTime + (o.delay || 0);
  const src = c.createBufferSource(); src.buffer = b;
  const vary = o.vary ?? 0.06;
  src.playbackRate.value = (o.rate ?? 1) * (1 + (Math.random() * 2 - 1) * vary);
  const g = c.createGain(); g.gain.value = (o.vol ?? 0.7) * (0.9 + Math.random() * 0.2);
  let node = src;
  if (o.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; node.connect(f); node = f; }
  if (o.hp) { const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = o.hp; node.connect(f); node = f; }
  node.connect(g);
  const pan = c.createStereoPanner ? c.createStereoPanner() : null;
  const pv = o.pan ?? (o.x != null ? Math.max(-1, Math.min(1, (o.x - 800) / 700)) : 0);
  if (pan) { pan.pan.value = pv; g.connect(pan); pan.connect(sfxBus); } else g.connect(sfxBus);
  const send = c.createGain(); send.gain.value = o.verb ?? 0.35; g.connect(send); send.connect(verbSend);
  if (o.fadeOut) { g.gain.setValueAtTime(g.gain.value, t + o.fadeOut[0]); g.gain.exponentialRampToValueAtTime(0.0001, t + o.fadeOut[0] + o.fadeOut[1]); }
  src.start(t, o.offset || 0, o.dur);
}
// Synth layers for weight and shimmer.
function sub(freq = 70, dur = 0.45, vol = 0.6, delay = 0) {
  const c = ac(); if (!c || !enabled) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator(), g = c.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * 0.45, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + dur + 0.05);
}
function air(dur = 0.4, from = 600, to = 3000, vol = 0.18, delay = 0, pan = 0) {
  const c = ac(); if (!c || !enabled) return;
  const t = c.currentTime + delay;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate); const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const s = c.createBufferSource(); s.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
  f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur * 0.6); f.frequency.exponentialRampToValueAtTime(from, t + dur);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.45); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const p = c.createStereoPanner ? c.createStereoPanner() : null;
  s.connect(f); f.connect(g);
  if (p) { p.pan.value = pan; g.connect(p); p.connect(sfxBus); } else g.connect(sfxBus);
  const sd = c.createGain(); sd.gain.value = 0.4; g.connect(sd); sd.connect(verbSend);
  s.start(t);
}
function shimmer(notes = [1318, 1760, 2093, 2637], vol = 0.035, delay = 0) {
  const c = ac(); if (!c || !enabled) return;
  notes.forEach((f, k) => {
    const t = c.currentTime + delay + k * 0.05;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    o.connect(g); const sd = c.createGain(); sd.gain.value = 1.2; g.connect(sd); sd.connect(verbSend); g.connect(sfxBus);
    o.start(t); o.stop(t + 1.3);
  });
}
const P = (x) => (x == null ? 0 : Math.max(-1, Math.min(1, (x - 800) / 700)));

// ---------- music ----------
let musicSrc = null, musicGain = null, wantMusic = null, musicName = null;
export async function playMusic(name) {
  wantMusic = name;
  const c = ac(); if (!c || !enabled || !musicOn) return;
  if (musicName === name && musicSrc) return;
  stopMusic(true);
  musicName = name;
  await loadAll();
  const file = manifest?.[name]?.[0]; if (!file) return;
  const b = await load(file); if (!b || wantMusic !== name) return;
  const s = c.createBufferSource(); s.buffer = b; s.loop = true;
  const g = c.createGain(); g.gain.value = 0.0001; g.gain.exponentialRampToValueAtTime(1, c.currentTime + 2.5);
  s.connect(g); g.connect(musicBus); s.start();
  musicSrc = s; musicGain = g;
}
export function stopMusic(keepWanted = false) {
  if (!keepWanted) wantMusic = null;
  if (musicSrc && ctx) {
    const s = musicSrc, g = musicGain;
    g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4);
    setTimeout(() => { try { s.stop(); } catch (e) { /* stopped */ } }, 1800);
  }
  musicSrc = null; musicName = null;
}
export function setMusic(on) { musicOn = on; if (!on) stopMusic(true); else if (wantMusic) playMusic(wantMusic); }
export function musicEnabled() { return musicOn; }
export function duckMusic(amount = 0.35, seconds = 1.6) {
  if (!ctx || !musicBus) return;
  const t = ctx.currentTime;
  musicBus.gain.cancelScheduledValues(t);
  musicBus.gain.setTargetAtTime(0.22 * amount, t, 0.05);
  musicBus.gain.setTargetAtTime(0.22, t + seconds, 0.6);
}

// ---------- named effects ----------
export const sfx = {
  click(x) { play('click', { vol: 0.35, verb: 0.1, x }); },
  hover() { play('tick', { vol: 0.12, verb: 0.05, rate: 1.4 }); },
  select(x) { play('select', { vol: 0.4, verb: 0.15, x }); },
  confirm() { play('confirm', { vol: 0.45, verb: 0.2 }); },
  draw(x) { play('draw', { vol: 0.7, verb: 0.2, x }); },
  shuffle() { play('shuffle', { vol: 0.6 }); },
  play(x) { play('play', { vol: 0.8, x, verb: 0.2 }); air(0.5, 400, 2400, 0.12, 0.05, P(x)); },
  reveal() { play('cardFan', { vol: 0.5, verb: 0.3 }); },
  land(big = false, x) {
    play(big ? 'landStone' : 'land', { vol: big ? 1 : 0.8, rate: big ? 0.75 : 0.95, x, verb: big ? 0.6 : 0.35 });
    play('cardPlace', { vol: 0.6, x, verb: 0.1 });
    sub(big ? 55 : 80, big ? 0.8 : 0.35, big ? 0.9 : 0.45);
    if (big) play('stones', { vol: 0.5, delay: 0.08, x, verb: 0.4 });
  },
  legend(x) { play('bell', { vol: 0.5, rate: 0.8, verb: 0.9, x }); shimmer([523, 784, 1046, 1568, 2093], 0.05, 0.05); play('jingleWin', { vol: 0.35, delay: 0.1, verb: 0.5 }); },
  swing(x) { play('whoosh', { vol: 0.6, rate: 1.1, x, verb: 0.2 }); air(0.32, 500, 3500, 0.2, 0, P(x)); },
  hit(n = 3, x) {
    const heavy = n >= 4;
    play(heavy ? 'punch' : 'punchMed', { vol: Math.min(1, 0.55 + n * 0.08), x, verb: 0.35 });
    play(heavy ? 'metal' : 'metalMed', { vol: Math.min(0.7, 0.25 + n * 0.06), x, rate: 0.9 + Math.random() * 0.2, verb: 0.5 });
    sub(heavy ? 60 : 90, heavy ? 0.5 : 0.25, Math.min(0.9, 0.25 + n * 0.1));
  },
  face(n = 3, x) { play('plate', { vol: Math.min(1, 0.6 + n * 0.06), x, verb: 0.55 }); sub(50, 0.6, Math.min(1, 0.35 + n * 0.08)); },
  slash(x) { play('blade', { vol: 0.75, x, verb: 0.35 }); },
  heal(x) { play('magic', { vol: 0.45, rate: 1.25, x, verb: 0.7, hp: 400 }); shimmer([880, 1108, 1318, 1760], 0.04); },
  buff(x) { play('gem', { vol: 0.55, x, verb: 0.5 }); shimmer([659, 830, 988, 1318], 0.03, 0.03); },
  debuff(x) { play('slime', { vol: 0.5, x, verb: 0.4, rate: 0.85 }); sub(140, 0.4, 0.2); },
  death(x) { play('die', { vol: 0.55, x, verb: 0.5, rate: 0.95 }); play('glass', { vol: 0.5, x, verb: 0.6, rate: 0.8 }); play('stones', { vol: 0.5, x, delay: 0.06, verb: 0.4 }); sub(65, 0.7, 0.55); },
  coin(x) { play('coins', { vol: 0.55, x, verb: 0.25 }); },
  coinStack(x) { play('chips', { vol: 0.5, x, verb: 0.2 }); },
  fire(x) { play(Math.random() < 0.4 ? 'fireball' : 'fire', { vol: 0.85, x, verb: 0.55 }); sub(70, 0.5, 0.35, 0.1); },
  magic(x) { play('spell', { vol: 0.6, x, verb: 0.7 }); play('magic', { vol: 0.35, x, verb: 0.8, delay: 0.05 }); },
  dark(x) { play('monster', { vol: 0.45, x, verb: 0.8, rate: 0.75, lp: 2500 }); play('spell', { vol: 0.4, rate: 0.6, x, verb: 0.9 }); sub(45, 0.9, 0.5); },
  explosion(x) { play('boom', { vol: 1, x, verb: 0.7 }); play('bang', { vol: 0.5, x, delay: 0.03, verb: 0.6 }); sub(40, 1.1, 1); duckMusic(0.3, 1.5); },
  shield(x) { play('bell', { vol: 0.45, rate: 1.4, x, verb: 0.8 }); play('glassLight', { vol: 0.4, x, verb: 0.6 }); },
  stun(x) { play('bell', { vol: 0.4, rate: 1.8, x, verb: 0.6 }); play('glassLight', { vol: 0.3, delay: 0.12, x, rate: 1.3 }); },
  drum() { sub(60, 0.5, 0.9); play('soft', { vol: 0.7, rate: 0.7, verb: 0.6 }); },
  battle() { duckMusic(0.25, 3); play('jingleBattle', { vol: 0.7, verb: 0.5 }); [0, 0.22, 0.44].forEach((d) => { sub(55, 0.5, 0.9, d); play('soft', { vol: 0.6, rate: 0.6, delay: d, verb: 0.5 }); }); play('chain', { vol: 0.4, delay: 0.5, verb: 0.6 }); },
  turn() { duckMusic(0.5, 1.6); play('jingleTurn', { vol: 0.55, verb: 0.5 }); },
  win() { stopMusic(true); play('jingleWin', { vol: 0.8, verb: 0.6 }); shimmer([523, 659, 784, 1046, 1318, 1568], 0.05, 0.2); },
  lose() { stopMusic(true); play('jingleLose', { vol: 0.7, verb: 0.6 }); sub(50, 1.5, 0.5); },
  error() { play('error', { vol: 0.4, verb: 0.1 }); },
  flip(x) { play('cardFan', { vol: 0.6, x, verb: 0.3 }); air(0.3, 800, 3000, 0.1); },
  animal(x) { play('creature', { vol: 0.45, x, verb: 0.4, rate: 1.1 }); },
  monster(x) { play('monster', { vol: 0.6, x, verb: 0.6 }); },
  blood(x) { play('slime', { vol: 0.55, x, verb: 0.35 }); },
  book(x) { play('book', { vol: 0.5, x, verb: 0.25 }); },
  chain(x) { play('chain', { vol: 0.5, x, verb: 0.4 }); },
  axe(x) { play('chop', { vol: 0.7, x, verb: 0.3 }); },
  wood(x) { play('wood', { vol: 0.6, x, verb: 0.35 }); },
};
