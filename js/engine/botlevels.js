// Computer difficulty levels.
//  novice — plays simple: often a random move, never answers in the opponent's turn, sometimes ends the turn early.
//  normal — the rule-based bot from bot.js.
//  strong — tries each option on a copy of the game (the game is deterministic: same seed + same answers),
//           plays it out to the end of that action and keeps the option that leaves the best board.
//           The copy gets shuffled decks and new dice, so the computer does not peek at the future.
// Adaptive: the level moves up after the player's wins and down after losses (stored in the browser).
import { Game, rng } from './game.js';
import { botAnswer } from './bot.js';

export const LEVELS = ['novice', 'normal', 'strong'];
export const LEVEL_RU = { novice: 'Новичок', normal: 'Обычный', strong: 'Сильный', auto: 'Подстраиваться' };

/** One answer for the request q at the given level. */
export function levelAnswer(g, q, level = 'normal', rand = Math.random) {
  if (level === 'novice') return noviceAnswer(g, q, rand);
  if (level === 'strong') {
    try { const a = strongAnswer(g, q, rand); if (a !== undefined) return a; } catch (e) { /* fall back to the rules */ }
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

export function strongAnswer(g, q, rand) {
  if (!LOOK.has(q.type)) return undefined;
  const me = q.player;
  let opts = q.options.map((o) => o.id);
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
  if (opts.length > MAX_OPTIONS) {
    // Too many to try them all: keep the rule bot's choice plus a random sample.
    const pick = botAnswer(g, q, rand);
    const rest = opts.filter((x) => x !== pick).sort(() => rand() - 0.5).slice(0, MAX_OPTIONS - 1);
    opts = [pick, ...rest];
  }
  // Each option is played out to the end of the round (both sides use the rule bot) on 4 copies with
  // different shuffles, and the average board is compared.
  const SAMPLES = Number(globalThis.PCHK_SAMPLES || 4);
  const seeds = Array.from({ length: SAMPLES }, () => (rand() * 2 ** 31) | 0);
  let best, bestScore = -Infinity;
  for (const a of opts) {
    let sum = 0, n = 0;
    for (const seed of seeds) {
      const g2 = copyGame(g, seed);
      if (!g2) return undefined;
      const s = rollout(g2, me, a, seed);
      if (s != null) { sum += s; n++; }
    }
    if (!n) continue;
    const bias = a === 'end' || a === 'pass' ? 0.3 : 0;
    const total = sum / n + bias + rand() * 0.05;
    if (total > bestScore) { bestScore = total; best = a; }
  }
  return best;
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
function rollout(g2, me, a, seed) {
  const q0 = g2.pending;
  if (!g2.respond(q0.player, a)) return null;
  const r = rng(seed ^ 0x5bd1e995), round = g2.s.round;
  for (let k = 0; k < 2000 && g2.pending && !g2.s.over && g2.s.round < round + Number(globalThis.PCHK_HORIZON || 1); k++) {
    const q = g2.pending;
    let ans;
    try { ans = botAnswer(g2, q, r); } catch { ans = undefined; }
    if (!g2.respond(q.player, ans) && !g2.respond(q.player, q.type === 'priority' ? 'pass' : q.type === 'main' ? 'end' : q.options?.[0]?.id ?? null)) return null;
  }
  return evaluate(g2, me);
}

/** How good the position is for player me (bigger is better). */
export function evaluate(g, me) {
  const o = 1 - me;
  if (g.s.over) return g.s.winner === me ? 1e5 : g.s.winner === 'draw' ? 0 : -1e5;
  let s = g.hp(g.leader(me)) * 2.5 - g.hp(g.leader(o)) * 3;
  const unit = (c) => {
    let v = g.atk(c) * 1.6 + Math.max(0, g.hp(c)) * 1.2 + 1;
    for (const k of ['advantage', 'breakthrough', 'deathtouch', 'indestructible', 'defense']) if (g.has(c, k)) v += 0.8;
    if (g.stunned(c)) v -= 1;
    return v;
  };
  for (const [p, sign] of [[me, 1], [o, -1]]) {
    const P = g.P(p);
    for (const c of g.allies(p)) s += sign * unit(c);
    for (const c of g.companions(p)) s += sign * (g.atk(c) + g.hp(c) + 1.5);
    for (const c of g.items(p)) s += sign * ((g.def(c).cost || 1) * 1.1 + 1);
    for (const c of g.places(p)) s += sign * ((g.def(c).cost || 1) * 0.9 + 1.5);
    s += sign * (Math.min(P.hand.length, 8) * 1.6 + P.coins * 0.55);
    for (const c of g.field(p)) for (const n of Object.values(c.tok || {})) s += sign * n * 0.35;
  }
  // The next battle: an unopposed ally hits the Leader, a stronger ally kills the one in front of it.
  for (let r = 0; r < 5; r++) {
    const a = g.allyAt(me, r), e = g.allyAt(o, r);
    const hits = (x) => x && !g.stunned(x) ? g.atk(x) : 0;
    if (a && !e) s += hits(a) * 1.2;
    if (e && !a) s -= hits(e) * 1.2;
    if (a && e) {
      if (hits(a) >= g.hp(e)) s += unit(e) * 0.45;
      if (hits(e) >= g.hp(a)) s -= unit(a) * 0.45;
    }
  }
  return s;
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
