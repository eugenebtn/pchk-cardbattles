// Bot-vs-bot simulator: plays many games to catch crashes, hangs and broken rules.
// Usage: node tests/sim.mjs [games=200] [fuzz=0.3] [deckA] [deckB]
import { Game } from '../js/engine/game.js';
import { botAnswer } from '../js/engine/bot.js';
import { DECKS } from '../js/data/decks.js';

const N = Number(process.argv[2] || 200);
const FUZZ = Number(process.argv[3] ?? 0.3);
const onlyA = process.argv[4], onlyB = process.argv[5];
const keys = Object.keys(DECKS);

function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const stats = { games: 0, errors: 0, hangs: 0, wins: {}, rounds: [] };
const errs = new Map();
for (let k = 0; k < N; k++) {
  const seed = 1000 + k;
  const A = onlyA || keys[k % keys.length], B = onlyB || keys[Math.floor(k / keys.length) % keys.length];
  const rand = mulberry(seed * 7 + 1);
  let g;
  try {
    g = new Game({
      seed,
      players: [
        { name: A, leader: DECKS[A].leader, deck: DECKS[A].main },
        { name: B, leader: DECKS[B].leader, deck: DECKS[B].main },
      ],
      options: { mulliganBonus: k % 2 === 0 },
    });
    let steps = 0;
    while (g.pending && !g.s.over) {
      const q = g.pending;
      const a = botAnswer(g, q, rand, { fuzz: FUZZ });
      if (!g.respond(q.player, a)) throw new Error(`bot gave invalid answer ${JSON.stringify(a)} to ${q.type}: ${q.prompt}`);
      if (++steps > 30000 || g.s.round > 60) { stats.hangs++; break; }
    }
    stats.games++;
    if (g.s.over) { const w = g.s.winner === 'draw' ? 'draw' : (g.s.winner === 0 ? A : B); stats.wins[w] = (stats.wins[w] || 0) + 1; stats.rounds.push(g.s.round); }
  } catch (e) {
    stats.errors++;
    const key = (e.stack || String(e)).split('\n').slice(0, 3).join(' | ');
    if (!errs.has(key)) errs.set(key, { seed, A, B, msg: e.stack, log: g ? g.s.log.slice(-8) : [] });
  }
}
const avg = stats.rounds.length ? (stats.rounds.reduce((a, b) => a + b, 0) / stats.rounds.length).toFixed(1) : '-';
console.log(`games ${stats.games}/${N}, errors ${stats.errors}, hangs ${stats.hangs}, avg rounds ${avg}`);
console.log('wins', stats.wins);
for (const [k, v] of errs) { console.log('\n--- seed', v.seed, v.A, 'vs', v.B); console.log(v.msg.split('\n').slice(0, 8).join('\n')); console.log('log:', v.log.join(' / ')); }
process.exit(stats.errors ? 1 : 0);
