// Fits the position score from games: plays many rule-bot games, notes the board at the start of every round
// and who won in the end, and fits a logistic regression (win chance from the board numbers).
// Usage: node tools/fit-eval.mjs [games=6000] [level=normal] → writes js/engine/evalfit.js
import { writeFileSync } from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Game } from '../js/engine/game.js';
import { levelAnswer, features, featuresX, FEAT_NAMES, FEAT_X_NAMES } from '../js/engine/botlevels.js';
// FIT_X=1: the finer evaluation (more numbers); FIT_OUT=file: where to write (default js/engine/evalfit.js)
const FX = !!process.env.FIT_X, feat = FX ? featuresX : features;
import { botAnswer } from '../js/engine/bot.js';
import { DECKS } from '../js/data/decks.js';

const N = Number(isMainThread ? process.argv[2] || 6000 : 0), LV = isMainThread ? process.argv[3] || 'normal' : workerData.LV;
const keys = Object.keys(DECKS);
function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// Games are played on all cores; each worker sends back its boards and results.
function collect(from, to, LV) {
  const X = [], Y = [];
  for (let k = from; k < to; k++) {
    const A = DECKS[keys[k % 6]], B = DECKS[keys[Math.floor(k / 6) % 6]];
    const g = new Game({ seed: 70000 + k, players: [A, B].map((d, i) => ({ name: 'P' + i, leader: d.leader, deck: d.main })), options: { mulliganBonus: true } });
    const rand = mulberry(k + 3);
    const rows = []; let round = 0;
    for (let n = 0; n < 6000 && g.pending && !g.s.over; n++) {
      if (g.s.round !== round) { round = g.s.round; if (round > 1) rows.push([feat(g, 0), feat(g, 1)]); }
      const q = g.pending;
      // a little noise so that the games cover more kinds of boards
      let a; try { a = rand() < 0.08 ? botAnswer(g, q, rand, { fuzz: 1 }) : levelAnswer(g, q, LV, rand); } catch { a = undefined; }
      if (!g.respond(q.player, a)) g.respond(q.player, q.type === 'main' ? 'end' : q.type === 'priority' ? 'pass' : q.options?.[0]?.id ?? null);
    }
    if (!g.s.over || g.s.winner === 'draw') continue;
    for (const [f0, f1] of rows) { X.push(f0); Y.push(g.s.winner === 0 ? 1 : 0); X.push(f1); Y.push(g.s.winner === 1 ? 1 : 0); }
  }
  return { X, Y };
}
if (!isMainThread) { parentPort.postMessage(collect(workerData.from, workerData.to, workerData.LV)); }
else {
const W = Math.max(1, os.cpus().length - 2), per = Math.ceil(N / W);
const parts = await Promise.all(Array.from({ length: W }, (_, w) => new Promise((res, rej) => { const wk = new Worker(fileURLToPath(import.meta.url), { workerData: { from: w * per, to: Math.min(N, (w + 1) * per), LV } }); wk.on('message', res); wk.on('error', rej); })));
const X = parts.flatMap((p) => p.X), Y = parts.flatMap((p) => p.Y);
const D = X[0].length, M = X.length;
const mu = Array(D).fill(0), sd = Array(D).fill(0);
for (const x of X) x.forEach((v, j) => { mu[j] += v / M; });
for (const x of X) x.forEach((v, j) => { sd[j] += (v - mu[j]) ** 2 / M; });
for (let j = 0; j < D; j++) sd[j] = Math.sqrt(sd[j]) || 1;
const Z = X.map((x) => x.map((v, j) => (v - mu[j]) / sd[j]));
// hold out 15% to check that it predicts games it has not seen
const cut = Math.floor(M * 0.85);
let w = Array(D).fill(0), b = 0;
const lr = 0.3, l2 = 1e-4;
for (let it = 0; it < 400; it++) {
  const gw = Array(D).fill(0); let gb = 0;
  for (let i = 0; i < cut; i++) { let z = b; for (let j = 0; j < D; j++) z += w[j] * Z[i][j]; const e = 1 / (1 + Math.exp(-z)) - Y[i]; for (let j = 0; j < D; j++) gw[j] += e * Z[i][j]; gb += e; }
  for (let j = 0; j < D; j++) w[j] -= lr * (gw[j] / cut + l2 * w[j]); b -= lr * gb / cut;
}
let ok = 0, ll = 0;
for (let i = cut; i < M; i++) { let z = b; for (let j = 0; j < D; j++) z += w[j] * Z[i][j]; const p = 1 / (1 + Math.exp(-z)); if ((p > 0.5) === (Y[i] === 1)) ok++; ll += -Math.log(Y[i] ? p : 1 - p); }
const raw = w.map((v, j) => v / sd[j]);
const bias = b - w.reduce((s, v, j) => s + (v * mu[j]) / sd[j], 0);
const names = FX ? [...FEAT_NAMES, 'first', ...FEAT_X_NAMES] : [...FEAT_NAMES, 'first'];
console.log(`positions ${M} from ${N} games; held-out accuracy ${(ok * 100 / (M - cut)).toFixed(1)}%, log-loss ${(ll / (M - cut)).toFixed(3)}`);
console.log(names.map((n, j) => `${n} ${raw[j].toFixed(3)}`).join(', '));
const out = [...raw.map((v) => +v.toFixed(4)), +bias.toFixed(4)];
writeFileSync(process.env.FIT_OUT || new URL('../js/engine/evalfit.js', import.meta.url), `// Fitted by tools/fit-eval.mjs (${new Date().toISOString().slice(0, 10)}, ${N} games, ${M} positions; held-out accuracy ${(ok * 100 / (M - cut)).toFixed(1)}%).\n// Order: ${names.join(', ')}, bias.\nexport const EVAL_FIT = ${JSON.stringify(out)};\n`);
}
