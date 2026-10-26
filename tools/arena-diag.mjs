// What a level does in its games: coins left at the end of its turns, cards played, hand size, draw choices.
// Usage: node tools/arena-diag.mjs <level> <vsLevel> [games=12]
import { Game } from '../js/engine/game.js';
import { levelAnswer } from '../js/engine/botlevels.js';
import { DECKS } from '../js/data/decks.js';

const [L = 'strong', V = 'normal', N0 = '12'] = process.argv.slice(2);
const keys = Object.keys(DECKS);
function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const st = { [L]: { ends: 0, coinsLeft: 0, plays: 0, turns: 0, hand: 0, draws: {}, pass: 0, prio: 0, rounds: 0 }, [V]: { ends: 0, coinsLeft: 0, plays: 0, turns: 0, hand: 0, draws: {}, pass: 0, prio: 0 } };
let rounds = 0;
for (let k = 0; k < Number(N0); k++) {
  const levels = k % 2 ? [V, L] : [L, V];
  const da = DECKS[keys[k % keys.length]], db = DECKS[keys[(k * 5 + 1) % keys.length]];
  const g = new Game({ seed: 900 + k, players: [da, db].map((d, i) => ({ name: 'P' + i, leader: d.leader, deck: d.main })), options: { mulliganBonus: true } });
  const rand = mulberry(k + 1);
  for (let n = 0; n < 6000 && g.pending && !g.s.over; n++) {
    const q = g.pending, lv = levels[q.player], S = st[lv];
    const a = levelAnswer(g, q, lv, rand);
    if (q.type === 'main') {
      const o = q.options.find((x) => x.id === a);
      if (a === 'end') { S.ends++; S.coinsLeft += g.P(q.player).coins; S.hand += g.P(q.player).hand.length; S.unplayable = (S.unplayable || 0) + (q.options.some((x) => x.kind === 'play') ? 1 : 0); }
      else if (o?.kind === 'play') S.plays++;
    }
    if (q.type === 'draw') S.draws[a] = (S.draws[a] || 0) + 1;
    if (q.type === 'priority' && q.options.some((x) => x.id !== 'pass')) { S.prio++; if (a === 'pass') S.pass++; }
    if (!g.respond(q.player, a)) g.respond(q.player, q.type === 'main' ? 'end' : q.type === 'priority' ? 'pass' : q.options?.[0]?.id ?? null);
  }
  rounds += g.s.round;
}
for (const [lv, S] of Object.entries(st)) console.log(`${lv}: per turn end — coins left ${(S.coinsLeft / S.ends).toFixed(2)}, hand ${(S.hand / S.ends).toFixed(1)}, ended with a playable card ${S.unplayable}/${S.ends}; plays ${S.plays}; draws ${JSON.stringify(S.draws)}; passed ${S.pass}/${S.prio} chances to answer`);
console.log('avg rounds', (rounds / Number(N0)).toFixed(1));
