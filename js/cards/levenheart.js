// Скрижаль Сфинктериона Лёвенхарта (стартовый набор).
const mine = (g, self, ev) => ev.player === self.ctrl;
const isEnemyCharOf = (g, self, t) => t.ctrl !== self.ctrl && ['ally', 'companion', 'leader'].includes(g.cardType(t));

export default {
  // Сфинктерион Лёвенхарт (Лидер)
  20: {
    on: {
      *turnStart(g, self, ev) { if (mine(g, self, ev)) { g.fx('coins', self); yield* g.gainCoins(self.ctrl, 2, self); } },
    },
    abilities: [{
      name: 'Муштра', fast: true, cost: { coins: 2 },
      targets: { kind: 'ally', side: 'own', hint: 'buff', prompt: 'Муштра: выберите вашего Союзника (+1/+1)' },
      *effect(g, ctx) { const t = g.card(ctx.targets[0]); g.fx('drill', ctx.self, t); yield* g.buff(t, 1, 1, 'nextTurn', ctx.self); }, // until the start of my next turn (rules summary, 20.07.2026)
    }],
  },
  // Священное пламя
  7: {
    targets: { kind: 'character', side: 'enemy', prompt: 'Священное пламя: 3 раны вражескому персонажу' },
    *effect(g, ctx) {
      const t = g.card(ctx.targets[0]);
      g.fx('holyFire', ctx.self, t);
      const n = yield* g.damage(ctx.self, t, 3);
      const mine = [g.leader(ctx.player), ...g.companions(ctx.player)];
      const h = yield* g.pickCard(ctx.player, mine, `Исцелить ${n} ран: Лидеру или Напарнику`, 'buff');
      if (h) { g.fx('heal', ctx.self, h); yield* g.heal(h, n, ctx.self); }
    },
  },
  // Казнь
  6: {
    targets: { kind: 'allyOrCompanion', side: 'enemy', prompt: 'Казнь: уничтожьте вражеского Союзника или Напарника' },
    *effect(g, ctx) { const t = g.card(ctx.targets[0]); g.fx('execute', ctx.self, t); yield* g.destroy(t, ctx.self); },
  },
  // Проспект покушений
  13: {
    on: {
      *turnStart(g, self, ev) { if (mine(g, self, ev)) { g.fx('foresight', self); yield* g.plan(self.ctrl, 1); yield* g.gainCoins(self.ctrl, 1, self); } },
      *destroyed(g, self, info) {
        if (info.ctrl !== self.ctrl && info.region === self.region && g.def(info.inst).type === 'ally') { g.fx('draw', self); yield* g.draw(self.ctrl, 1); }
      },
    },
  },
  // Конский, принц-кентавр (Напарник)
  3: {
    *onEnter(g, self) {
      const warriors = g.field(self.ctrl).filter((c) => g.isType(c, 'ВОИН') && g.cardType(c) === 'ally');
      const x = Math.max(0, ...warriors.map((c) => g.atk(c)));
      if (x <= 0) return;
      const t = yield* g.pickCard(self.ctrl, g.targetCandidates(self.ctrl, { kind: 'ally', side: 'enemy' }), `Удар с разбега: ${x} ран вражескому Союзнику`);
      if (t && x > 0) { g.fx('charge', self, t); yield* g.damage(self, t, x); }
    },
  },
  // Торговый ряд: каждый ряд даёт по монете за каждый ряд (N рядов = N²).
  11: {
    on: {
      *turnStart(g, self, ev) {
        if (!mine(g, self, ev)) return;
        const n = g.places(self.ctrl).filter((c) => c.id === 11).length;
        g.fx('merchants', self);
        yield* g.gainCoins(self.ctrl, n, self);
      },
    },
  },
  // Щит тёмного властелина (официальное изменение: выходит с 3 📦)
  17: {
    enterTokens: { goods: 3 },
    on: { *turnStart(g, self, ev) { if (mine(g, self, ev)) { g.fx('supply', self); yield* g.addTokens(self, 'goods', 1); } } },
    abilities: [
      {
        name: 'Воскрешение', cost: { goods: 1 },
        can: (g, self) => g.P(self.ctrl).grave.some((c) => g.def(c).type === 'ally'),
        *plan(g, ctx) {
          const cands = g.P(ctx.player).grave.filter((c) => g.def(c).type === 'ally');
          const t = yield* g.pickCard(ctx.player, cands, 'Воскрешение: Союзник из кладбища в руку', 'buff', { optional: true });
          if (!t) return false;
          ctx.targets.push(t.uid); ctx.specs.push({ zone: 'grave' });
        },
        *effect(g, ctx) { const t = g.card(ctx.targets[0]); g.fx('revive', ctx.self, t); yield* g.toHand(t); },
      },
      {
        name: 'Некротическая молния', cost: { goods: 2 },
        *plan(g, ctx) {
          const used = new Set();
          for (const n of [3, 2, 1]) {
            const t = yield* g.chooseTarget(ctx, { kind: 'character', side: 'enemy', prompt: `Некротическая молния: ${n} ран(ы)`, exclude: (g2, c, x) => used.has(x.uid), noCancel: n !== 3 });
            if (!t) { if (n === 3) return false; break; }
            used.add(t.uid);
          }
        },
        *effect(g, ctx) {
          const amounts = [3, 2, 1];
          for (let k = 0; k < ctx.targets.length; k++) {
            const t = g.card(ctx.targets[k]);
            g.fx('necroBolt', ctx.self, t);
            yield* g.damage(ctx.self, t, amounts[k]);
          }
        },
      },
    ],
  },
  // Лос Ускаманос, воин Нурикфелла (обратная сторона — Джей Зи)
  12: {
    on: {
      *cardUsed(g, self, ev) {
        if (ev.player !== self.ctrl && ev.def.type === 'ally') { g.fx('levelUp', self); yield* g.buff(self, 1, 1, 'perm', self); }
      },
    },
  },
  // Джей Зи, ученик Гуди
  60: {
    *onEnter(g, self) {
      const cands = g.P(self.ctrl).grave.filter((c) => ['ally', 'companion'].includes(g.def(c).type) && g.def(c).legend && !g.legendClash(self.ctrl, c));
      const t = yield* g.pickCard(self.ctrl, cands, 'Судьба лорда: вернуть Легенду из кладбища на поле', 'buff', { optional: true });
      if (!t) return;
      if (g.def(t).type === 'ally') {
        const regs = g.allyRegions(self.ctrl, t, t.id);
        if (!regs.length) return;
        const r = yield* g.pickRegion(self.ctrl, regs, `Куда положить «${g.name(t)}»?`);
        g.fx('revive', self, t);
        yield* g.putOnField(t, self.ctrl, r);
      } else { g.fx('revive', self, t); yield* g.putOnField(t, self.ctrl, null); }
    },
  },
  // Лодка Януса. На карте напечатан Манёвр: в начале Сражения её можно переместить в другой регион без вашего Места
  // (движок двигает манёвром только Союзников, поэтому — здесь, в начале Сражения).
  19: {
    on: {
      *turnEnd(g, self, ev) { if (mine(g, self, ev)) { g.fx('coins', self); yield* g.gainCoins(self.ctrl, 2, self); } },
      *battleStart(g, self) {
        if (self.zone !== 'field') return;
        const p = self.ctrl, from = self.region;
        const free = g.placeRegions(p);
        if (!free.length) return;
        const r = yield* g.pickRegion(p, free, 'Манёвр: переместить подсвеченную «Лодку Януса» в другой регион?', 'place', { optional: true, focus: self.uid });
        if (r == null || r === from || g.placeAt(p, r) || !g.onField(self)) return;
        g.P(p).regions[from].place = null; g.P(p).regions[r].place = self; self.region = r;
        g.emit('move', { uid: self.uid, from, to: r, log: `«${g.name(self)}» перемещается.` });
      },
    },
  },
  // Кёнигпон
  5: {
    *onEnter(g, self) { g.s.skipBattles++; g.fx('festival', self); g.log('Городской праздник: следующее Сражение пропускается.'); },
    on: { *turnStart(g, self, ev) { if (mine(g, self, ev)) { g.fx('coins', self); yield* g.gainCoins(self.ctrl, 3, self); } } },
  },
  // Дварф по имени Дейн. «Ветеран армии»: на карте «наносятся раны» (без числа; в выгрузке текста ошибочно «3 раны»),
  // ответ авторов: Топор (2 раны) по вражескому Союзнику тоже даёт карту.
  1: {
    *onEnter(g, self) { g.fx('forge', self); yield* g.create(self.ctrl, 55); yield* g.create(self.ctrl, 55); },
    on: {
      *damage(g, self, ev) {
        const s = g.s;
        if (s.phase === 'turn' && s.turn === self.ctrl && !ev.combat && ev.tgtCtrl !== self.ctrl
          && ['ally', 'companion'].includes(g.cardType(ev.tgt)) && ev.amount > 0) {
          g.fx('draw', self); yield* g.draw(self.ctrl, 1);
        }
      },
    },
  },
  // Слово света: одиннадцать
  18: {
    targets: { kind: 'allyOrCompanion', side: 'enemy', prompt: 'Слово света: 11 ран' },
    *effect(g, ctx) {
      const t = g.card(ctx.targets[0]);
      g.fx('lightBeam', ctx.self, t);
      const dealt = yield* g.damage(ctx.self, t, 11);
      const extra = 11 - dealt;
      if (extra > 0) { g.fx('heal', ctx.self, g.leader(ctx.player)); yield* g.heal(g.leader(ctx.player), extra, ctx.self); }
    },
  },
  // Вульф Ва, влюблённая воительница
  4: {
    on: { *damage(g, self, ev) { if (ev.tgt === self && ev.amount > 0 && g.onField(self)) yield* g.addTokens(self, 'goods', 1); } },
    abilities: [
      {
        name: 'Каменная стойкость', fast: true, cost: { goods: 1 },
        *effect(g, ctx) { g.fx('stone', ctx.self); g.grant(ctx.self, 'indestructible', 'phase', ctx.self); },
      },
      {
        name: 'Дрожь земли', cost: { goods: 2 },
        *effect(g, ctx) {
          const r = ctx.self.region;
          if (r == null) return;
          const regs = [r, ...g.adjacent(r)];
          const victims = regs.map((x) => g.allyAt(1 - ctx.player, x)).filter(Boolean);
          g.fx('quake', ctx.self, victims, { regions: regs });
          for (const v of victims) yield* g.damage(ctx.self, v, 2);
        },
      },
    ],
  },
  // Дварфиха Бульбух, любящая мать
  16: {
    on: {
      *damage(g, self, ev) {
        if (ev.combat && ev.src && ev.srcCtrl === self.ctrl && g.cardType(ev.src) === 'ally' && g.cardType(ev.tgt) === 'leader' && ev.tgtCtrl !== self.ctrl && ev.amount > 0) {
          g.fx('borscht', self); yield* g.create(self.ctrl, 56);
        }
      },
      *turnStart(g, self, ev) {
        if (!mine(g, self, ev)) return;
        const borsch = g.items(self.ctrl).filter((c) => c.id === 56);
        if (!borsch.length) return;
        const cands = g.P(self.ctrl).grave.filter((c) => g.def(c).type === 'ally' && (g.def(c).cost ?? 0) <= borsch.length && !g.legendClash(self.ctrl, c));
        if (!cands.length || !g.allyRegions(self.ctrl, cands[0], cands[0].id).length) return;
        const t = yield* g.pickCard(self.ctrl, cands, 'Материнская любовь: вернуть Союзника за Борщи', 'buff', { optional: true });
        if (!t) return;
        const n = g.def(t).cost ?? 0;
        for (const b of borsch.slice(0, n)) yield* g.destroy(b, self, { cost: true });
        const r = yield* g.pickRegion(self.ctrl, g.allyRegions(self.ctrl, t, t.id), `Куда вернуть «${g.name(t)}»?`);
        g.fx('revive', self, t);
        yield* g.putOnField(t, self.ctrl, r);
      },
    },
  },
  // Ополчение Вёрджинвальда
  9: {
    *onEnter(g, self) {
      const n = g.adjacent(self.region).filter((r) => g.allyAt(self.ctrl, r)).length;
      if (n) { g.fx('rally', self); yield* g.buff(self, 2 * n, n, 'perm', self); }
    },
  },
  // Бойцы Октагона
  10: {
    on: {
      *damage(g, self, ev) {
        if (ev.src === self && ev.amount > 0 && ev.tgtCtrl !== self.ctrl && ['leader', 'companion'].includes(g.cardType(ev.tgt))) { g.fx('levelUp', self); yield* g.buff(self, 1, 1, 'perm', self); }
      },
    },
    abilities: [{ name: 'Добивание', fast: true, cost: { coins: 1 }, *effect(g, ctx) { g.fx('rage', ctx.self); g.grant(ctx.self, 'breakthrough', 'phase', ctx.self); } }],
  },
  // Замок Вёрджинвальд
  8: {
    on: {
      *turnStart(g, self, ev) {
        if (!mine(g, self, ev)) return;
        const n = g.field(self.ctrl).filter((c) => g.isType(c, 'ВОИН')).length;
        g.fx('coins', self);
        yield* g.gainCoins(self.ctrl, n, self);
      },
      *battleStart(g, self) {
        if (g.leader(self.ctrl).hpNow < g.leader(1 - self.ctrl).hpNow) {
          const a = g.allyAt(self.ctrl, self.region);
          if (a) { g.fx('rally', self, a); g.grant(a, 'breakthrough', 'phase', self); yield* g.buff(a, 1, 1, 'perm', self); }
        }
      },
    },
  },
  // Жертвы покушения
  14: {
    *plan(g, ctx) {
      const m = yield* g.ask(ctx.player, { type: 'pick', prompt: 'Жертвы покушения', options: [{ id: 0, label: '3 раны всем Союзникам' }, { id: 1, label: '3 раны всем Лидерам и Напарникам' }], cancel: true, auto: false });
      if (m == null) return false;
      ctx.mode = m;
    },
    *effect(g, ctx) {
      const list = ctx.mode === 0 ? g.allies() : [g.leader(0), g.leader(1), ...g.companions()];
      g.fx('massacre', ctx.self, list);
      for (const t of list) yield* g.damage(ctx.self, t, 3);
    },
  },
  // Божественная сила
  21: {
    targets: { kind: 'ally', side: 'own', hint: 'buff', prompt: 'Божественная сила: ваш Союзник +3/+0' },
    *effect(g, ctx) {
      const t = g.card(ctx.targets[0]);
      g.fx('divine', ctx.self, t);
      yield* g.buff(t, 3, 0, 'nextTurn', ctx.self);
      g.fx('heal', ctx.self, g.leader(ctx.player));
      yield* g.heal(g.leader(ctx.player), 3, ctx.self);
    },
  },
  // Кряхтун, воин света
  15: {
    on: {
      *cardUsed(g, self, ev) {
        if (ev.player === self.ctrl && ev.def.subtypes.includes('БЛАГОСЛОВЕНИЕ')) { g.fx('levelUp', self); yield* g.buff(self, 1, 1, 'perm', self); }
      },
      *damage(g, self, ev) {
        if (ev.src === self && ev.amount > 0 && ev.tgtCtrl !== self.ctrl) { g.fx('heal', self, g.leader(self.ctrl)); yield* g.heal(g.leader(self.ctrl), ev.amount, self); }
      },
    },
  },
  // Лавка эльфа Дододиса
  2: {
    enterTokens: { goods: 2 },
    on: { *turnStart(g, self, ev) { if (mine(g, self, ev)) { g.fx('coins', self); yield* g.gainCoins(self.ctrl, g.tokens(self, 'goods'), self); } } },
    abilities: [{ name: 'Купить ящик', cost: { coins: 3 }, *effect(g, ctx) { g.fx('supply', ctx.self); yield* g.addTokens(ctx.self, 'goods', 1); } }],
  },
};
