// How much the strong builds add: for each Leader, the computer with its strong builds plays the same Leader's starter deck.
//   node tools/build-vs-starter.mjs [gamesPerLeader=50] [level=strong]
import { runMatch } from './arena-par.mjs';
import { DECKS } from '../js/data/decks.js';
import { BOT_DECKS } from '../js/data/botdecks.js';
const N = Number(process.argv[2] || 50), L = process.argv[3] || 'strong';
let w = 0, n = 0;
for (const [key, d] of Object.entries(DECKS)) {
  const builds = BOT_DECKS.filter((b) => b.leader === d.leader);
  let wl = 0, nl = 0;
  for (const [k, b] of builds.entries()) {
    const games = Math.round(N / builds.length);
    const r = await runMatch(L, L, games, { deckA: { key: b.key, leader: b.leader, deck: b.cards }, deckB: { key, leader: d.leader, deck: d.main }, seed0: 7000 + k * 1000 });
    wl += r.wa; nl += r.wa + r.wb + r.dr;
  }
  w += wl; n += nl;
  console.log(`${key}: strong build wins ${wl}/${nl} = ${Math.round((wl * 100) / nl)}%`);
}
console.log(`all: ${w}/${n} = ${Math.round((w * 100) / n)}%`);
