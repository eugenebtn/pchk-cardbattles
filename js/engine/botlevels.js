// Computer difficulty levels.
//  novice — plays simple: often a random move, never answers in the opponent's turn, sometimes ends the turn early.
//  normal — the rule-based bot from bot.js.
//  strong — tries each option on a copy of the game (the game is deterministic: same seed + same answers),
//           plays it out to the end of that action and keeps the option that leaves the best board.
//           The copy gets shuffled decks and new dice, so the computer does not peek at the future.
// Adaptive: the level moves up after the player's wins and down after losses (stored in the browser).
import { Game, rng } from './game.js';
import { botAnswer } from './bot.js';
import { EVAL_FIT } from './evalfit.js';

// «master» (more copies, two moves deep) is kept for tools/arena.mjs: it measured no stronger than «strong».
export const LEVELS = ['novice', 'normal', 'strong'];
export const LEVEL_RU = { novice: 'Новичок', normal: 'Обычный', strong: 'Сильный', master: 'Мастер', auto: 'Подстраиваться' };

/** One answer for the request q at the given level. */
export function levelAnswer(g, q, level = 'normal', rand = Math.random) {
  if (level === 'novice') return noviceAnswer(g, q, rand);
  // «strong/s8/h2» — the search with other settings (s = copies per option, h = rounds to look ahead); used by tools/arena.mjs.
  if (level === 'strong' || level === 'master' || level.startsWith('strong/') || level.startsWith('master/')) {
    const cfg = { ...(level.startsWith('master') ? MASTER : STRONG) };
    for (const part of level.split('/').slice(1)) {
      if (part[0] === 'F') { cfg.fitw = FITS[part.slice(1)]; continue; } // «F<name>»: another fitted evaluation (arena only)
      const m = part.match(/^([a-zA-Z]+)(-?[\d.]+)?$/); if (!m) continue;
      const v = m[2] != null ? Number(m[2]) : 1;
      if (m[1] in W) cfg.w = { ...(cfg.w || W), [m[1]]: v }; else cfg[m[1]] = v;
    }
    try { const a = strongAnswer(g, q, rand, cfg); if (a !== undefined) return a; } catch (e) { /* fall back to the rules */ }
  }
  return botAnswer(g, q, rand);
}

// ---------- novice ----------
function noviceAnswer(g, q, rand) {
  if (q.type === 'priority') return 'pass';
  if (q.type === 'main' && rand() < 0.18 && q.options.some((o) => o.id === 'end')) return 'end';
  return botAnswer(g, q, rand, { fuzz: 0.3 });
}

// ---------- strong ----------
const LOOK = new Set(['main', 'priority', 'target', 'region', 'pick']);
const MAX_OPTIONS = 14;

export const STRONG = { s: 4, h: 1, o: 14 }, MASTER = { s: 8, h: 1, o: 20 };
export function strongAnswer(g, q, rand, cfg = STRONG) {
  // «d»: also weigh «card or coin» by playing both out.
  if (!LOOK.has(q.type) && !(cfg.d && q.type === 'draw')) return undefined;
  const me = q.player;
  let opts = q.options.map((o) => o.id);
  // «No» is a choice too (do not move, do not defend, take back the card) — try it like the others.
  // Not while a card is being declared: there «no» only takes the card back into the hand.
  if (q.cancel && q.type !== 'main' && q.type !== 'priority' && (q.maneuver || q.defense || !g.acting)) opts.push(null);
  if (q.type === 'priority') {
    // Only think when there is a real answer to give.
    if (!opts.some((id) => id !== 'pass')) return 'pass';
  }
  if (q.type === 'main') {
    g._lvlActions = g._lvlTurn === g.s.turnStamp ? (g._lvlActions || 0) + 1 : 1;
    g._lvlTurn = g.s.turnStamp;
    if (g._lvlActions > 14) return 'end';
  }
  if (opts.length < 2) return undefined;
  const MAXO = cfg.o || MAX_OPTIONS;
  if (opts.length > MAXO) {
    // Too many to try them all: keep the rule bot's choice plus a random sample.
    const pick = botAnswer(g, q, rand);
    const rest = opts.filter((x) => x !== pick).sort(() => rand() - 0.5).slice(0, MAXO - 1);
    opts = [pick, ...rest];
  }
  // Each option is played out to the end of the round (both sides use the rule bot) on 4 copies with
  // different shuffles, and the average board is compared.
  const SAMPLES = Number(globalThis.PCHK_SAMPLES || cfg.s || 4);
  const seeds = Array.from({ length: SAMPLES }, () => (rand() * 2 ** 31) | 0);
  let best, bestScore = -Infinity;
  for (const a of opts) {
    let sum = 0, n = 0;
    for (const seed of seeds) {
      const g2 = copyGame(g, seed);
      if (!g2) return undefined;
      // «p»: in my turn look two moves deep — this action, then the best next one (a Place before an ally, a buff before a fight…).
      const s = cfg.p && q.type === 'main' && a !== 'end' ? pairValue(g, g2, me, a, seed, cfg) : rollout(g2, me, a, seed, cfg);
      if (s != null) { sum += s; n++; }
    }
    if (!n) continue;
    const bias = a === 'end' || a === 'pass' || a === null ? 0.3 : 0;
    const total = sum / n + bias + rand() * 0.05;
    if (globalThis.PCHK_DEBUG) globalThis.PCHK_DEBUG.push([a, +(sum / n).toFixed(1)]);
    if (total > bestScore) { bestScore = total; best = a; }
  }
  return best;
}

