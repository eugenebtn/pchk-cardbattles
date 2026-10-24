// Visual effects: a canvas particle system plus DOM helpers, and named spell presets.
import { sfx } from './sound.js';

let W = 1600, H = 900;
export function setSize(w, h) {
  if (w === W && h === H) return;
  W = w; H = h;
  if (canvas) { canvas.width = w; canvas.height = h; }
  motes.length = 0; if (ambientOn) ambient(true);
}

// ---------- textured sprites (Kenney particle pack, CC0) ----------
const TEX_NAMES = ['smoke_01', 'smoke_02', 'smoke_03', 'smoke_04', 'smoke_05', 'smoke_06', 'smoke_07', 'fire_01', 'fire_02', 'flame_01', 'flame_02', 'flame_03', 'flame_04',
  'flare_01', 'light_01', 'light_02', 'light_03', 'magic_01', 'magic_02', 'magic_03', 'magic_04', 'magic_05', 'spark_01', 'spark_02', 'spark_03', 'spark_04', 'spark_05',
  'star_01', 'star_02', 'star_03', 'star_04', 'star_05', 'star_06', 'slash_01', 'slash_02', 'slash_03', 'slash_04', 'scorch_01', 'scorch_02', 'trace_01', 'trace_02',
  'twirl_01', 'twirl_02', 'twirl_03', 'circle_01', 'circle_02', 'circle_03', 'circle_04', 'circle_05', 'muzzle_01', 'muzzle_02', 'dirt_01', 'dirt_02', 'dirt_03', 'symbol_01', 'symbol_02', 'scratch_01'];
const texImg = {};
for (const n of TEX_NAMES) { const im = new Image(); im.src = `assets/fx/${n}.png`; texImg[n] = im; }
const tinted = new Map();
function tex(name, color) {
  const key = name + '|' + color;
  let cv = tinted.get(key);
  if (cv) return cv;
  const im = texImg[name];
  if (!im || !im.complete || !im.naturalWidth) return null;
  cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  g.drawImage(im, 0, 0, 128, 128);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color; g.fillRect(0, 0, 128, 128);
  tinted.set(key, cv);
  return cv;
}
const pickTex = (t) => (Array.isArray(t) ? t[Math.floor(Math.random() * t.length)] : t);
let canvas, c2d, layer, stageEl;
const parts = [];
let running = false;
export let speed = 1; // animation speed multiplier (higher = faster)
export function setSpeed(s) { speed = s; }
const wait = (ms) => new Promise((r) => setTimeout(r, ms / speed));
export { wait };

export function initFx(stage) {
  stageEl = stage;
  canvas = stage.querySelector('#fx-canvas');
  c2d = canvas.getContext('2d');
  layer = stage.querySelector('#fx-layer');
  if (ambientOn) ambient(true);
}

// Pre-rendered soft glow sprites (much smoother and faster than per-frame gradients).
const sprites = new Map();
function sprite(color, core) {
  const key = color + '|' + core;
  let cv = sprites.get(key);
  if (cv) return cv;
  cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  try {
  grd.addColorStop(0, core); grd.addColorStop(0.25, color); grd.addColorStop(0.6, /^#[0-9a-f]{6}$/i.test(color) ? color + '55' : color); grd.addColorStop(1, 'rgba(0,0,0,0)');
  } catch (e) { grd.addColorStop(0, '#fff'); grd.addColorStop(1, 'rgba(0,0,0,0)'); }
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  sprites.set(key, cv);
  return cv;
}
// Ambient dust motes floating in the light over the table.
const motes = [];
let ambientOn = false;
export function ambient(on) {
  ambientOn = on;
  if (on && !motes.length) for (let i = 0; i < 46; i++) motes.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.15, vy: -0.05 - Math.random() * 0.15, s: 1 + Math.random() * 2.2, ph: Math.random() * 6 });
  if (on && !running && c2d) { running = true; requestAnimationFrame(loop); }
}
function drawMotes(t) {
  if (!ambientOn) return;
  c2d.save(); c2d.globalCompositeOperation = 'lighter';
  for (const m of motes) {
    m.x += m.vx + Math.sin(t / 2000 + m.ph) * 0.08; m.y += m.vy;
    if (m.y < -10) { m.y = H + 10; m.x = Math.random() * W; }
    if (m.x < -10) m.x = W + 10; if (m.x > W + 10) m.x = -10;
    const cx = Math.abs(m.x - W / 2) / (W / 2), cy = Math.abs(m.y - H / 2) / (H / 2);
    c2d.globalAlpha = Math.max(0, 0.55 - (cx * cx + cy * cy) * 0.35) * (0.6 + 0.4 * Math.sin(t / 700 + m.ph));
    c2d.drawImage(sprite('#ffd9a0', '#fff6e0'), m.x - m.s * 3, m.y - m.s * 3, m.s * 6, m.s * 6);
  }
  c2d.restore();
}

