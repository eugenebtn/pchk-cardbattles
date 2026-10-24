// A finished game rebuilt from seed + answers must end the same way (what replays rely on).
import { Game } from '../js/engine/game.js';
import { botAnswer } from '../js/engine/bot.js';
import { DECKS } from '../js/data/decks.js';
const keys = Object.keys(DECKS);
let bad = 0;
for (let k = 0; k < 24; k++) {
  const A = keys[k % 6], B = keys[(k + 2) % 6];
  const cfg = { seed: 7000 + k, players: [A, B].map((d) => ({ name: d, leader: DECKS[d].leader, deck: DECKS[d].main })), options: { autoPass: ['smart', false], previews: k % 2 === 0, fakeStops: k % 3 === 0 ? [true, true] : null } };
  const g = new Game(cfg);
  while (g.pending && !g.s.over) g.respond(g.pending.player, botAnswer(g, g.pending));
  const r = new Game({ ...cfg, seed: g.seedUsed, options: { ...cfg.options, previews: false } });
  for (const a of g.history) if (!r.pending || !r.respond(r.pending.player, a)) { bad++; break; }
  if (r.s.winner !== g.s.winner || r.s.round !== g.s.round) { bad++; console.log('mismatch', k); }
}
console.log(bad ? `replays FAILED: ${bad}` : 'replays ok: 24 games rebuilt exactly');
process.exit(bad ? 1 : 0);
