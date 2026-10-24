// All deck pairs (main + sideboard variants), random bots with fuzz.
import { Game } from '../js/engine/game.js';
import { botAnswer } from '../js/engine/bot.js';
import { DECKS } from '../js/data/decks.js';
const N = Number(process.argv[2] || 20), FUZZ = Number(process.argv[3] ?? 0.4);
const keys = Object.keys(DECKS);
function mul(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
let games = 0, errors = 0, hangs = 0; const wins = {}; const errs = new Map();
for (const A of keys) for (const B of keys) for (let k = 0; k < N; k++) {
  const seed = 50000 + games;
  const rand = mul(seed);
  // Half of the games use a deck with the sideboard swapped in for variety.
  const deck = (d, alt) => alt && d.side.length ? [...d.main.slice(d.side.length), ...d.side] : d.main;
  let g;
  try {
    g = new Game({ seed, players: [{ name: A, leader: DECKS[A].leader, deck: deck(DECKS[A], k % 2) }, { name: B, leader: DECKS[B].leader, deck: deck(DECKS[B], k % 3 === 0) }], options: { mulliganBonus: k % 2 === 0, allWindows: k % 4 === 0 } });
    let steps = 0;
    while (g.pending && !g.s.over) {
      const q = g.pending;
      const a = botAnswer(g, q, rand, { fuzz: FUZZ });
      if (!g.respond(q.player, a)) throw new Error(`invalid answer ${JSON.stringify(a)} for ${q.type} "${q.prompt}"`);
      if (++steps > 40000 || g.s.round > 80) { hangs++; if (!errs.has('hang ' + A + B)) errs.set('hang ' + A + B, { seed, A, B, msg: 'HANG at round ' + g.s.round + ' pending ' + q.type + ' ' + q.prompt, log: g.s.log.slice(-6) }); break; }
    }
    games++;
    if (g.s.over) { const w = g.s.winner === 'draw' ? 'draw' : g.s.winner === 0 ? A : B; wins[w] = (wins[w] || 0) + 1; }
  } catch (e) {
    errors++; games++;
    const key = (e.stack || String(e)).split('\n').slice(0, 2).join(' | ');
    if (!errs.has(key)) errs.set(key, { seed, A, B, msg: e.stack, log: g ? g.s.log.slice(-6) : [] });
  }
}
console.log(`games ${games}, errors ${errors}, hangs ${hangs}`);
console.log('wins', wins);
for (const v of errs.values()) { console.log('\n---', v.seed, v.A, 'vs', v.B); console.log(String(v.msg).split('\n').slice(0, 7).join('\n')); console.log('log:', v.log.join(' / ')); }
process.exit(errors ? 1 : 0);