let lastT = 0;
function loop(t = performance.now()) {
  const dt = lastT ? Math.min(400, t - lastT) : 16;
  lastT = t;
  const k = dt / 16;
  c2d.clearRect(0, 0, W, H);
  drawMotes(t);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt * speed;
    if (p.life <= 0) { parts.splice(i, 1); continue; }
    p.vx *= p.drag; p.vy = p.vy * p.drag + p.gravity * k;
    p.x += p.vx * speed * k; p.y += p.vy * speed * k; p.rot += p.vr * k;
    const t = p.life / p.max;
    c2d.save();
    c2d.globalAlpha = Math.min(1, t * 1.6) * p.alpha;
    c2d.globalCompositeOperation = p.add ? 'lighter' : 'source-over';
    c2d.translate(p.x, p.y); c2d.rotate(p.rot);
    const s = p.size * (p.grow ? (1 + (1 - t) * p.grow) : (0.4 + 0.6 * t));
    if (p.shape === 'tex') {
      const cv = tex(p.tex, p.color);
      if (cv) { const sz = p.size * (p.grow ? (1 + (1 - t) * p.grow) : 1); c2d.drawImage(cv, -sz, -sz, sz * 2, sz * 2); }
    } else if (p.shape === 'emoji') {
      c2d.font = `${s * 2}px serif`; c2d.textAlign = 'center'; c2d.textBaseline = 'middle';
      c2d.fillText(p.text, 0, 0);
    } else if (p.shape === 'spark') {
      c2d.strokeStyle = p.color; c2d.lineWidth = Math.max(1, s / 3); c2d.lineCap = 'round';
      c2d.beginPath(); c2d.moveTo(0, 0); c2d.lineTo(-p.vx * 3, -p.vy * 3); c2d.stroke();
    } else if (p.shape === 'ring') {
      c2d.strokeStyle = p.color; c2d.lineWidth = p.width || 4;
      c2d.beginPath(); c2d.arc(0, 0, p.size * (1 + (1 - t) * (p.grow || 3)), 0, Math.PI * 2); c2d.stroke();
    } else if (p.shape === 'shard') {
      c2d.fillStyle = p.color; c2d.beginPath(); c2d.moveTo(-s, -s / 2); c2d.lineTo(s, -s / 3); c2d.lineTo(s / 2, s); c2d.closePath(); c2d.fill();
    } else {
      c2d.drawImage(sprite(p.color, p.core || '#fff'), -s, -s, s * 2, s * 2);
    }
    c2d.restore();
  }
  if (parts.length || ambientOn) requestAnimationFrame(loop); else { running = false; lastT = 0; c2d.clearRect(0, 0, W, H); }
}
function add(p) {
  if (parts.length > 900) parts.splice(0, parts.length - 900);
  parts.push({ vx: 0, vy: 0, drag: 0.96, gravity: 0, rot: 0, vr: 0, alpha: 1, add: true, shape: 'circle', size: 8, color: '#fff', life: 600, ...p, max: p.life || 600 });
  if (!running) { running = true; requestAnimationFrame(loop); }
}

// ---------- primitives ----------
export function burst(x, y, o = {}) {
  const n = o.count ?? 24;
  for (let i = 0; i < n; i++) {
    const a = (o.angle ?? 0) + (o.spread ?? Math.PI * 2) * (Math.random() - (o.spread ? 0.5 : 0));
    const sp = (o.speed ?? 6) * (0.3 + Math.random());
    add({
      x: x + (Math.random() - 0.5) * (o.jitter ?? 10), y: y + (Math.random() - 0.5) * (o.jitter ?? 10),
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, gravity: o.gravity ?? 0, drag: o.drag ?? 0.93,
      life: (o.life ?? 700) * (0.6 + Math.random() * 0.6), size: (o.size ?? 8) * (0.6 + Math.random() * 0.8),
      color: Array.isArray(o.color) ? o.color[i % o.color.length] : (o.color ?? '#ffb347'), core: o.core, tex: pickTex(o.tex),
      shape: o.shape ?? 'circle', text: Array.isArray(o.emoji) ? o.emoji[i % o.emoji.length] : o.emoji, vr: (Math.random() - 0.5) * (o.spin ?? 0.2),
      add: o.add ?? true, grow: o.grow, alpha: o.alpha ?? 1,
    });
  }
}
export function ring(x, y, color = '#ffd27a', size = 20, life = 600, grow = 4, width = 5) { add({ x, y, shape: 'ring', color, size, life, grow, width, drag: 1 }); }
export function glow(x, y, color, size = 80, life = 500) { add({ x, y, size, color, core: color, life, grow: 0.6, drag: 1, alpha: 0.85 }); }
/** Textured burst helpers. */
export function smoke(x, y, o = {}) {
  burst(x, y, { shape: 'tex', tex: ['smoke_01', 'smoke_02', 'smoke_03', 'smoke_04', 'smoke_05', 'smoke_06', 'smoke_07'], color: o.color || ['#4a4038', '#6b5f55', '#2e2722'], count: o.count ?? 10, speed: o.speed ?? 1.6, size: o.size ?? 46, grow: o.grow ?? 1.1, add: false, alpha: o.alpha ?? 0.75, life: o.life ?? 1300, gravity: o.gravity ?? -0.03, spin: 0.04, jitter: o.jitter ?? 30, drag: 0.96 });
}
export function flames(x, y, o = {}) {
  burst(x, y, { shape: 'tex', tex: ['flame_01', 'flame_02', 'flame_03', 'flame_04', 'fire_01', 'fire_02'], color: o.color || ['#ff6a1a', '#ffb02a', '#ff3a0a'], count: o.count ?? 18, speed: o.speed ?? 3.5, size: o.size ?? 34, grow: 0.5, angle: -Math.PI / 2, spread: o.spread ?? 1.4, gravity: -0.12, life: o.life ?? 800, spin: 0.08, jitter: o.jitter ?? 30 });
}
export function sparks(x, y, o = {}) {
  burst(x, y, { shape: 'tex', tex: ['spark_01', 'spark_02', 'spark_03', 'spark_04', 'spark_05'], color: o.color || ['#fff3c0', '#ffd27a'], count: o.count ?? 14, speed: o.speed ?? 9, size: o.size ?? 22, life: o.life ?? 500, spin: 0.3 });
}
export function stars(x, y, o = {}) {
  burst(x, y, { shape: 'tex', tex: ['star_01', 'star_02', 'star_03', 'star_04', 'star_05', 'star_06'], color: o.color || ['#fff6d0', '#ffd84a'], count: o.count ?? 12, speed: o.speed ?? 4, size: o.size ?? 18, life: o.life ?? 900, gravity: o.gravity ?? -0.06, spin: 0.15 });
}
export function flare(x, y, color = '#ffd27a', size = 120, life = 380) {
  add({ x, y, shape: 'tex', tex: pickTex(['flare_01', 'light_01', 'light_02']), color, size, life, grow: 0.4, drag: 1, rot: Math.random() * 6 });
}
export function slashFx(x, y, color = '#ffffff', size = 110) {
  add({ x, y, shape: 'tex', tex: pickTex(['slash_01', 'slash_02', 'slash_03', 'slash_04']), color, size, life: 420, drag: 1, rot: Math.random() * 6, grow: 0.3 });
}
export function magicSwirl(x, y, color = '#c38bff', size = 90) {
  add({ x, y, shape: 'tex', tex: pickTex(['magic_01', 'magic_02', 'magic_03', 'magic_04', 'magic_05', 'twirl_01', 'twirl_02', 'twirl_03']), color, size, life: 900, drag: 1, vr: 0.08, grow: 0.5 });
}
export function scorch(x, y, size = 90) {
  add({ x, y, shape: 'tex', tex: pickTex(['scorch_01', 'scorch_02']), color: '#140804', size, life: 2600, drag: 1, add: false, alpha: 0.8, rot: Math.random() * 6 });
}

