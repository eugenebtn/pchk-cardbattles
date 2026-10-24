// Sound engine: recorded CC0 samples (Kenney, OpenGameArt) through a small mixing desk —
// compressor, a short room reverb (a table in a tavern, not a cathedral), stereo position by board location,
// random pitch/volume per hit. Samples: Little Robot Sound Factory (CC BY 3.0), RPG Sound Pack by artisticdude
// (CC0), Kenney (CC0); music: Kevin MacLeod, incompetech.com (CC BY 4.0).
let ctx = null, master, sfxBus, musicBus, verb, verbSend, comp;
let enabled = true, musicOn = true;
let manifest = null;
const buffers = new Map();
let loading = null;
const BASE = 'assets/audio/';
const USED = new Set(['book', 'boom', 'chain', 'chop', 'die', 'dragon', 'fire', 'fireball', 'goblin', 'jEpic', 'jLose', 'jWin', 'lrGold', 'lrMenu', 'lrSpell', 'lrTrap', 'monster', 'plate', 'punch', 'punchMed', 'rpgArmor', 'rpgCloth', 'rpgCoin', 'rpgMetal', 'rpgSwing', 'rpgSword', 'rpgUi', 'rpgWood', 'slime', 'soft']);

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
    musicBus = ctx.createGain(); musicBus.gain.value = 0.16; musicBus.connect(master);
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
      const names = Object.keys(manifest).filter((n) => USED.has(n));
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
export function setMusic(on) { musicOn = on; if (!on) stopMusic(true); else if (wantMusic) playMusic(wantMusic); }
export function musicEnabled() { return musicOn; }
export function duckMusic(amount = 0.35, seconds = 1.6) {
  if (!ctx || !musicBus) return;
  const t = ctx.currentTime;
  musicBus.gain.cancelScheduledValues(t);
  musicBus.gain.setTargetAtTime(0.16 * amount, t, 0.05);
  musicBus.gain.setTargetAtTime(0.16, t + seconds, 0.6);
}

// ---------- named effects ----------
export const sfx = {
  // Interface: soft fantasy UI clicks (RPG Sound Pack, Little Robot Sound Factory).
  click(x) { play('rpgUi', { vol: 0.3, verb: 0.05, x }); },
  hover() {},
  select(x) { play('lrMenu', { vol: 0.3, verb: 0.08, x }); },
  confirm() { play('lrMenu', { vol: 0.45, verb: 0.1 }); },
  error() { play('rpgUi', { vol: 0.35, rate: 0.7, verb: 0.05 }); },
  // Cards: cloth-like swishes and a wooden tap on the table.
  draw(x) { play('rpgCloth', { vol: 0.35, rate: 1.25, verb: 0.08, x }); },
  shuffle() { play('rpgCloth', { vol: 0.4, rate: 1.1 }); play('rpgCloth', { vol: 0.3, rate: 1.3, delay: 0.12 }); },
  play(x) { play('rpgCloth', { vol: 0.45, rate: 1.1, x, verb: 0.1 }); },
  reveal() { play('rpgCloth', { vol: 0.4, verb: 0.12 }); },
  flip(x) { play('rpgCloth', { vol: 0.4, rate: 1.2, x, verb: 0.12 }); },
  land(big = false, x) {
    play('rpgWood', { vol: big ? 0.75 : 0.5, rate: big ? 0.8 : 1, x, verb: 0.15 });
    if (big) { play('rpgArmor', { vol: 0.35, x, verb: 0.2, delay: 0.03 }); sub(60, 0.5, 0.7); }
  },
  legend(x) { play('jEpic', { vol: 0.5, verb: 0.25, x }); },
  // Fighting.
  swing(x) { play('rpgSwing', { vol: 0.55, x, verb: 0.15 }); },
  hit(n = 3, x) {
    const heavy = n >= 4;
    play(heavy ? 'punch' : 'punchMed', { vol: Math.min(0.85, 0.45 + n * 0.07), x, verb: 0.15 });
    play('rpgMetal', { vol: heavy ? 0.35 : 0.2, x, verb: 0.15, delay: 0.01 });
    if (heavy) sub(60, 0.4, 0.8);
  },
  face(n = 3, x) { play('plate', { vol: Math.min(0.9, 0.5 + n * 0.06), x, verb: 0.3 }); sub(50, 0.5, 0.8); },
  slash(x) { play('rpgSword', { vol: 0.5, x, verb: 0.15 }); },
  death(x) { play('rpgCloth', { vol: 0.5, rate: 0.7, x, verb: 0.2 }); play('die', { vol: 0.3, x, verb: 0.3, delay: 0.05 }); },
  battle() { duckMusic(0.35, 2.5); play('rpgSword', { vol: 0.55, verb: 0.25 }); sub(55, 0.5, 0.9); play('soft', { vol: 0.4, rate: 0.6, verb: 0.3, delay: 0.1 }); },
  // Magic.
  heal(x) { play('lrSpell', { vol: 0.35, rate: 1.25, x, verb: 0.3 }); },
  buff(x) { play('lrSpell', { vol: 0.3, rate: 1.45, x, verb: 0.25 }); },
  debuff(x) { play('slime', { vol: 0.45, x, verb: 0.3, rate: 0.85 }); },
  magic(x) { play('lrSpell', { vol: 0.45, x, verb: 0.3 }); },
  dark(x) { play('lrSpell', { vol: 0.45, rate: 0.6, x, verb: 0.35 }); play('monster', { vol: 0.2, x, verb: 0.3, rate: 0.75, lp: 2500 }); },
  fire(x) { play(Math.random() < 0.4 ? 'fireball' : 'fire', { vol: 0.75, x, verb: 0.35 }); sub(70, 0.5, 0.35, 0.1); },
  explosion(x) { play('boom', { vol: 0.8, x, verb: 0.4 }); sub(40, 0.9, 0.9); duckMusic(0.4, 1.2); },
  shield(x) { play('rpgArmor', { vol: 0.45, x, verb: 0.2 }); },
  stun(x) { play('lrTrap', { vol: 0.4, x, verb: 0.2 }); },
  // Coins.
  coin(x) { play('lrGold', { vol: 0.4, x, verb: 0.15 }); },
  coinStack(x) { play('rpgCoin', { vol: 0.4, x, verb: 0.15 }); },
  // Turn, win, lose: short orchestral stings instead of slot-machine jingles.
  drum() { sub(60, 0.5, 0.9); play('soft', { vol: 0.6, rate: 0.7, verb: 0.4 }); },
  turn() { duckMusic(0.6, 1.2); play('lrMenu', { vol: 0.5, rate: 0.85, verb: 0.2 }); },
  win() { stopMusic(true); play('jWin', { vol: 0.7, verb: 0.2 }); },
  lose() { stopMusic(true); play('jLose', { vol: 0.6, verb: 0.2 }); },
  // Creatures and misc.
  animal(x) { play('goblin', { vol: 0.35, x, verb: 0.25, rate: 1.15 }); },
  monster(x) { play('dragon', { vol: 0.4, x, verb: 0.3, rate: 1.1 }); },
  blood(x) { play('slime', { vol: 0.5, x, verb: 0.25 }); },
  book(x) { play('book', { vol: 0.5, x, verb: 0.2 }); },
  chain(x) { play('chain', { vol: 0.45, x, verb: 0.3 }); },
  axe(x) { play('chop', { vol: 0.65, x, verb: 0.25 }); },
  wood(x) { play('rpgWood', { vol: 0.55, x, verb: 0.2 }); },
};

