// Levels against each other: node tests/levels.mjs <games per pair> <levelA> <levelB>
import { Game } from '../js/engine/game.js';
import { levelAnswer } from '../js/engine/botlevels.js';
import { DECKS } from '../js/data/decks.js';
const N = Number(process.argv[2] || 6), LA = process.argv[3] || 'strong', LB = process.argv[4] || 'normal';
const keys = Object.keys(DECKS);
function mul(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
let games = 0, winA = 0, winB = 0, draws = 0, errors = 0, slowest = 0, totalMs = 0, decisions = 0;
for (let k = 0; k < N; k++) for (const A of keys) {
  const B = keys[(keys.indexOf(A) + 1 + k) % keys.length];
  const seed = 90000 + games, rand = mul(seed);
  // Swap seats every other game so going first doesn't decide it.
  const aSeat = k % 2;
  const lv = aSeat === 0 ? [LA, LB] : [LB, LA];
  const decks = aSeat === 0 ? [A, B] : [B, A];
  try {
    const g = new Game({ seed, players: decks.map((d) => ({ name: d, leader: DECKS[d].leader, deck: DECKS[d].main })), options: { mulliganBonus: true } });
    let steps = 0; const t0g = performance.now();
    while (g.pending && !g.s.over && ++steps < 20000 && g.s.round < 60) {
      const q = g.pending;
      const t0 = performance.now();
      const a = levelAnswer(g, q, lv[q.player], rand);
      const ms = performance.now() - t0;
      if (lv[q.player] === 'strong') { totalMs += ms; decisions++; slowest = Math.max(slowest, ms); }
      if (!g.respond(q.player, a)) throw new Error(`invalid ${JSON.stringify(a)} for ${q.type} ${q.prompt}`);
      if (performance.now() - t0g > 30000) { console.log('SLOW', seed, decks, lv, 'round', g.s.round, 'steps', steps, q.type, q.prompt, '|', g.s.log.slice(-3).join(' / ')); break; }
    }
    games++;
    if (g.s.winner === 'draw' || !g.s.over) draws++;
    else if (g.s.winner === aSeat) winA++; else winB++;
  } catch (e) { errors++; games++; console.log(String(e.stack).split('\n').slice(0, 4).join('\n')); }
}
console.log(`${LA} vs ${LB}: games ${games}, ${LA} won ${winA}, ${LB} won ${winB}, draws/unfinished ${draws}, errors ${errors}`);
if (decisions) console.log(`strong: ${decisions} decisions, avg ${(totalMs / decisions).toFixed(1)} ms, slowest ${slowest.toFixed(0)} ms`);
