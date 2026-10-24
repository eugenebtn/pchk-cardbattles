// Helpers for card unit tests: build a position, play cards, answer prompts.
import { Game } from '../js/engine/game.js';

export const FILLER = 9; // Ополчение Вёрджинвальда — plain ally used to fill decks

/**
 * makeGame({ p0: {leader, deck}, p1: {...}, first })
 * Waits before the first turn so you can put() cards; toMain() then starts the game.
 * Setup (mulligan) is skipped; hands are empty; each player has 5 coins.
 */
export function makeGame({ p0 = {}, p1 = {}, first = 0, seed = 1 } = {}) {
  const mk = (p, i) => ({ name: `P${i}`, leader: p.leader ?? 20, deck: p.deck ?? Array(20).fill(FILLER) });
  return new Game({ seed, players: [mk(p0, 0), mk(p1, 1)], options: { skipSetup: true, first } });
}

/** Put a card straight onto the battlefield without triggers. Returns the instance. */
export function put(g, p, id, region = null) {
  const c = g.newInst(id, p, 'limbo');
  const d = g.def(c);
  c.enteredAt = ++g.s.uid;
  if (d.type === 'ally' || d.type === 'place') {
    const slot = d.type === 'ally' ? 'ally' : 'place';
    g.P(p).regions[region][slot] = c; c.zone = 'field'; c.region = region; c.slot = slot;
  } else { g.P(p).support.push(c); c.zone = 'support'; }
  const sc = g.script(c);
  if (sc.enterTokens) for (const [t, n] of Object.entries(sc.enterTokens)) c.tok[t] = n;
  return c;
}
export function addHand(g, p, id) { const c = g.newInst(id, p, 'hand'); g.P(p).hand.push(c); return c; }
export function addGrave(g, p, id) { const c = g.newInst(id, p, 'grave'); g.P(p).grave.push(c); return c; }

/** Answer the current request (must belong to `player` if given). */
export function ans(g, a, player = g.pending?.player) {
  const q = g.pending;
  if (!q) throw new Error('no pending request');
  if (!g.respond(player, a)) throw new Error(`answer ${JSON.stringify(a)} rejected for ${q.type} "${q.prompt}" options=${JSON.stringify(q.options.map((o) => o.id))}`);
  return g.pending;
}
/** Take the two draws (default: two coins) to reach the main phase. */
export function toMain(g, picks = ['coin', 'coin']) {
  if (g.pending?.begin) ans(g, 'go');
  while (g.pending && g.pending.type === 'priority') ans(g, 'pass');
  for (const p of picks) { if (g.pending?.type === 'draw') ans(g, p); }
  // Pass any priority windows of the other player.
  while (g.pending && g.pending.type === 'priority') ans(g, 'pass');
  if (g.pending?.type !== 'main') throw new Error('expected main, got ' + g.pending?.type + ' ' + g.pending?.prompt);
}
/** Play a card from hand during main: answers = list of follow-up answers (region, targets...). */
export function play(g, inst, answers = [], side = inst.id) {
  const q = g.pending;
  const id = `play:${inst.uid}:${side}`;
  if (!q.options.some((o) => o.id === id)) throw new Error(`card ${g.name(inst)} not playable now; options: ${q.options.map((o) => o.id).join(',')}`);
  ans(g, id);
  for (const a of answers) {
    if (typeof a === 'function') ans(g, a(g.pending)); else ans(g, a?.uid ?? a);
  }
  passPriority(g);
}
export function useAbility(g, inst, k = 0, answers = []) {
  ans(g, `ab:${inst.uid}:${k}`);
  for (const a of answers) ans(g, typeof a === 'function' ? a(g.pending) : (a?.uid ?? a));
  passPriority(g);
}
/** Pass every open priority window. */
export function passPriority(g) {
  let n = 0;
  while (g.pending?.type === 'priority' && n++ < 50) ans(g, 'pass');
}
/** End the current turn and continue answering with a default policy until `stop(q)` is true. */
export function endTurn(g) { ans(g, 'end'); passPriority(g); }
/** Run the game, answering each request with fn(q) until stop(q). */
export function runUntil(g, stop, fn = (q) => defaultAnswer(q)) {
  for (let k = 0; k < 2000; k++) {
    const q = g.pending;
    if (!q || stop(q)) return q;
    ans(g, fn(q));
  }
  throw new Error('runUntil: too many steps');
}
export function defaultAnswer(q) {
  if (q.type === 'priority') return 'pass';
  if (q.type === 'draw') return 'coin';
  if (q.type === 'main') return 'end';
  if (q.type === 'multi') return q.options.slice(0, q.min).map((o) => o.id);
  if (q.cancel) return null;
  return q.options[0].id;
}
/** Run until the battle of the current round is over (back at the next turn's draw). */
export function runBattle(g, fn) { const r = g.s.round; return runUntil(g, (q) => (q.type === 'draw' && g.s.round > r) || g.s.over, fn); }

let failures = 0, passed = 0;
export function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ', name); }
  catch (e) { failures++; console.log('  FAIL', name, '\n       ', (e.stack || String(e)).split('\n').slice(0, 4).join('\n        ')); }
}
export function eq(a, b, msg = '') { if (a !== b) throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
export function ok(v, msg = 'expected truthy') { if (!v) throw new Error(msg); }
export function done() { console.log(`\n${passed} passed, ${failures} failed`); process.exit(failures ? 1 : 0); }