/** Value of action a followed by my best next action in the same turn (each tried on its own copy). */
function pairValue(g, g2, me, a, seed, cfg) {
  const q0 = g2.pending;
  if (!g2.respond(q0.player, a)) return null;
  const r = rng(seed ^ 0x2f6b3a1d), round = g2.s.round;
  // finish this action's own questions (target, region…) with the rule bot, up to my next free choice
  for (let k = 0; k < 400 && g2.pending && !g2.s.over && g2.s.round === round; k++) {
    const q = g2.pending;
    if (q.player === me && q.type === 'main') break;
    let ans; try { ans = botAnswer(g2, q, r); } catch { ans = undefined; }
    if (!g2.respond(q.player, ans) && !g2.respond(q.player, q.type === 'priority' ? 'pass' : q.type === 'main' ? 'end' : q.options?.[0]?.id ?? null)) return null;
  }
  const q1 = g2.pending;
  if (!q1 || g2.s.over || q1.player !== me || q1.type !== 'main') return finish(g2, me, seed, cfg);
  const extra = g2.history.slice(g.history.length);
  let next = q1.options.map((o) => o.id);
  if (next.length > cfg.p) { const pick = botAnswer(g2, q1, r); next = ['end', pick, ...next.filter((x) => x !== 'end' && x !== pick).sort(() => r() - 0.5)].slice(0, cfg.p); }
  let best = null;
  for (const b of next) {
    const g3 = copyGame(g, seed);
    if (!g3) continue;
    if (extra.some((x) => !g3.pending || !g3.respond(g3.pending.player, x))) continue;
    const v = rollout(g3, me, b, seed, cfg);
    if (v != null && (best == null || v > best)) best = v;
  }
  return best;
}
/** Play on with the rule bot from here to the end of the round and score it. */
function finish(g2, me, seed, cfg) {
  const r = rng(seed ^ 0x5bd1e995), round = g2.s.round;
  for (let k = 0; k < 2000 && g2.pending && !g2.s.over && g2.s.round < round + 1; k++) {
    const q = g2.pending;
    let ans; try { ans = botAnswer(g2, q, r); } catch { ans = undefined; }
    if (!g2.respond(q.player, ans) && !g2.respond(q.player, q.type === 'priority' ? 'pass' : q.type === 'main' ? 'end' : q.options?.[0]?.id ?? null)) return null;
  }
  return cfg.fit !== 0 && (cfg.fitw || FIT) && !cfg.w ? evaluateFit(g2, me, cfg.fitw || FIT) : evaluate(g2, me, cfg.w || W);
}

/** The same game rebuilt from its answers; then hidden things (deck order, dice) are made new. */
function copyGame(g, seed) {
  const g2 = new Game({ ...g.cfg, seed: g.seedUsed, options: { ...g.cfg.options, previews: false } });
  for (const a of g.history) if (!g2.pending || !g2.respond(g2.pending.player, a)) return null;
  if (g2.cfg.options) g2.cfg.options.fakeStops = null;
  const r = rng(seed);
  g2.rand = r;
  for (const p of g2.s.players) for (let k = p.deck.length - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); [p.deck[k], p.deck[j]] = [p.deck[j], p.deck[k]]; }
  return g2;
}

