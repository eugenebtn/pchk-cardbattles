// Computer opponent. Works for any request the engine can make. It reads what an effect does from the
// prompt and the source card's text (destroy / N wounds / buff) so it does not waste cards on targets
// that cannot be hurt (Нерушимость) and prefers targets it can actually kill.
import { defOf } from './game.js';

/** What a targeted effect does, guessed from the request and the card that makes it. */
function intent(g, q, srcId) {
  const prompt = (q.prompt || '').toLowerCase();
  const src = q.src != null ? g.card(q.src) : null;
  const text = ((srcId != null ? defOf(srcId)?.text : src ? g.def(src).text : '') || '').toLowerCase();
  const m = prompt.match(/(\d+)\s*ран/) || text.match(/(\d+)\s*ран/);
  const dmg = m ? Number(m[1]) : 0;
  const destroy = /уничтож/.test(prompt) || (!dmg && /уничтожьте/.test(text));
  return { destroy, dmg };
}
/** Score of hitting card c with an effect; -1 means useless. */
function harmScore(g, c, it) {
  if (g.has(c, 'indestructible') && it.destroy) return -1;
  const v = value(g, c);
  if (it.dmg) {
    if (g.cardType(c) === 'leader') return g.hp(c) <= it.dmg ? 1000 : 2 + it.dmg;
    return g.hp(c) <= it.dmg ? v * 2 + 5 : v * 0.5;
  }
  if (g.cardType(c) === 'leader') return 1;
  return v;
}
/** Would playing this hand card (or using this ability) do anything useful right now? */
function useful(g, me, specs, srcId) {
  const first = Array.isArray(specs) ? specs[0] : specs;
  if (!first || typeof first !== 'object' || first.optional || first.side === 'own' || first.hint === 'buff' || first.zone || !first.kind) return true;
  let cands;
  try { cands = g.targetCandidates(me, first).filter((c) => c.ctrl !== me); } catch { return true; }
  if (!cands.length) return first.side !== 'enemy';
  const it = intent(g, { prompt: first.prompt }, srcId);
  return cands.some((c) => harmScore(g, c, it) > 0);
}

function value(g, c) {
  const d = g.def(c);
  if (d.type === 'leader') return 100;
  if (d.type === 'ally') return g.atk(c) * 2 + g.hp(c) + (d.cost || 0);
  if (d.type === 'companion') return (d.cost || 0) * 2 + g.hp(c);
  return (d.cost || 0) + 1;
}

/** How good it is to put an ally with this attack/health (pv) into region r. */
function laneScore(g, me, r, pv) {
  const e = g.allyAt(1 - me, r);
  const A = pv?.atk ?? 2, H = pv?.hp ?? 2;
  if (!e) return A * 1.2 + 1;
  const eA = g.stunned(e) ? 0 : g.atk(e), eH = g.hp(e);
  const kill = A >= eH && !g.has(e, 'indestructible'), die = eA >= H;
  let s = 0;
  if (kill) s += value(g, e) + 2;
  if (die) s -= A + H + 2; else s += eA * 1.2; // it stops that enemy from hitting my Leader
  return s;
}

