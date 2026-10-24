// Токены и обратные стороны карт.
const mine = (g, self, ev) => ev.player === self.ctrl;
const flipBack = (to) => ({
  *turnStart(g, self, ev) {
    if (!mine(g, self, ev)) return;
    if (yield* g.yesNo(self.ctrl, `Возвращение: перевернуть «${g.name(self)}» лицевой стороной?`, 'no')) { g.fx('transform', self); yield* g.flip(self, to); }
  },
});

export default {
  // Топор: уничтожьте, чтобы нанести 2 раны вражескому персонажу (только в свой ход).
  55: {
    abilities: [{
      name: 'Бросок топора', myTurnOnly: true, cost: { selfDestroy: true },
      targets: { kind: 'character', side: 'enemy', prompt: 'Топор: 2 раны вражескому персонажу' },
      *effect(g, ctx) { const t = g.card(ctx.targets[0]); g.fx('axe', ctx.self, t); yield* g.damage(ctx.self, t, 2); },
    }],
  },
  // Борщ: уничтожьте, чтобы исцелить 3 раны вашему персонажу.
  56: {
    abilities: [{
      name: 'Съесть борщ', myTurnOnly: true, cost: { selfDestroy: true },
      targets: { kind: 'character', side: 'own', hint: 'buff', prompt: 'Борщ: исцелить 3 раны' },
      *effect(g, ctx) { const t = g.card(ctx.targets[0]); g.fx('heal', ctx.self, t); yield* g.heal(t, 3, ctx.self); },
    }],
  },
  // Украшение: в начале вашего хода получите 1 монету.
  83: { on: { *turnStart(g, self, ev) { if (mine(g, self, ev)) { g.fx('coins', self); yield* g.gainCoins(self.ctrl, 1, self); } } } },
  // Золотая монета: уничтожьте, чтобы получить 1 монету.
  120: {
    abilities: [{ name: 'Потратить', cost: { selfDestroy: true }, *effect(g, ctx) { g.fx('coins', ctx.self); yield* g.gainCoins(ctx.player, 1, null, { noMods: true }); } }],
  },
  // Квирк, облик козы → Квирк, друид-ветеринар
  54: { on: flipBack(42) },
  // Альбо, облик крысы
  58: {
    on: flipBack(31),
    static: {
      // Во время хода противника ваши карты Действий получают Опережение.
      // Сражение — отдельная фаза раунда, не ход противника (ответ авторов: раунд = ход 1, ход 2, Сражение).
      grantFast(g, self, i, c, d) { return i === self.ctrl && g.s.phase === 'turn' && g.s.turn === 1 - i && d.type === 'action'; },
    },
  },
  // Павел Толя, облик пони
  52: { on: flipBack(27) },
};
