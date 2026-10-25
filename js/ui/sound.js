// Sound engine: the game's own effects made with ElevenLabs Sound Effects (credited on the Legal page), mixed through a small desk —
// compressor, a short room reverb (a table in a tavern, not a cathedral), stereo position by board location,
// random pitch/volume per hit. Music: Kevin MacLeod, incompetech.com (CC BY 4.0) and RandomMind (CC0).
let ctx = null, master, sfxBus, musicBus, verb, verbSend, comp;
let enabled = true, musicOn = true;
let manifest = null;
// Three volume sliders (0..1): music, game sounds, interface clicks.
const VOL = { music: 1, sfx: 1, ui: 1 };
const MUSIC_BASE = 0.16, SFX_BASE = 0.85;
export function setVolumes(v = {}) {
  Object.assign(VOL, v);
  if (ctx && musicBus) musicBus.gain.setTargetAtTime(MUSIC_BASE * VOL.music, ctx.currentTime, 0.1);
  if (ctx && sfxBus) sfxBus.gain.setTargetAtTime(SFX_BASE * VOL.sfx, ctx.currentTime, 0.1);
}
export function volumes() { return { ...VOL }; }
const buffers = new Map();
let loading = null;
const BASE = 'assets/audio/';
const USED = new Set(['elAnimal', 'elAxe', 'elBattle', 'elBlood', 'elBook', 'elBuff', 'elChain', 'elClick', 'elCoin', 'elConfirm', 'elDanger', 'elDark', 'elDeath', 'elDebuff', 'elDraw', 'elExplosion', 'elFace', 'elFire', 'elFlip', 'elHeal', 'elHit', 'elHitBig', 'elLandBig', 'elLegend', 'elLose', 'elMagic', 'elMonster', 'elPlay', 'elShield', 'elShuffle', 'elStun', 'elSwing', 'elTurn', 'elWin', 'soft']);

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.25;
    master = ctx.createGain(); master.gain.value = 0.9;
    comp.connect(master); master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = SFX_BASE * VOL.sfx; sfxBus.connect(comp);
    musicBus = ctx.createGain(); musicBus.gain.value = MUSIC_BASE * VOL.music; musicBus.connect(master);
    // Hall reverb from a generated impulse response.
    verb = ctx.createConvolver();
    verb.buffer = impulse(0.9, 3.5);
    verbSend = ctx.createGain(); verbSend.gain.value = 0.2;
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
      // Only the groups the effects below actually use (older packs stay on disk but are not downloaded).
      const names = Object.keys(manifest).filter((n) => USED.has(n) || n.startsWith('elVo')); // + Leader voices
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
  vol *= 0.35;
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
  vol *= 0.35;
  notes.forEach((f, k) => {
    const t = c.currentTime + delay + k * 0.05;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    o.connect(g); const sd = c.createGain(); sd.gain.value = 1.2; g.connect(sd); sd.connect(verbSend); g.connect(sfxBus);
    o.start(t); o.stop(t + 1.3);
  });
}
// Plucked string (Karplus–Strong): a lute/harp note made from a burst of noise in a short feedback loop.
const luteCache = new Map();
function luteBuf(freq) {
  const key = Math.round(freq);
  if (luteCache.has(key)) return luteCache.get(key);
  const rate = ctx.sampleRate, len = Math.floor(rate * 1.8), N = Math.max(2, Math.round(rate / freq));
  const buf = ctx.createBuffer(1, len, rate), d = buf.getChannelData(0);
  const line = new Float32Array(N);
  for (let i = 0; i < N; i++) line[i] = (Math.random() * 2 - 1) * (1 - i / N * 0.5);
  let prev = 0;
  for (let i = 0; i < len; i++) {
    const k = i % N, v = line[k];
    const nv = 0.5 * (v + line[(k + 1) % N]) * 0.9965;
    line[k] = nv; d[i] = v * 0.7 + prev * 0.3; prev = v;
  }
  luteCache.set(key, buf);
  return buf;
}
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
/** Strum notes (MIDI numbers) one after another, like fingers on a lute. */
function lute(notes, { gap = 0.07, vol = 0.32, delay = 0, pan = 0 } = {}) {
  const c = ac(); if (!c || !enabled) return;
  notes.forEach((n, k) => {
    const t = c.currentTime + delay + k * gap;
    const s = c.createBufferSource(); s.buffer = luteBuf(NOTE(n));
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 3200;
    const g = c.createGain(); g.gain.value = vol;
    const p = c.createStereoPanner ? c.createStereoPanner() : null;
    s.connect(f); f.connect(g);
    if (p) { p.pan.value = pan; g.connect(p); p.connect(sfxBus); } else g.connect(sfxBus);
    const sd = c.createGain(); sd.gain.value = 0.5; g.connect(sd); sd.connect(verbSend);
    s.start(t);
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
// A quiet looping background under the music (e.g. a dungeon on dark fields); follows the music slider.
let ambSrc = null, ambName = null;
export async function playAmbient(name, vol = 0.55) {
  const c = ac(); if (!c || !enabled || !musicOn) return;
  if (ambName === name && ambSrc) return;
  stopAmbient(); ambName = name;
  await loadAll();
  const file = manifest?.[name]?.[0]; if (!file) return;
  const b = await load(file); if (!b || ambName !== name) return;
  const s = c.createBufferSource(); s.buffer = b; s.loop = true;
  const g = c.createGain(); g.gain.value = 0.0001; g.gain.exponentialRampToValueAtTime(vol, c.currentTime + 3);
  s.connect(g); g.connect(musicBus); s.start();
  ambSrc = { s, g };
}
export function stopAmbient() {
  if (ambSrc && ctx) { const { s, g } = ambSrc; g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.5); setTimeout(() => { try { s.stop(); } catch { /* stopped */ } }, 2500); }
  ambSrc = null; ambName = null;
}
export function setMusic(on) { musicOn = on; if (!on) stopMusic(true); else if (wantMusic) playMusic(wantMusic); }
export function musicEnabled() { return musicOn; }
export function duckMusic(amount = 0.35, seconds = 1.6) {
  if (!ctx || !musicBus) return;
  const t = ctx.currentTime;
  musicBus.gain.cancelScheduledValues(t);
  musicBus.gain.setTargetAtTime(MUSIC_BASE * VOL.music * amount, t, 0.05);
  musicBus.gain.setTargetAtTime(MUSIC_BASE * VOL.music, t + seconds, 0.6);
}

// ---------- named effects ----------
// The game's own effects made with ElevenLabs Sound Effects (groups «el…», tools/build-el-audio.py), with a synth sub-bass for weight.
export const sfx = {
  // Interface.
  click(x) { play('elClick', { vol: 0.45 * VOL.ui, verb: 0.03, x }); },
  hover() {},
  select(x) { play('elClick', { vol: 0.4 * VOL.ui, rate: 1.15, verb: 0.05, x }); },
  confirm() { play('elConfirm', { vol: 0.5 * VOL.ui, verb: 0.08 }); },
  error() { play('elClick', { vol: 0.45 * VOL.ui, rate: 0.7, verb: 0.05 }); },
  // A Leader is in danger: heartbeat and a low bell, once per danger level.
  danger(x) { play('elDanger', { vol: 0.7, x, verb: 0.3 }); },
  // Cards.
  draw(x) { play('elDraw', { vol: 0.5, verb: 0.06, x }); },
  shuffle() { play('elShuffle', { vol: 0.55, verb: 0.08 }); },
  play(x) { play('elPlay', { vol: 0.55, x, verb: 0.08 }); },
  reveal() { play('elFlip', { vol: 0.5, verb: 0.1 }); },
  flip(x) { play('elFlip', { vol: 0.5, x, verb: 0.1 }); },
  land(big = false, x) {
    if (big) { play('elLandBig', { vol: 0.75, x, verb: 0.15 }); sub(60, 0.5, 0.6); }
    else play('elPlay', { vol: 0.6, x, verb: 0.1 });
  },
  legend(x) { duckMusic(0.35, 3); play('elLegend', { vol: 0.75, verb: 0.2, x }); },
  // Fighting.
  swing(x) { play('elSwing', { vol: 0.6, x, verb: 0.1 }); },
  hit(n = 3, x) {
    if (n >= 5) { play('elHitBig', { vol: Math.min(0.95, 0.6 + n * 0.04), x, verb: 0.2 }); sub(55, 0.45, 0.8); }
    else play('elHit', { vol: Math.min(0.85, 0.5 + n * 0.08), x, verb: 0.12 });
  },
  face(n = 3, x) { play('elFace', { vol: Math.min(0.95, 0.55 + n * 0.06), x, verb: 0.25 }); sub(50, 0.5, 0.7); },
  slash(x) { play('elSwing', { vol: 0.55, rate: 1.15, x, verb: 0.12 }); },
  death(x) { play('elDeath', { vol: 0.65, x, verb: 0.25 }); },
  battle() { duckMusic(0.35, 2.5); play('elBattle', { vol: 0.7, verb: 0.2 }); },
  // Magic.
  heal(x) { play('elHeal', { vol: 0.55, x, verb: 0.25 }); },
  buff(x) { play('elBuff', { vol: 0.5, x, verb: 0.2 }); },
  debuff(x) { play('elDebuff', { vol: 0.55, x, verb: 0.25 }); },
  magic(x) { play('elMagic', { vol: 0.6, x, verb: 0.25 }); },
  dark(x) { play('elDark', { vol: 0.6, x, verb: 0.3 }); },
  fire(x) { play('elFire', { vol: 0.75, x, verb: 0.3 }); sub(70, 0.5, 0.35, 0.1); },
  explosion(x) { play('elExplosion', { vol: 0.85, x, verb: 0.35 }); sub(40, 0.9, 0.8); duckMusic(0.4, 1.2); },
  shield(x) { play('elShield', { vol: 0.6, x, verb: 0.15 }); },
  stun(x) { play('elStun', { vol: 0.55, x, verb: 0.15 }); },
  // Coins.
  coin(x) { play('elCoin', { vol: 0.5, x, verb: 0.1 }); },
  coinStack(x) { play('elCoin', { vol: 0.55, rate: 0.9, x, verb: 0.1 }); },
  // Turn, win, lose.
  drum() { sub(60, 0.5, 0.9); play('soft', { vol: 0.6, rate: 0.7, verb: 0.4 }); },
  turn() { duckMusic(0.6, 1.4); play('elTurn', { vol: 0.6, verb: 0.15 }); },
  win() { stopMusic(true); play('elWin', { vol: 0.8, verb: 0.15 }); },
  lose() { stopMusic(true); play('elLose', { vol: 0.75, verb: 0.15 }); },
  // Creatures and things.
  animal(x) { play('elAnimal', { vol: 0.55, x, verb: 0.15 }); },
  monster(x) { play('elMonster', { vol: 0.6, x, verb: 0.25 }); },
  blood(x) { play('elBlood', { vol: 0.6, x, verb: 0.15 }); },
  book(x) { play('elBook', { vol: 0.6, x, verb: 0.15 }); },
  chain(x) { play('elChain', { vol: 0.55, x, verb: 0.25 }); },
  axe(x) { play('elAxe', { vol: 0.7, x, verb: 0.2 }); },
  wood(x) { play('elPlay', { vol: 0.55, rate: 0.85, x, verb: 0.15 }); },
};

/** A Leader speaks (kind: 'Intro' at the start of a game, 'Win' on victory). Only Leaders with recorded lines; music steps back. */
export function voice(leaderId, kind) {
  const g = `elVo${leaderId}${kind}`;
  if (!manifest || !manifest[g]) return false;
  duckMusic(0.3, 3.2);
  play(g, { vol: 0.95, verb: 0.06, vary: 0 });
  return true;
}