/** A projectile travelling from a to b leaving a trail. Resolves on arrival. */
export function projectile(a, b, o = {}) {
  return new Promise((res0) => {
    const dur = (o.duration ?? 450) / speed;
    let done = false;
    const res = () => { if (!done) { done = true; res0(); } };
    setTimeout(res, dur + 60); // never hang if frames are paused (background tab)
    const t0 = performance.now();
    const arc = o.arc ?? 60;
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const x = a.x + (b.x - a.x) * e;
      const y = a.y + (b.y - a.y) * e - Math.sin(Math.PI * e) * arc;
      if (o.emoji) add({ x, y, shape: 'emoji', text: o.emoji, size: o.size ?? 18, life: 80, add: false, rot: o.spin ? now / 60 : 0, drag: 1 });
      else add({ x, y, size: o.size ?? 16, color: o.color ?? '#ffa040', core: o.core, life: 120, drag: 1 });
      for (let k = 0; k < (o.trail ?? 3); k++) {
        add({ x: x + (Math.random() - 0.5) * 8, y: y + (Math.random() - 0.5) * 8, vx: (Math.random() - 0.5) * 1.5, vy: (Math.random() - 0.5) * 1.5, size: (o.size ?? 16) * 0.6, color: o.trailColor ?? o.color ?? '#ff7a20', life: o.trailLife ?? 350, gravity: o.trailGravity ?? -0.05 });
      }
      if (t < 1 && !done) requestAnimationFrame(step); else res();
    };
    requestAnimationFrame(step);
  });
}
export function beam(a, b, o = {}) {
  const n = 26;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    add({ x: a.x + (b.x - a.x) * t + (Math.random() - 0.5) * (o.jitter ?? 6), y: a.y + (b.y - a.y) * t + (Math.random() - 0.5) * (o.jitter ?? 6), size: o.size ?? 22, color: o.color ?? '#fff6c0', core: '#fff', life: o.life ?? 500, drag: 1 });
  }
}
export function lightning(a, b, color = '#9fe8ff', segments = 10) {
  let px = a.x, py = a.y;
  for (let k = 1; k <= segments; k++) {
    const t = k / segments;
    const x = a.x + (b.x - a.x) * t + (k < segments ? (Math.random() - 0.5) * 40 : 0);
    const y = a.y + (b.y - a.y) * t + (k < segments ? (Math.random() - 0.5) * 40 : 0);
    const n = 6;
    for (let j = 0; j < n; j++) add({ x: px + (x - px) * j / n, y: py + (y - py) * j / n, size: 9, color, core: '#fff', life: 380, drag: 1 });
    px = x; py = y;
  }
}

// ---------- DOM helpers ----------
export function floatText(x, y, text, cls = 'dmg') {
  const el = document.createElement('div');
  el.className = `float-num ${cls}`; el.textContent = text;
  el.style.left = x + 'px'; el.style.top = y + 'px';
  layer.appendChild(el);
  el.animate([
    { transform: 'translate(-50%,-50%) scale(.4)', opacity: 0 },
    { transform: 'translate(-50%,-90%) scale(1.25)', opacity: 1, offset: 0.2 },
    { transform: 'translate(-50%,-140%) scale(1)', opacity: 1, offset: 0.7 },
    { transform: 'translate(-50%,-190%) scale(.9)', opacity: 0 },
  ], { duration: 1300 / speed, easing: 'ease-out' }).onfinish = () => el.remove(); setTimeout(() => el.remove(), 2500);
}
export function splat(x, y, text, heal = false) {
  const el = document.createElement('div');
  el.className = 'splat' + (heal ? ' heal' : '');
  el.textContent = text; el.style.left = x + 'px'; el.style.top = y + 'px';
  layer.appendChild(el);
  el.animate([{ transform: 'translate(-50%,-50%) scale(0) rotate(-20deg)' }, { transform: 'translate(-50%,-50%) scale(1.15) rotate(0deg)', offset: 0.25 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.8 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 0 }], { duration: 1000 / speed }).onfinish = () => el.remove(); setTimeout(() => el.remove(), 2500);
}
export function shake(power = 1) {
  const b = stageEl.querySelector('#board');
  b.animate([
    { transform: 'translate(0,0)' }, { transform: `translate(${-6 * power}px,${3 * power}px)` }, { transform: `translate(${7 * power}px,${-4 * power}px)` },
    { transform: `translate(${-5 * power}px,${2 * power}px)` }, { transform: `translate(${3 * power}px,${-1 * power}px)` }, { transform: 'translate(0,0)' },
  ], { duration: 380 / speed });
}
export function flash(color = 'rgba(255,255,255,.7)', dur = 300) {
  const el = document.createElement('div');
  el.style.cssText = `position:absolute;inset:0;background:${color};pointer-events:none;z-index:84`;
  layer.appendChild(el);
  el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: dur / speed }).onfinish = () => el.remove(); setTimeout(() => el.remove(), 2500);
}
export async function banner(text, cls = '', dur = 1100) {
  const el = document.createElement('div');
  el.className = 'banner ' + cls; el.textContent = text;
  layer.appendChild(el);
  el.animate([
    { transform: 'scaleY(0)', opacity: 0 }, { transform: 'scaleY(1.1)', opacity: 1, offset: 0.15 }, { transform: 'scaleY(1)', opacity: 1, offset: 0.25 },
    { transform: 'scaleY(1)', opacity: 1, offset: 0.8 }, { transform: 'scaleY(0)', opacity: 0 },
  ], { duration: dur / speed, easing: 'ease-out' });
  await wait(dur);
  el.remove();
}

