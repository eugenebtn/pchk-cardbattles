// The bot arena on all processor cores. Same arguments as tools/arena.mjs:
//   node tools/arena-par.mjs <levelA> <levelB> [games=200] [deckA] [deckB]
// Decks can also be JSON files ({leader, deck:[ids]}) — used by tools/deck-search.mjs.
// As a module: runMatch(A, B, games, {deckA, deckB, workers}) → { wa, wb, dr, bad }.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);

export async function runMatch(A, B, games, { deckA = null, deckB = null, workers = Math.max(1, os.cpus().length - 2), seed0 = 5000, decks = null } = {}) {
  const W = Math.min(workers, games);
  const jobs = Array.from({ length: W }, (_, w) => new Promise((res, rej) => {
    const ks = []; for (let k = w; k < games; k += W) ks.push(k);
    const wk = new Worker(SELF, { workerData: { A, B, ks, deckA, deckB, seed0, decks } });
    wk.on('message', res); wk.on('error', rej);
  }));
  const parts = await Promise.all(jobs);
  const out = { wa: 0, wb: 0, dr: 0, bad: 0, per: {} };
  for (const p of parts) { out.wa += p.wa; out.wb += p.wb; out.dr += p.dr; out.bad += p.bad; for (const [k, [w, n]] of Object.entries(p.per)) { out.per[k] = out.per[k] || [0, 0]; out.per[k][0] += w; out.per[k][1] += n; } }
  return out;
}

if (!isMainThread) {
  const { playGame } = await import('./arena.mjs');
  // PCHK_FITS=file.json ({name: weights}) makes «strong/F<name>» use those fitted weights.
  if (process.env.PCHK_FITS) { const { registerFit } = await import('../js/engine/botlevels.js'); const { readFileSync } = await import('node:fs'); for (const [k, w] of Object.entries(JSON.parse(readFileSync(process.env.PCHK_FITS, 'utf8')))) registerFit(k, w); }
  const { DECKS } = await import('../js/data/decks.js');
  const { A, B, ks, deckA, deckB, seed0, decks } = workerData;
  // decks: optional list of decks to cycle through instead of the six starter ones
  const pool = decks || Object.keys(DECKS).map((k) => ({ key: k, leader: DECKS[k].leader, deck: DECKS[k].main }));
  const r = { wa: 0, wb: 0, dr: 0, bad: 0, per: {} };
  for (const k of ks) {
    const da = deckA || pool[k % pool.length], db = deckB || pool[Math.floor(k / pool.length) % pool.length];
    const swap = k % 2 === 1;
    const w = playGame(swap ? [B, A] : [A, B], swap ? [db, da] : [da, db], seed0 + k);
    const aWon = w === (swap ? 1 : 0), bWon = w === (swap ? 0 : 1);
    if (w == null) r.bad++; else if (w === 'draw') r.dr++; else if (aWon) r.wa++; else if (bWon) r.wb++;
    const key = da.key || 'A'; r.per[key] = r.per[key] || [0, 0]; if (aWon) r.per[key][0]++; r.per[key][1]++;
  }
  parentPort.postMessage(r);
} else if (process.argv[1] && process.argv[1].endsWith('arena-par.mjs')) {
  const [A = 'strong', B = 'normal', N0 = '200'] = process.argv.slice(2);
  const t0 = Date.now();
  const r = await runMatch(A, B, Number(N0));
  const n = r.wa + r.wb + r.dr;
  console.log(`${A} vs ${B}: ${r.wa}–${r.wb} (draws ${r.dr}, broken ${r.bad}) → ${A} wins ${Math.round((r.wa * 100) / Math.max(1, n))}% ±${Math.round(100 / Math.sqrt(Math.max(1, n)))}  [${Math.round((Date.now() - t0) / 1000)} s]`);
  console.log('  by deck of', A + ':', Object.entries(r.per).map(([k, [w, m]]) => `${k} ${w}/${m}`).join(', '));
}
