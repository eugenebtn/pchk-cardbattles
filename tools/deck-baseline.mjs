// How often each starter deck wins against the six starters (the same test tools/deck-search.mjs uses).
// Usage: node tools/deck-baseline.mjs → tools/out/decks/baseline.json
import { writeFileSync } from 'node:fs';
import { Game } from '../js/engine/game.js';
import { levelAnswer } from '../js/engine/botlevels.js';
import { DECKS } from '../js/data/decks.js';
function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const G = Object.values(DECKS).map((d) => ({ leader: d.leader, deck: d.main }));
function play(decks, seed) {
  const g = new Game({ seed, players: decks.map((d, i) => ({ name: 'P' + i, leader: d.leader, deck: d.deck })), options: { mulliganBonus: true } });
  const rand = mulberry(seed);
  for (let k = 0; k < 6000 && g.pending && !g.s.over; k++) { const q = g.pending; let a; try { a = levelAnswer(g, q, 'normal', rand); } catch { a = undefined; } if (!g.respond(q.player, a)) g.respond(q.player, q.type === 'main' ? 'end' : q.type === 'priority' ? 'pass' : q.options?.[0]?.id ?? null); }
  return g.s.over ? g.s.winner : null;
}
const out = {};
for (const d of Object.values(DECKS)) {
  let w = 0, n = 0;
  for (let s = 0; s < 40; s++) for (const [gi, opp] of G.entries()) {
    const seat = (s + gi) % 2, me = { leader: d.leader, deck: d.main };
    const r = play(seat ? [opp, me] : [me, opp], (900000 + s) * 13 + gi);
    if (r == null || r === 'draw') continue; n++; if (r === seat) w++;
  }
  out[d.leader] = +(w / n).toFixed(3); console.log(d.title, (w * 100 / n).toFixed(1) + '%');
}
writeFileSync(new URL('./out/decks/baseline.json', import.meta.url), JSON.stringify(out));
