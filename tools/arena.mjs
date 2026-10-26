// Bot arena: two computer levels play each other on every pair of decks, seats swapped; prints the win rate.
// Usage: node tools/arena.mjs <levelA> <levelB> [games=60] [deckA] [deckB]
//   levels: novice | normal | strong | master (and any level added to botlevels.js)
//   PCHK_SAMPLES / PCHK_HORIZON env vars tune the search like in the game.
import { Game } from '../js/engine/game.js';
import { levelAnswer } from '../js/engine/botlevels.js';
import { botAnswer, randomAnswer } from '../js/engine/bot.js';
import { DECKS } from '../js/data/decks.js';
import { botAnswer as v1Answer } from './bots/bot_v1.mjs';
// «v1» = the rule bot as it was before the 2026-10-26 upgrade (kept for comparison).
const answer = (g, q, lv, rand) => (lv === 'v1' ? v1Answer(g, q, rand) : levelAnswer(g, q, lv, rand));

const [A = 'strong', B = 'normal', N0 = '60', onlyA, onlyB] = process.argv.slice(2);
const N = Number(N0);
const keys = Object.keys(DECKS);
const decksOf = (k) => (typeof k === 'string' && DECKS[k] ? { leader: DECKS[k].leader, deck: DECKS[k].main, title: DECKS[k].title } : k);
function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Plays one game; levels[i] plays seat i. Returns 0, 1 or 'draw' (and null on a crash). */
export function playGame(levels, decks, seed, { maxSteps = 6000, timing = null } = {}) {
  const g = new Game({ seed, players: decks.map((d, i) => ({ name: 'P' + i, leader: d.leader, deck: d.deck })), options: { mulliganBonus: true } });
  const rand = mulberry(seed * 31 + 7);
  for (let k = 0; k < maxSteps && g.pending && !g.s.over; k++) {
    const q = g.pending;
    const t0 = Date.now();
    let a;
    try { a = answer(g, q, levels[q.player], rand); } catch { a = undefined; }
    if (timing && ['main', 'priority', 'target', 'region', 'pick'].includes(q.type)) { const dt = Date.now() - t0; timing[levels[q.player]] = timing[levels[q.player]] || []; timing[levels[q.player]].push(dt); }
    if (!g.respond(q.player, a)) {
      const fb = [() => botAnswer(g, q, rand), () => randomAnswer(g, q, rand), () => (q.type === 'priority' ? 'pass' : q.type === 'main' ? 'end' : null)];
      if (!fb.some((f) => { try { return g.respond(q.player, f()); } catch { return false; } })) return null;
    }
  }
  return g.s.over ? g.s.winner : null;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1].endsWith('arena.mjs')) {
  let wa = 0, wb = 0, dr = 0, bad = 0;
  const per = {}, timing = {};
  const t0 = Date.now();
  for (let k = 0; k < N; k++) {
    const da = onlyA || keys[k % keys.length], db = onlyB || keys[Math.floor(k / keys.length) % keys.length];
    const swap = k % 2 === 1;
    const levels = swap ? [B, A] : [A, B];
    const decks = swap ? [decksOf(db), decksOf(da)] : [decksOf(da), decksOf(db)];
    const w = playGame(levels, decks, 5000 + k, { timing });
    const aWon = w === (swap ? 1 : 0), bWon = w === (swap ? 0 : 1);
    if (w == null) bad++; else if (w === 'draw') dr++; else if (aWon) wa++; else if (bWon) wb++;
    const key = `${da}`; per[key] = per[key] || [0, 0]; if (aWon) per[key][0]++; per[key][1]++;
    if ((k + 1) % 10 === 0) process.stderr.write(`  ${k + 1}/${N}: ${A} ${wa} – ${wb} ${B}\n`);
  }
  const pct = (x) => Math.round((x * 100) / Math.max(1, wa + wb + dr));
  console.log(`${A} vs ${B}: ${wa}–${wb} (draws ${dr}, broken ${bad}) → ${A} wins ${pct(wa)}%  [${Math.round((Date.now() - t0) / 1000)} s]`);
  console.log('  by deck of', A + ':', Object.entries(per).map(([k, [w, n]]) => `${k} ${w}/${n}`).join(', '));
  for (const [lv, ts] of Object.entries(timing)) { ts.sort((x, y) => x - y); console.log(`  ${lv}: decisions ${ts.length}, median ${ts[ts.length >> 1]} ms, p95 ${ts[Math.floor(ts.length * 0.95)]} ms, max ${ts[ts.length - 1]} ms`); }
}