/** Give answer a, then play on with the rule bot for both sides until the round (with its battle) is over. */
function rollout(g2, me, a, seed, cfg = STRONG) {
  const q0 = g2.pending;
  if (!g2.respond(q0.player, a)) return null;
  const r = rng(seed ^ 0x5bd1e995), round = g2.s.round;
  for (let k = 0; k < 2000 && g2.pending && !g2.s.over && g2.s.round < round + Number(globalThis.PCHK_HORIZON || cfg.h || 1); k++) {
    const q = g2.pending;
    let ans;
    try { ans = botAnswer(g2, q, r); } catch { ans = undefined; }
    if (!g2.respond(q.player, ans) && !g2.respond(q.player, q.type === 'priority' ? 'pass' : q.type === 'main' ? 'end' : q.options?.[0]?.id ?? null)) return null;
  }
  return cfg.fit !== 0 && (cfg.fitw || FIT) && !cfg.w ? evaluateFit(g2, me, cfg.fitw || FIT) : evaluate(g2, me, cfg.w || W);
}

/** Weights of the position score (tuned with tools/arena.mjs: «strong/hand0.6/coin0.2» overrides one of them). */
export const W = {
  mhp: 2.5, ohp: 3, atk: 1.6, hp: 1.2, unit: 1, kw: 0.8, stun: 1, comp: 1.5, item: 1.1, place: 0.9, placeBase: 1.5,
  hand: 1.6, coin: 0.55, tok: 0.35, lane: 1.2, kill: 0.45,
};
/** How good the position is for player me (bigger is better). */
export function evaluate(g, me, w = W) {
  const o = 1 - me;
  if (g.s.over) return g.s.winner === me ? 1e5 : g.s.winner === 'draw' ? 0 : -1e5;
  let s = g.hp(g.leader(me)) * w.mhp - g.hp(g.leader(o)) * w.ohp;
  const unit = (c) => {
    let v = g.atk(c) * w.atk + Math.max(0, g.hp(c)) * w.hp + w.unit;
    for (const k of ['advantage', 'breakthrough', 'deathtouch', 'indestructible', 'defense']) if (g.has(c, k)) v += w.kw;
    if (g.stunned(c)) v -= w.stun;
    return v;
  };
  for (const [p, sign] of [[me, 1], [o, -1]]) {
    const P = g.P(p);
    for (const c of g.allies(p)) s += sign * unit(c);
    for (const c of g.companions(p)) s += sign * (g.atk(c) + g.hp(c) + w.comp);
    for (const c of g.items(p)) s += sign * ((g.def(c).cost || 1) * w.item + 1);
    for (const c of g.places(p)) s += sign * ((g.def(c).cost || 1) * w.place + w.placeBase);
    s += sign * (Math.min(P.hand.length, 8) * w.hand + P.coins * w.coin);
    for (const c of g.field(p)) for (const n of Object.values(c.tok || {})) s += sign * n * w.tok;
  }
  // The next battle: an unopposed ally hits the Leader, a stronger ally kills the one in front of it.
  for (let r = 0; r < 5; r++) {
    const a = g.allyAt(me, r), e = g.allyAt(o, r);
    const hits = (x) => x && !g.stunned(x) ? g.atk(x) : 0;
    if (a && !e) s += hits(a) * w.lane;
    if (e && !a) s -= hits(e) * w.lane;
    if (a && e) {
      if (hits(a) >= g.hp(e)) s += unit(e) * w.kill;
      if (hits(e) >= g.hp(a)) s -= unit(a) * w.kill;
    }
  }
  return s;
}

