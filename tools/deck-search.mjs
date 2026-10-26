// Builds a strong deck for a Leader in a given style by swapping cards and keeping the swaps that win more
// against the six starter decks (rule bot on both sides, seats swapped, the same deals for both versions).
// Usage: node tools/deck-search.mjs <leaderId> <aggro|value|combo> [iterations=160] → tools/out/decks/<leader>_<style>.json
import { mkdirSync, writeFileSync } from 'node:fs';
import { Game } from '../js/engine/game.js';
import { levelAnswer } from '../js/engine/botlevels.js';
import { CARDS } from '../js/data/cards.js';
import { DECKS } from '../js/data/decks.js';

const LEADER = Number(process.argv[2]), STYLE = process.argv[3] || 'aggro', ITERS = Number(process.argv[4] || 160);
const LV = process.env.LV || 'normal';
// The family a «combo» deck is built around, per Leader.
export const TRIBE = { 20: 'ВОИН', 41: 'ЖИВОТНОЕ', 62: 'ВАМПИР', 63: 'ВАМПИР', 117: 'ПЛУТ', 118: 'ТАВЕРНА' };
const POOL = Object.values(CARDS).filter((c) => !c.token && c.type !== 'leader');
const cost = (id) => (typeof CARDS[id].cost === 'number' ? CARDS[id].cost : 3);
function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const R = mulberry(LEADER * 1000 + STYLE.length * 7 + 11);

/** How far the deck is from its style (0 = fits). */
export function styleMiss(cards, style, leader) {
  const n = cards.length, avg = cards.reduce((s, id) => s + cost(id), 0) / n;
  const allies = cards.filter((id) => CARDS[id].type === 'ally').length;
  const slow = cards.filter((id) => ['place', 'item', 'companion'].includes(CARDS[id].type)).length;
  if (style === 'aggro') return Math.max(0, avg - 2.6) * 4 + Math.max(0, 22 - allies) * 0.5;
  if (style === 'value') return Math.max(0, 3.1 - avg) * 4 + Math.max(0, 9 - slow) * 0.5;
  const t = TRIBE[leader];
  const fam = cards.filter((id) => CARDS[id].subtypes.includes(t) || (CARDS[id].talk || []).length).length;
  return Math.max(0, 16 - fam) * 0.5;
}

const GAUNTLET = Object.values(DECKS).map((d) => ({ leader: d.leader, deck: d.main }));
function play(levels, decks, seed) {
  const g = new Game({ seed, players: decks.map((d, i) => ({ name: 'P' + i, leader: d.leader, deck: d.deck })), options: { mulliganBonus: true } });
  const rand = mulberry(seed);
  for (let k = 0; k < 6000 && g.pending && !g.s.over; k++) {
    const q = g.pending;
    let a; try { a = levelAnswer(g, q, levels[q.player], rand); } catch { a = undefined; }
    if (!g.respond(q.player, a) && !g.respond(q.player, q.type === 'main' ? 'end' : q.type === 'priority' ? 'pass' : q.options?.[0]?.id ?? null)) return null;
  }
  return g.s.over ? g.s.winner : null;
}
/** Win share of the deck against the gauntlet on the given deals. */
function fitness(cards, seeds) {
  let w = 0, n = 0;
  for (const s of seeds) for (const [gi, opp] of GAUNTLET.entries()) {
    const seat = (s + gi) % 2;
    const decks = seat ? [opp, { leader: LEADER, deck: cards }] : [{ leader: LEADER, deck: cards }, opp];
    const r = play([LV, LV], decks, s * 13 + gi);
    if (r == null || r === 'draw') continue;
    n++; if (r === seat) w++;
  }
  return n ? w / n : 0;
}
const score = (cards, seeds) => { const f = fitness(cards, seeds); return { f, s: f - styleMiss(cards, STYLE, LEADER) * 0.03 }; };

function mutate(cards) {
  const c = [...cards];
  const k = 1 + Math.floor(R() * 3);
  for (let j = 0; j < k; j++) {
    c.splice(Math.floor(R() * c.length), 1);
    for (let t = 0; t < 50; t++) {
      const id = POOL[Math.floor(R() * POOL.length)].id;
      if (c.filter((x) => x === id).length < 3) { c.push(id); break; }
    }
  }
  return c.sort((a, b) => a - b);
}

if (process.argv[1].endsWith('deck-search.mjs')) {
  const start = Object.values(DECKS).find((d) => d.leader === LEADER);
  let cur = [...(start ? start.main : POOL.slice(0, 40).map((c) => c.id))].slice(0, 40).sort((a, b) => a - b);
  const SEEDS = (r) => Array.from({ length: 14 }, (_, k) => 100000 + r * 97 + k);
  let round = 0, seeds = SEEDS(round), best = score(cur, seeds);
  const t0 = Date.now();
  for (let it = 1; it <= ITERS; it++) {
    const cand = mutate(cur), sc = score(cand, seeds);
    // accept equal-or-better, and now and then a slightly worse one early on (to get out of a dead end)
    const temp = 0.02 * (1 - it / ITERS);
    if (sc.s >= best.s || R() < Math.exp((sc.s - best.s) / Math.max(1e-4, temp)) * 0.3) { cur = cand; best = sc; }
    if (it % 25 === 0) { round++; seeds = SEEDS(round); best = score(cur, seeds); process.stderr.write(`  ${LEADER}/${STYLE} it ${it}: win ${(best.f * 100).toFixed(0)}% miss ${styleMiss(cur, STYLE, LEADER).toFixed(2)} [${Math.round((Date.now() - t0) / 1000)} s]\n`); }
  }
  // final check on fresh deals
  const check = fitness(cur, Array.from({ length: 40 }, (_, k) => 900000 + k));
  mkdirSync(new URL('./out/decks/', import.meta.url), { recursive: true });
  writeFileSync(new URL(`./out/decks/${LEADER}_${STYLE}.json`, import.meta.url), JSON.stringify({ leader: LEADER, style: STYLE, win: +check.toFixed(3), miss: +styleMiss(cur, STYLE, LEADER).toFixed(2), cards: cur }, null, 1));
  console.log(`${LEADER} ${STYLE}: win vs starters ${(check * 100).toFixed(1)}% (fresh deals), style miss ${styleMiss(cur, STYLE, LEADER).toFixed(2)}`);
}