// ---------- combat & summon effects ----------
const PAL = { gold: ['#fff4c8', '#ffd27a', '#ff9a3a'], fire: ['#ffe0a0', '#ff6a2a', '#d81e0a'], death: ['#e6c8ff', '#a050ff', '#3a0b6b'] };
/** Motion streak along an attack path. */
export function streak(a, b, kind = 'gold') {
  const col = PAL[kind] || PAL.gold;
  const n = 22;
  for (let k = 0; k < n; k++) {
    const t = k / n;
    add({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, size: 10 + 8 * t, color: col[1], core: col[0], life: 160 + t * 220, drag: 1 });
  }
}
/** Heavy impact: flash, shockwave, sparks, debris. */
export function impact(x, y, kind = 'gold') {
  const col = PAL[kind] || PAL.gold;
  flare(x, y, col[1], 150, 320);
  slashFx(x, y, col[0], 120);
  sparks(x, y, { color: col.slice(0, 2), count: 16 });
  glow(x, y, col[1], 120, 260);
  add({ x, y, size: 60, color: col[0], core: '#ffffff', life: 140, drag: 1, grow: 0.5 });
  ring(x, y, col[0], 16, 420, 5, 6);
  burst(x, y, { color: col, shape: 'spark', count: 34, speed: 13, life: 520 });
  burst(x, y, { color: ['#6b5440', '#a88a6a'], shape: 'shard', count: 10, speed: 6, gravity: 0.35, add: false, size: 5, spin: 0.4, life: 700 });
}
/** Dust cloud when something lands on the table. */
export function dust(x, y, power = 1) {
  smoke(x, y, { color: ['#a8906e', '#8a7458', '#c4ad8a'], count: Math.round(10 * power), speed: 3.2 * power, size: 40 * power, alpha: 0.55, life: 1100, gravity: -0.01, jitter: 50 });
  burst(x, y, { shape: 'tex', tex: ['dirt_01', 'dirt_02', 'dirt_03'], color: ['#6b5440', '#4a3a2a'], count: Math.round(6 * power), speed: 5, gravity: 0.25, add: false, size: 14, spin: 0.3, life: 700 });
  burst(x, y, { color: ['rgba(190,160,120,.9)', 'rgba(140,115,85,.9)', 'rgba(220,200,170,.9)'], count: Math.round(22 * power), speed: 5 * power, angle: Math.PI, spread: Math.PI, gravity: -0.02, add: false, size: 16 * power, grow: 1.6, life: 900, drag: 0.9, alpha: 0.55, jitter: 40 });
  burst(x, y, { color: ['#d8c3a0', '#8a7055'], shape: 'shard', count: Math.round(10 * power), speed: 5, gravity: 0.3, add: false, size: 4, spin: 0.4, life: 600 });
}
/** Rotating light rays (legendary arrivals). */
export function rays(x, y, color = '#ffd84a') {
  const el = document.createElement('div');
  el.style.cssText = `position:absolute;left:${x - 220}px;top:${y - 220}px;width:440px;height:440px;pointer-events:none;z-index:44;border-radius:50%;background:repeating-conic-gradient(from 0deg, ${color}55 0 5deg, transparent 5deg 20deg);-webkit-mask:radial-gradient(circle,#000 0 15%,transparent 62%);mask:radial-gradient(circle,#000 0 15%,transparent 62%);mix-blend-mode:screen`;
  layer.appendChild(el);
  el.animate([{ transform: 'scale(.3) rotate(0deg)', opacity: 0 }, { transform: 'scale(1) rotate(40deg)', opacity: 1, offset: 0.3 }, { transform: 'scale(1.2) rotate(110deg)', opacity: 0 }], { duration: 1500 / speed, easing: 'ease-out' });
  setTimeout(() => el.remove(), 1550 / speed);
}
/** Healing: rising green motes and a soft column of light. */
export function healFx(x, y) {
  stars(x, y, { color: ['#d8ffe0', '#6dff95'], count: 14 });
  magicSwirl(x, y, '#6dff95', 80);
  glow(x, y, 'rgba(110,255,150,.55)', 90, 600);
  for (let k = 0; k < 26; k++) add({ x: x + (Math.random() - 0.5) * 70, y: y + 30 + Math.random() * 30, vy: -1.2 - Math.random() * 1.8, vx: (Math.random() - 0.5) * 0.4, size: 5 + Math.random() * 5, color: '#6dff95', core: '#eaffef', life: 900, drag: 0.99 });
  ring(x, y, '#9dffb5', 30, 600, 1.5, 4);
}

