// Official additions, 2026-11-02. Text sources: cardbattles.cc/cards/379/ … /383/.
export default {
  379: { on: { *cardUsed(g, self, ev) {
    if (ev.player !== self.ctrl || !ev.def.subtypes.includes('ТАКТИКА') || !g.allyRegions(self.ctrl, { id: 903 }, 903).length) return;
    if (yield* g.yesNo(self.ctrl, 'Офицер войск Властона: создать Рядового 2/2 с Обороной?', 'yes')) yield* g.create(self.ctrl, 903);
  } } },
  380: { on: { *enter(g, self, ev) {
    if (ev.inst !== self && ev.inst.ctrl === self.ctrl && g.isType(ev.inst, 'СОЛДАТ')) yield* g.buff(self, 1, 1, 'perm', self);
  } } },
  // Defense and the Soldier discount are supplied by the card definition.
  381: {},
  382: { *effect(g, ctx) {
    const p = g.P(ctx.player), top = p.deck.slice(0, 2);
    yield* g.plan(ctx.player, 2);
    const rest = top.filter(c => p.deck.includes(c));
    if (rest.length > 1) {
      const ids = yield* g.ask(ctx.player, { type: 'order', prompt: 'Предварительное планирование: порядок верхних карт (первая — выше)', options: rest.map(c => ({ id: c.uid, cardId: c.id })) });
      const ordered = [...new Set([...ids.map(uid => rest.find(c => c.uid === uid)).filter(Boolean), ...rest])];
      for (const c of rest) g.removeFromZone(c);
      p.deck.unshift(...ordered);
    }
    yield* g.draw(ctx.player, 1);
  } },
  383: {
    targets: { kind: 'ally', side: 'any', prompt: 'Взор надзирателя: выберите Союзника' },
    *effect(g, ctx) {
      const t = g.card(ctx.targets[0]);
      yield* g.buff(t, 2, t.ctrl === ctx.player && g.isType(t, 'СОЛДАТ') ? 2 : -2, 'perm', ctx.self);
    },
  },
};