/** Numbers that describe one side of the board (for the fitted evaluation; see tools/fit-eval.mjs). */
export const FEAT_NAMES = ['hp', 'danger', 'allies', 'atk', 'allyHp', 'kw', 'comp', 'compHp', 'items', 'places', 'placeCost', 'hand', 'coins', 'tok', 'open', 'kills', 'handCost', 'lethal'];
function side(g, p) {
  const o = 1 - p, f = new Array(FEAT_NAMES.length).fill(0);
  const hp = g.hp(g.leader(p));
  f[0] = hp; f[1] = Math.max(0, 8 - hp);
  for (const c of g.allies(p)) {
    f[2]++; f[3] += g.stunned(c) ? 0 : g.atk(c); f[4] += Math.max(0, g.hp(c));
    for (const k of ['advantage', 'breakthrough', 'deathtouch', 'indestructible', 'defense']) if (g.has(c, k)) f[5]++;
  }
  for (const c of g.companions(p)) { f[6]++; f[7] += Math.max(0, g.hp(c)) + g.atk(c); }
  f[8] = g.items(p).length;
  for (const c of g.places(p)) { f[9]++; f[10] += g.def(c).cost || 1; }
  const P = g.P(p);
  f[11] = Math.min(P.hand.length, 10); f[12] = Math.min(P.coins, 15);
  for (const c of g.field(p)) for (const n of Object.values(c.tok || {})) f[13] += n;
  let open = 0;
  for (let r = 0; r < 5; r++) {
    const a = g.allyAt(p, r), e = g.allyAt(o, r);
    const hits = (x) => (x && !g.stunned(x) ? g.atk(x) : 0);
    if (a && !e) open += hits(a);
    if (a && e && hits(a) >= g.hp(e)) f[15] += g.atk(e) + g.hp(e);
  }
  f[14] = open;
  for (const c of P.hand) { const k = g.def(c).cost; f[16] += typeof k === 'number' ? Math.min(k, 8) : 3; }
  f[17] = open >= g.hp(g.leader(o)) ? 1 : 0;
  return f;
}
/** My side minus the opponent's, plus who moves first in the next round. */
export function features(g, me) {
  const a = side(g, me), b = side(g, 1 - me);
  return [...a.map((x, k) => x - b[k]), g.s.first === me ? 1 : -1];
}
/** More numbers for the finer evaluation: the fights region by region and what matters early in the game. */
export const FEAT_X_NAMES = ['winLane', 'loseLane', 'trade', 'earlyPlaces', 'earlyHand', 'lateAtk', 'myThreat', 'oppThreat'];
export function featuresX(g, me) {
  const o = 1 - me, base = features(g, me);
  let win = 0, lose = 0, trade = 0;
  for (let r = 0; r < 5; r++) {
    const a = g.allyAt(me, r), e = g.allyAt(o, r);
    if (!a || !e) continue;
    const aA = g.stunned(a) ? 0 : g.atk(a), eA = g.stunned(e) ? 0 : g.atk(e);
    const kill = aA >= g.hp(e), die = eA >= g.hp(a);
    if (kill && !die) win++; else if (die && !kill) lose++; else if (kill && die) trade++;
  }
  const early = g.s.round <= 4 ? 1 : 0, late = g.s.round >= 7 ? 1 : 0;
  const open = (p) => { let s = 0; for (let r = 0; r < 5; r++) { const x = g.allyAt(p, r); if (x && !g.allyAt(1 - p, r) && !g.stunned(x)) s += g.atk(x); } return s; };
  const myHp = g.hp(g.leader(me)), opHp = g.hp(g.leader(o));
  return [...base, win, lose, trade, early * base[9], early * base[11], late * base[3], open(me) / Math.max(1, opHp), open(o) / Math.max(1, myHp)];
}
// Fitted weights (logit of winning). Filled in by tools/fit-eval.mjs; null = use the hand-made evaluate().
export let FIT = EVAL_FIT;
export function setFit(w) { FIT = w; }
export const FITS = {};
export function registerFit(name, w) { FITS[name] = w; }
export function evaluateFit(g, me, w = FIT) {
  if (g.s.over) return g.s.winner === me ? 1e5 : g.s.winner === 'draw' ? 0 : -1e5;
  const f = w.length > FEAT_NAMES.length + 2 ? featuresX(g, me) : features(g, me);
  let z = w[w.length - 1];
  for (let k = 0; k < f.length; k++) z += w[k] * f[k];
  return z * 10;
}

// ---------- adaptive level ----------
const KEY = 'pchk_botlvl';
/** 0 = novice … 2 = strong, kept as a fraction so one game moves it a third of a level. */
export function adaptiveValue() {
  try { const v = Number(localStorage.getItem(KEY)); return Number.isFinite(v) && localStorage.getItem(KEY) != null ? Math.max(0, Math.min(2, v)) : 1; } catch { return 1; }
}
export function adaptiveLevel() { return LEVELS[Math.round(adaptiveValue())]; }
/** After a game against the computer at the adaptive level. */
export function adaptiveAfterGame(won) {
  const v = Math.max(0, Math.min(2, adaptiveValue() + (won ? 0.34 : -0.34)));
  try { localStorage.setItem(KEY, String(v)); } catch { /* private mode */ }
  return LEVELS[Math.round(v)];
}