// ---------- named presets ----------
const C = {
  fire: ['#ff4d1a', '#ff8c1a', '#ffd23a'], holy: ['#fff2a8', '#ffd84a', '#ffffff'], dark: ['#7a2bd9', '#3a0b6b', '#c38bff'],
  blood: ['#b3001b', '#e0202a', '#5a0008'], nature: ['#4fd17a', '#a8ff6a', '#1f8a3a'], ice: ['#9fe8ff', '#ffffff', '#4aa8ff'],
  gold: ['#ffd84a', '#fff1a8', '#e2a71e'], poison: ['#7fff3a', '#2a8a0b', '#c8ff8a'], smoke: ['#666', '#999', '#444'],
};
function at(pt) { return pt || { x: W / 2, y: H / 2 }; }

/**
 * Play a named effect. src/tgts are points {x,y} (tgts array). Returns a promise.
 * Unknown names fall back to a style guessed from the name.
 */
const FX_MAP = {"heal": "heal", "draw": "draw", "revive": "revive", "coins": "quietcoin", "levelUp": "buff", "rage": "rage", "bloodBite": "blood", "web": "web", "transform": "smoke", "supply": "coin", "sacrifice": "blood", "ratSwarm": "rat", "raiseDead": "revive", "fireWall": "firewall", "explosion": "explosion", "coffin": "dark", "claws": "claw", "charm": "charm", "wish": "holy", "whip": "whip", "warmWelcome": "buff", "wallRun": "smoke", "visions": "curse", "vet": "heal", "vampireValues": "magic", "treeFamily": "nature", "tongue": "stun", "theft": "coin", "telekinesis": "smoke", "teamPlayer": "buff", "swordSlash": "execute", "swordDouble": "buff", "swearSong": "song", "swampChild": "nature", "summonMinions": "summon", "sunPalms": "holy", "stone": "ward", "squirrels": "squirrel", "spy": "smoke", "spreadingFire": "fire", "speakDead": "dark", "sneakAttack": "dagger", "smuggle": "coin", "smoke": "smoke", "shrug": "ward", "shipwreck": "coin", "shaman": "nature", "runToMom": "smoke", "reveal": "draw", "release": "smoke", "reincarnation": "revive", "reincarnationEnd": "smoke", "ratSwarmBuff": "buff", "ramPlace": "explosion", "ramLeap": "strike", "ram": "explosion", "rally": "buff", "raid": "execute", "qualityGuarantee": "equip", "quake": "quake", "protect": "ward", "prophecy": "draw", "prey": "blood", "pigeonRiot": "pigeon", "peculiarTastes": "dark", "payment": "coin", "orcGang": "strike", "necroBolt": "necro", "motivation": "rage", "motherCare": "heal", "merchants": "coin", "massacre": "massacre", "luxury": "coin", "luckyBet": "coin", "luck": "ward", "lightBeam": "holy", "lickWounds": "heal", "lastMoment": "massacre", "kunai": "dagger", "knives": "dagger", "kickOut": "smoke", "jesterPoster": "festival", "jesterFinale": "festival", "jester": "festival", "janusWisdom": "draw", "inspiringVerse": "song", "inspiringSpeech": "song", "inspect": "draw", "hunt": "execute", "hunger": "blood", "humiliate": "curse", "horseGossip": "song", "hoofKick": "strike", "holyFire": "holyfire", "hide": "smoke", "herbs": "nature", "healingWord": "heal", "hellBlade": "hellfire", "guard": "ward", "grenade": "explosion", "goatSummon": "goat", "gnomeAmbush": "summon", "genius": "draw", "forge": "equip", "foresight": "draw", "forcedMarch": "rage", "festival": "festival", "feedChildren": "blood", "feedBody": "blood", "feast": "buff", "fan": "charm", "family": "buff", "execute": "execute", "equip": "equip", "elfSalt": "magic", "dungeon": "dark", "drill": "whip", "drain": "blood", "dragonFire": "dragon", "divine": "holy", "dirtyTrick": "smoke", "diablerie": "dark", "destroyCamp": "explosion", "demonDeal": "hellfire", "darkOrb": "dark", "dagger": "dagger", "cruelty": "rage", "cringe": "curse", "coordinated": "strike", "charge": "strike", "catchShot": "ward", "catSummon": "cat", "catRope": "cat", "burrow": "quake", "breakDoor": "explosion", "breadCrumble": "bread", "breadCopy": "bread", "copy": "bread", "borscht": "heal", "bloodRush": "blood", "bloodBar": "blood", "birchAllergy": "stun", "bianca": "dark", "berries": "heal", "bearFight": "claw", "fight": "claw", "batSwarm": "bat", "axe": "axe", "awaken": "revive", "assassinate": "execute", "arena": "festival", "agility": "buff", "abyss": "abyss", "absorb": "dark", "defense": "ward", "destroy": "execute"};
const FX_ALIAS = {"heal": "heal", "draw": "draw", "revive": "revive", "coin": "coin", "buff": "buff", "blood": "blood", "smoke": "smoke", "rat": "rat", "firewall": "firewall", "explosion": "explosion", "dark": "dark", "claw": "claw", "charm": "charm", "holy": "light", "nature": "nature", "stun": "stun", "squirrel": "squirrel", "fire": "fire", "execute": "execute", "equip": "equip", "ward": "ward", "quake": "quake", "pigeon": "pigeon", "massacre": "massacre", "festival": "festival", "goat": "goat", "cat": "cat", "bread": "bread", "bat": "bat", "magic": "zzmagic"};
export async function preset(name, src, tgts = [], info = {}) {
  const s = at(src);
  const T = tgts.length ? tgts : [s];
  const kind = FX_MAP[name];
  const n = kind ? (FX_ALIAS[kind] || '#' + kind) : (name || '').toLowerCase();
  const pick = (re) => re.test(n);
  // Exact kinds from FX_MAP.
  if (n === '#quietcoin') { for (const t of T) { glow(t.x, t.y, 'rgba(255,215,90,.55)', 70, 400); burst(t.x, t.y, { color: ['#ffe08a', '#fff'], count: 10, speed: 3, size: 5, gravity: -0.08 }); } await wait(120); return; }
  if (n === '#dragon') {
    sfx.fire(s.x); sfx.explosion(T[0]?.x);
    for (const t of T) { for (let k = 0; k < 3; k++) projectile(s, t, { color: '#ff5a1a', core: '#fff2a0', size: 30 - k * 6, trail: 8, trailColor: '#ff2a0a', duration: 520 + k * 60, arc: 20 + k * 30 }); }
    await wait(560);
    for (const t of T) { burst(t.x, t.y, { color: C.fire, count: 90, speed: 13, size: 18 }); ring(t.x, t.y, '#ffb347', 30, 800, 6, 10); }
    flash('rgba(255,120,30,.45)', 400); shake(2.6); await wait(300); return;
  }
  if (n === '#holyfire' || n === '#hellfire') {
    const hell = n === '#hellfire';
    sfx.fire(s.x); if (!hell) sfx.magic(s.x); else sfx.dark(s.x);
    for (const t of T) await projectile(s, t, { color: hell ? '#ff3a0a' : '#ffd84a', core: '#ffffff', size: 24, trail: 6, trailColor: hell ? '#8a0a00' : '#ff9a2a', duration: 460 });
    for (const t of T) { burst(t.x, t.y, { color: hell ? ['#ff3a0a', '#8a0a00', '#ffb070'] : ['#fff6c0', '#ffd84a', '#ff8a2a'], count: 50, speed: 9, size: 14 }); glow(t.x, t.y, hell ? 'rgba(255,40,0,.6)' : 'rgba(255,220,120,.7)', 130, 500); }
    shake(1.2); await wait(250); return;
  }
  if (n === '#necro') {
    sfx.dark(s.x);
    for (const t of T) { lightning(s, t, '#7dffb0'); lightning(s, t, '#2aff7a'); burst(t.x, t.y, { color: ['#7dffb0', '#0a3a1a', '#d0ffe0'], count: 36, speed: 7, size: 11 }); }
    shake(1); await wait(420); return;
  }
  if (n === '#whip') { sfx.slash(s.x); for (const t of T) { for (let k = 0; k < 16; k++) add({ x: s.x + (t.x - s.x) * k / 16, y: s.y + (t.y - s.y) * k / 16 - Math.sin(k / 16 * Math.PI) * 50, size: 6, color: '#c98a4a', core: '#fff', life: 300, drag: 1 }); burst(t.x, t.y, { color: ['#fff', '#ffcf6a'], shape: 'spark', count: 14, speed: 8 }); } await wait(280); return; }
  if (n === '#song') { sfx.buff(s.x); for (const t of T.length ? T : [s]) burst(t.x, t.y, { emoji: ['🎵', '🎶'], shape: 'emoji', count: 8, speed: 3, add: false, size: 12, gravity: -0.12 }); await wait(350); return; }
  if (n === '#summon') { sfx.magic(s.x); for (const t of T) { ring(t.x, t.y, '#b06cff', 50, 800, -0.7, 8); glow(t.x, t.y, 'rgba(176,108,255,.6)', 120, 700); burst(t.x, t.y, { color: ['#d6a8ff', '#7a2bd9', '#fff'], count: 30, speed: 4, size: 8, gravity: -0.08 }); } await wait(420); return; }
  if (n === '#curse') { sfx.debuff(T[0]?.x); for (const t of T) { burst(t.x, t.y - 50, { color: ['#7a2bd9', '#3a0b6b', '#c38bff'], count: 26, speed: 2, size: 12, gravity: 0.2 }); glow(t.x, t.y, 'rgba(120,40,200,.55)', 100, 600); } await wait(380); return; }
  if (n === '#rage') { sfx.buff(T[0]?.x); for (const t of T) { glow(t.x, t.y, 'rgba(255,60,30,.6)', 100, 600); burst(t.x, t.y, { color: ['#ff3a1a', '#ff8a3a', '#fff'], count: 24, speed: 5, size: 8, gravity: -0.1 }); } await wait(300); return; }
  if (n === '#web') { sfx.stun(T[0]?.x); for (const t of T) { await projectile(s, t, { emoji: '🕸️', size: 16, arc: 40 }); burst(t.x, t.y, { emoji: '🕸️', shape: 'emoji', count: 4, speed: 2, add: false, size: 16 }); } return; }
  if (n === '#dagger') { sfx.swing(s.x); for (const t of T) { await projectile(s, t, { emoji: '🗡️', size: 20, trail: 2, trailColor: '#ddd', arc: 40, spin: true, duration: 300 }); burst(t.x, t.y, { color: ['#fff', '#ccc', '#ff6a5a'], shape: 'spark', count: 20, speed: 9 }); sfx.slash(t.x); } return; }
  if (n === '#axe') { sfx.swing(s.x); for (const t of T) { await projectile(s, t, { emoji: '🪓', size: 24, trail: 2, trailColor: '#ccc', arc: 100, spin: true, duration: 420 }); burst(t.x, t.y, { color: ['#fff', '#ccc'], shape: 'spark', count: 22, speed: 10 }); sfx.axe(t.x); shake(1); } return; }
  if (n === '#abyss') { sfx.dark(T[0]?.x); for (const t of T) { ring(t.x, t.y, '#1a0033', 70, 1000, -0.9, 14); glow(t.x, t.y, 'rgba(40,0,80,.8)', 130, 900); burst(t.x, t.y, { color: ['#3a0b6b', '#000', '#7a2bd9'], count: 40, speed: -4, size: 10, add: false }); } await wait(600); return; }
  if (n === '#strike') { sfx.hit(4, T[0]?.x); for (const t of T) impact(t.x, t.y, 'gold'); shake(1.2); await wait(220); return; }
  if (n === 'heal') { sfx.heal(T[0]?.x); for (const t of T) healFx(t.x, t.y); await wait(300); return; }
  // Specific named effects first.
  if (pick(/firewall|огн|wall/)) {
    sfx.fire();
    for (const t of T) burst(t.x, t.y + 30, { color: C.fire, count: 40, speed: 5, angle: -Math.PI / 2, spread: 1.2, gravity: -0.15, life: 900, size: 14 });
    shake(1.2); await wait(500); return;
  }
  if (pick(/holyfire|lightbeam|divine|light|свет|sun/)) {
    sfx.magic();
    for (const t of T) { beam({ x: t.x, y: t.y - 400 }, t, { color: '#fff3b0', size: 30, life: 700 }); burst(t.x, t.y, { color: C.holy, count: 30, speed: 7, size: 10 }); ring(t.x, t.y, '#fff3b0', 25); }
    flash('rgba(255,240,180,.35)', 300); await wait(450); return;
  }
  if (pick(/fire|flame|dragon|burn|blast/)) {
    sfx.fire();
    for (const t of T) await projectile(s, t, { color: '#ff6a1a', core: '#fff2a0', size: 22, trail: 5, trailColor: '#ff3a0a', duration: 420 });
    for (const t of T) { burst(t.x, t.y, { color: C.fire, count: 40, speed: 8, size: 14 }); ring(t.x, t.y, '#ff8a2a', 20); }
    shake(1); await wait(200); return;
  }
  if (pick(/necro|dark|orb|shadow|abyss|curse|vision/)) {
    sfx.dark();
    for (const t of T) { lightning(s, t, '#b06cff'); burst(t.x, t.y, { color: C.dark, count: 30, speed: 6, size: 12 }); }
    if (pick(/abyss/)) for (const t of T) ring(t.x, t.y, '#1a0033', 60, 900, -0.8, 12);
    await wait(450); return;
  }
  if (pick(/axe|kunai|dagger|knife|throw|бросок/)) {
    sfx.swing();
    const emoji = pick(/axe/) ? '🪓' : '🗡️';
    for (const t of T) { await projectile(s, t, { emoji, size: 22, trail: 1, trailColor: '#ccc', arc: 90, spin: true, duration: 380 }); burst(t.x, t.y, { color: ['#fff', '#ccc'], shape: 'spark', count: 18, speed: 9 }); sfx.hit(2); }
    return;
  }
  if (pick(/execut|destroy|kill|казн|assass/)) {
    sfx.slash();
    for (const t of T) {
      for (let k = 0; k < 18; k++) add({ x: t.x - 70 + k * 8, y: t.y - 70 + k * 8, size: 10, color: '#ff2a2a', core: '#fff', life: 400, drag: 1 });
      burst(t.x, t.y, { color: C.blood, count: 30, speed: 7, size: 10, gravity: 0.25 });
    }
    shake(1.4); await wait(400); return;
  }
  if (pick(/quake|earth|ground|дрож/)) {
    sfx.explosion();
    for (const t of T) burst(t.x, t.y + 40, { emoji: ['🪨', '🪨', '💥'], shape: 'emoji', count: 10, speed: 8, angle: -Math.PI / 2, spread: 1.8, gravity: 0.35, add: false, size: 12 });
    shake(2.2); await wait(500); return;
  }
  if (pick(/massacre|lastmoment|последн|apocal/)) {
    sfx.explosion(); flash('rgba(255,40,20,.5)', 600);
    for (const t of T) burst(t.x, t.y, { emoji: ['💀', '🔥'], shape: 'emoji', count: 6, speed: 6, add: false, size: 14 });
    shake(2.5); await wait(600); return;
  }
  if (pick(/rat|крыс/)) {
    sfx.animal();
    for (const t of T) { burst(s.x, s.y, { emoji: '🐀', shape: 'emoji', count: 8, speed: 9, add: false, size: 12, drag: 0.9 }); burst(t.x, t.y, { emoji: '🐀', shape: 'emoji', count: 5, speed: 4, add: false, size: 14 }); }
    await wait(350); return;
  }
  if (pick(/squirrel|бел/)) { sfx.animal(); for (const t of T) burst(t.x, t.y, { emoji: '🐿️', shape: 'emoji', count: 8, speed: 7, add: false, size: 13 }); await wait(350); return; }
  if (pick(/goat|коз/)) { sfx.animal(); for (const t of T) burst(t.x, t.y, { emoji: '🐐', shape: 'emoji', count: 5, speed: 5, add: false, size: 15 }); await wait(300); return; }
  if (pick(/cat|кош|rope|верёв/)) { sfx.swing(); for (const t of T) { await projectile(s, t, { emoji: '🪢', size: 18, spin: true }); burst(t.x, t.y, { emoji: '🐈', shape: 'emoji', count: 4, speed: 5, add: false, size: 15 }); } return; }
  if (pick(/bear|медв|claw|когт/)) {
    sfx.slash();
    for (const t of T) for (let line = 0; line < 3; line++) for (let k = 0; k < 12; k++) add({ x: t.x - 40 + line * 20 + k * 3, y: t.y - 50 + k * 9, size: 7, color: '#ff3b2a', core: '#fff', life: 450, drag: 1 });
    shake(1.2); await wait(350); return;
  }
  if (pick(/bat|челюст|swarm/)) { sfx.dark(); for (const t of T) burst(t.x, t.y, { emoji: '🦇', shape: 'emoji', count: 10, speed: 7, add: false, size: 13 }); await wait(400); return; }
  if (pick(/blood|bite|кров|vamp|drain/)) {
    sfx.blood();
    for (const t of T) { burst(t.x, t.y, { color: C.blood, count: 30, speed: 6, size: 10, gravity: 0.3, add: false }); }
    if (T[0] && src) await projectile(T[0], s, { color: '#c1001c', core: '#ff8a8a', size: 12, trail: 3, trailColor: '#7a0010', arc: 30, duration: 400 });
    return;
  }
  if (pick(/charm|heart|очаров|love/)) { sfx.magic(); for (const t of T) { await projectile(s, t, { emoji: '💗', size: 16 }); burst(t.x, t.y, { emoji: ['💗', '💖'], shape: 'emoji', count: 8, speed: 5, add: false, size: 12, gravity: -0.1 }); } return; }
  if (pick(/smoke|дым|vanish|hide|telekin|bounce|return/)) { sfx.magic(); for (const t of T) burst(t.x, t.y, { color: C.smoke, count: 34, speed: 3, size: 22, add: false, grow: 1.5, life: 900, gravity: -0.05 }); await wait(350); return; }
  if (pick(/pigeon|bird|голуб/)) { sfx.animal(); for (const t of T) burst(t.x, t.y, { emoji: '🕊️', shape: 'emoji', count: 10, speed: 9, add: false, size: 13, gravity: -0.2 }); await wait(450); return; }
  if (pick(/herb|vine|nature|berry|ягод|root|трав|shaman|tree|ёлк/)) { sfx.heal(); for (const t of T) { burst(t.x, t.y, { color: C.nature, count: 30, speed: 4, size: 10, gravity: -0.12 }); burst(t.x, t.y, { emoji: '🍃', shape: 'emoji', count: 6, speed: 4, add: false, size: 11 }); } await wait(350); return; }
  if (pick(/explo|взрыв|bomb|grenade|гранат|ram|таран/)) { sfx.explosion(); for (const t of T) { burst(t.x, t.y, { color: C.fire, count: 60, speed: 11, size: 16 }); burst(t.x, t.y, { color: C.smoke, count: 20, speed: 3, size: 26, add: false, grow: 1.4, life: 1100 }); ring(t.x, t.y, '#ffb347', 30, 700, 5, 8); } shake(2.5); flash('rgba(255,170,60,.4)', 300); await wait(500); return; }
  if (pick(/stun|оглуш|web|паут|lick|язык/)) { sfx.stun(); for (const t of T) burst(t.x, t.y - 30, { emoji: '💫', shape: 'emoji', count: 5, speed: 3, add: false, size: 13 }); await wait(250); return; }
  if (pick(/ward|shield|оберег|protect|stone|indestr/)) { sfx.shield(); for (const t of T) { ring(t.x, t.y, '#9fe8ff', 40, 700, 0.6, 6); burst(t.x, t.y, { color: C.ice, count: 20, speed: 3, size: 8 }); } await wait(300); return; }
  if (pick(/coin|money|gold|монет|treasure|jewel|укра/)) { sfx.coin(); for (const t of T) burst(t.x, t.y, { emoji: '🪙', shape: 'emoji', count: 8, speed: 6, add: false, size: 12, gravity: 0.2 }); await wait(300); return; }
  if (pick(/heal|borscht|борщ|cure|лечит/)) { sfx.heal(); for (const t of T) { burst(t.x, t.y, { color: C.nature, count: 26, speed: 3, size: 9, gravity: -0.15 }); } await wait(300); return; }
  if (pick(/levelup|buff|rally|drill|inspir|feast|застол|речь|motiv|rage|ярост/)) { sfx.buff(); for (const t of T) { ring(t.x, t.y, '#ffd84a', 30, 600, 1.4, 5); burst(t.x, t.y, { color: C.gold, count: 22, speed: 4, size: 8, gravity: -0.1 }); } await wait(300); return; }
  if (pick(/draw|card|plan|search|seek|insight/)) { sfx.draw(); for (const t of T) burst(t.x, t.y, { emoji: '📜', shape: 'emoji', count: 3, speed: 3, add: false, size: 12, gravity: -0.15 }); await wait(250); return; }
  if (pick(/revive|resurrect|воскрес|return|grave|mother|zomb|ghoul|undead/)) { sfx.dark(); for (const t of T) { beam({ x: t.x, y: t.y + 120 }, t, { color: '#7aff9a', size: 18, life: 600 }); burst(t.x, t.y, { color: ['#7aff9a', '#e6ffe0'], count: 20, speed: 3, size: 8, gravity: -0.2 }); } await wait(400); return; }
  if (pick(/charge|fight|strike|hit|удар|бой/)) { sfx.hit(3); for (const t of T) burst(t.x, t.y, { color: ['#fff', '#ffcf6a'], shape: 'spark', count: 24, speed: 10 }); shake(1); await wait(200); return; }
  if (pick(/copy|bread|хлеб|clone/)) { sfx.magic(); for (const t of T) burst(t.x, t.y, { emoji: '🍞', shape: 'emoji', count: 6, speed: 4, add: false, size: 12 }); await wait(300); return; }
  if (pick(/festival|праздн|party/)) { sfx.legend(); burst(W / 2, H / 2, { emoji: ['🎉', '🎊', '🎆'], shape: 'emoji', count: 24, speed: 12, add: false, size: 15, gravity: 0.15 }); await wait(500); return; }
  if (pick(/equip|sword|меч|weapon|staff|посох/)) { sfx.shield(); for (const t of T) { await projectile(s, t, { emoji: '⚔️', size: 16, arc: 40 }); ring(t.x, t.y, '#ffd84a', 30); } return; }
  // Fallback: magic bolt coloured by intent.
  sfx.magic();
  const col = info.harm === false ? C.gold : ['#c38bff', '#7ad1ff', '#ffffff'];
  for (const t of T) {
    if (src && (t.x !== s.x || t.y !== s.y)) await projectile(s, t, { color: col[0], core: '#fff', size: 14, trail: 3, trailColor: col[1], duration: 380 });
    burst(t.x, t.y, { color: col, count: 24, speed: 5, size: 9 });
  }
  await wait(150);
}