export function botAnswer(g, q, rand = Math.random, opts = {}) {
  const me = q.player;
  const fuzz = opts.fuzz || 0; // 0..1: chance to pick a random valid answer (for tests)
  if (fuzz && rand() < fuzz) return randomAnswer(g, q, rand);
  switch (q.type) {
    case 'mulligan': {
      const cards = q.options.map((o) => g.card(o.id));
      cards.sort((a, b) => score(a) - score(b));
      return cards.slice(0, q.keep).map((c) => c.uid);
      function score(c) { const d = g.def(c); const cost = typeof d.cost === 'number' ? d.cost : 4; return Math.abs(cost - 3) + (d.type === 'ally' ? -1 : 0) + (d.type === 'place' ? -0.5 : 0); }
    }
    case 'draw': {
      const p = g.P(me);
      if (!q.options.some((o) => o.id === 'card')) return 'coin';
      // Take what lets me spend the most this turn: coins when the hand already costs more than I have, else cards.
      // Allies only count when there is a free region for them, or a full board would keep taking coins forever.
      let free = 0; for (let r = 0; r < 5; r++) if (!g.allyAt(me, r)) free++;
      const usable = p.hand.filter((c) => free > 0 || defOf(c.id).type !== 'ally');
      const costs = usable.map((c) => { const k = defOf(c.id).cost; return typeof k === 'number' ? k : 3; });
      const need = costs.reduce((x, y) => x + y, 0);
      if (usable.length <= 1 || p.coins >= 10) return 'card';
      if (need > p.coins + 1 || p.hand.length >= 6) return 'coin';
      return 'card';
    }
    case 'main': {
      const p = g.P(me);
      g._botActions = (g._botTurn === g.s.turnStamp) ? (g._botActions || 0) + 1 : 1;
      g._botTurn = g.s.turnStamp;
      if (g._botActions > 14) return 'end';
      const plays = q.options.filter((o) => o.kind === 'play');
      const abil = q.options.filter((o) => o.kind === 'ability');
      let best = null, bestScore = 0;
      for (const o of plays) {
        const c = g.card(o.uid), d = defOf(o.side);
        if (!useful(g, me, g.script({ id: o.side }).targets, o.side)) continue;
        let s = (typeof o.cost === 'number' ? o.cost : Math.max(1, p.coins - 1)) + 1;
        if (d.type === 'ally') s += 2;
        if (d.type === 'place' && g.s.round < 5) s += 3;
        if (o.cost === 'X' && p.coins < 3) s = 0;
        s += rand();
        if (s > bestScore) { bestScore = s; best = o.id; }
      }
      const goodAb = abil.filter((o) => { const c = g.card(o.uid); const ab = g.script(c).abilities?.[o.ab]; return !ab || useful(g, me, ab.targets, c.id); });
      if (!best && goodAb.length && rand() < 0.6) {
        const o = goodAb[Math.floor(rand() * goodAb.length)];
        const key = `${o.id}@${g.s.turnStamp}`;
        g._botAb = g._botAb || {};
        if ((g._botAb[key] || 0) < 2) { g._botAb[key] = (g._botAb[key] || 0) + 1; return o.id; }
      }
      return best || 'end';
    }
    case 'priority': {
      // Answer only with something useful, and mostly when the opponent is acting against us.
      const top = g.s.stack[g.s.stack.length - 1];
      const threatened = top && top.player !== me && top.ctx.targets.some((u) => g.card(u)?.ctrl === me);
      const o = q.options.filter((x) => x.id !== 'pass').filter((x) => {
        if (x.kind === 'play') return useful(g, me, g.script({ id: x.side }).targets, x.side);
        const c = g.card(x.uid); const ab = g.script(c).abilities?.[x.ab];
        return !ab || useful(g, me, ab.targets, c.id);
      });
      if (!o.length || rand() < (threatened ? 0.2 : 0.5)) return 'pass';
      return o[Math.floor(rand() * o.length)].id;
    }
    case 'region': {
      const ids = q.options.map((o) => o.id);
      if (q.row === 'ally') {
        // Score the fight in each region: kill the enemy and survive, block a strong enemy, or hit the Leader.
        const c = q.uid != null ? g.card(q.uid) : null;
        let best = ids[0], bs = -1e9;
        for (const r of ids) {
          const pv = c ? g.previewAlly(me, c, c.id, r) : null;
          const s = laneScore(g, me, r, pv) + rand() * 0.3;
          if (s > bs) { bs = s; best = r; }
        }
        return best;
      }
      return ids[Math.floor(rand() * ids.length)];
    }
    case 'target': {
      if (q.maneuver) return null;
      const cards = q.options.map((o) => g.card(o.id));
      if (q.defense) {
        const lead = g.leader(me);
        return lead.hpNow < 8 ? cards[0].uid : null;
      }
      const hint = q.hint || 'harm';
      const enemy = cards.filter((c) => c.ctrl !== me), own = cards.filter((c) => c.ctrl === me);
      let pool = hint === 'buff' || hint === 'yes' ? (own.length ? own : cards) : (enemy.length ? enemy : cards);
      if (hint === 'face') {
        const comp = pool.filter((c) => g.cardType(c) === 'companion').sort((a, b) => g.hp(a) - g.hp(b));
        if (comp.length && g.hp(comp[0]) <= 3) return comp[0].uid;
        const L = pool.find((c) => g.cardType(c) === 'leader');
        return (L || pool[0]).uid;
      }
      if (hint === 'harm' && enemy.length) {
        const it = intent(g, q);
        const scored = enemy.map((c) => [harmScore(g, c, it) + rand() * 0.5, c]).sort((a, b) => b[0] - a[0]);
        if (scored[0][0] > 0) return scored[0][1].uid;
        // Nothing worth hitting: back out if allowed instead of wasting the card.
        if (q.cancel) return null;
        return scored[0][1].uid;
      }
      pool = [...pool].sort((a, b) => value(g, b) - value(g, a));
      return pool[0].uid;
    }
    case 'pick': {
      if (q.hint === 'yes') return q.options.find((o) => o.id === 1)?.id ?? q.options[0].id;
      if (q.hint === 'no') return q.options.find((o) => o.id === 0)?.id ?? q.options[0].id;
      const ids = q.options.map((o) => o.id);
      if (typeof ids[0] === 'number' && ids.length > 3 && q.prompt.includes('X')) return ids[ids.length - 1];
      return ids[Math.floor(rand() * ids.length)];
    }
    case 'multi': {
      const ids = q.options.map((o) => o.id);
      if (q.plan) return [];
      // Discards: highest cost first.
      const sorted = [...ids].sort((a, b) => (defOf(g.card(b).id).cost || 0) - (defOf(g.card(a).id).cost || 0));
      return sorted.slice(0, Math.max(q.min, Math.min(q.max, q.min || 1)));
    }
    case 'order': return q.options.map((o) => o.id);
    default: return randomAnswer(g, q, rand);
  }
}

export function randomAnswer(g, q, rand = Math.random) {
  const ids = q.options.map((o) => o.id);
  switch (q.type) {
    case 'mulligan': {
      if (q.canMull && rand() < 0.2) return 'mulligan';
      return [...ids].sort(() => rand() - 0.5).slice(0, q.keep);
    }
    case 'multi': {
      const n = q.min + Math.floor(rand() * (q.max - q.min + 1));
      return [...ids].sort(() => rand() - 0.5).slice(0, n);
    }
    case 'order': return [...ids].sort(() => rand() - 0.5);
    case 'main': {
      if (rand() < 0.15) return 'end';
      return ids[Math.floor(rand() * ids.length)];
    }
    default: {
      if (q.cancel && rand() < 0.1) return null;
      return ids[Math.floor(rand() * ids.length)];
    }
  }
}
