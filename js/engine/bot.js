// Simple computer opponent. Works for any request the engine can make.
import { defOf } from './game.js';

function value(g, c) {
  const d = g.def(c);
  if (d.type === 'leader') return 100;
  if (d.type === 'ally') return g.atk(c) * 2 + g.hp(c) + (d.cost || 0);
  if (d.type === 'companion') return (d.cost || 0) * 2 + g.hp(c);
  return (d.cost || 0) + 1;
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
      if (p.hand.length <= 2) return 'card';
      if (p.coins <= 3) return 'coin';
      return rand() < 0.5 ? 'card' : 'coin';
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
        let s = (typeof o.cost === 'number' ? o.cost : Math.max(1, p.coins - 1)) + 1;
        if (d.type === 'ally') s += 2;
        if (d.type === 'place' && g.s.round < 5) s += 3;
        if (o.cost === 'X' && p.coins < 3) s = 0;
        s += rand();
        if (s > bestScore) { bestScore = s; best = o.id; }
      }
      if (!best && abil.length && rand() < 0.5) {
        const o = abil[Math.floor(rand() * abil.length)];
        const key = `${o.id}@${g.s.turnStamp}`;
        g._botAb = g._botAb || {};
        if ((g._botAb[key] || 0) < 2) { g._botAb[key] = (g._botAb[key] || 0) + 1; return o.id; }
      }
      return best || 'end';
    }
    case 'priority': {
      if (rand() < 0.85) return 'pass';
      const o = q.options.filter((x) => x.id !== 'pass');
      return o.length ? o[Math.floor(rand() * o.length)].id : 'pass';
    }
    case 'region': {
      const ids = q.options.map((o) => o.id);
      if (q.row === 'ally') {
        // Prefer a region facing an empty or weaker enemy.
        let best = ids[0], bs = -1e9;
        for (const r of ids) {
          const e = g.allyAt(1 - me, r);
          const s = (e ? -value(g, e) : 5) + rand();
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
      pool = [...pool].sort((a, b) => value(g, b) - value(g, a));
      if (hint === 'harm') {
        const nonLeader = pool.filter((c) => g.cardType(c) !== 'leader');
        if (nonLeader.length && rand() < 0.8) return nonLeader[0].uid;
      }
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
