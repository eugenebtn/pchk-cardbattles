// Прочие карты первого набора (set1_other), карты 368–378. Токены: 901 Шут 1/1, 902 Речной гном 2/2.
import { canAllyAt } from './larisa.js';

const mine = (g, self, ev) => ev.player === self.ctrl;
const ALL_REGIONS = [0, 1, 2, 3, 4];
const costNum = (g, c) => (typeof g.def(c).cost === 'number' ? g.def(c).cost : 0); // токены без цены = 0
/** How many cards player p has discarded in the current phase (the phase starts at 'turnStart' / 'battleStart'). */
function discardsThisPhase(g, p) {
  let n = 0;
  for (let k = g.events.length - 1; k >= 0; k--) {
    const e = g.events[k];
    if (e.type === 'turnStart' || e.type === 'battleStart') break;
    if (e.type === 'discard' && e.player === p) n++;
  }
  return n;
}
const near = (a, b) => a.zone === 'field' && b.zone === 'field' && Math.abs(a.region - b.region) <= 1;

export default {
  // Исчадие страданий: на 1 💰 дешевле за каждую карту Союзника на вашем кладбище.
  368: {
    cost(g, player, inst, base) { return base - g.P(player).grave.filter((c) => g.def(c).type === 'ally').length; },
  },

  // Афиша «Игра шутов».
  369: {
    on: {
      *turnStart(g, self, ev) {
        if (!mine(g, self, ev)) return;
        const p = self.ctrl;
        g.fx('jesterPoster', self);
        yield* g.create(p, 901);
        if (!g.onField(self)) return;
        if (ALL_REGIONS.every((r) => g.allyAt(p, r))) {
          g.fx('jesterFinale', self, g.allies(p));
          yield* g.destroy(self, self);
          for (const a of g.allies(p)) yield* g.buff(a, 1, 1, 'perm', self);
        }
      },
    },
  },

  // Адская гончая.
  370: {
    on: {
      // Животная ярость: срабатывает, только если это ваш первый сброс в этой фазе
      // (сбросы до появления гончей на поле тоже считаются).
      *discard(g, self, ev) {
        if (ev.player !== self.ctrl || self.x.rageP === g.s.phaseId) return;
        if (discardsThisPhase(g, self.ctrl) > 1) return;
        self.x.rageP = g.s.phaseId;
        g.fx('rage', self);
        yield* g.buff(self, 1, 0, 'perm', self);
      },
    },
    abilities: [{
      // Накормить телом: сбросьте Союзника из руки (цена) — Прорыв до начала вашего следующего хода.
      name: 'Накормить телом', limit: 'phase',
      can: (g, self) => g.P(self.ctrl).hand.some((c) => g.def(c).type === 'ally'),
      *plan(g, ctx) {
        const cands = g.P(ctx.player).hand.filter((c) => g.def(c).type === 'ally');
        const [c] = yield* g.pickFrom(ctx.player, cands, { min: 0, max: 1, prompt: 'Накормить телом: сбросьте карту Союзника из руки' });
        if (!c) return false;
        yield* g.discard(ctx.player, c);
      },
      *effect(g, ctx) { g.fx('feedBody', ctx.self); g.grant(ctx.self, 'breakthrough', 'nextTurn', ctx.self); },
    }],
  },

  // Лавочник храма юмора.
  371: {
    *onEnter(g, self) {
      if (self.zone !== 'field') return;
      const p = self.ctrl;
      const regs = g.adjacent(self.region).filter((r) => canAllyAt(g, p, 901, r));
      if (!regs.length) return;
      const r = yield* g.pickRegion(p, regs, 'Известный шут: в каком соседнем регионе создать Шута?');
      g.fx('jester', self, null, { region: r });
      yield* g.create(p, 901, r);
    },
    on: {
      // Популярный мерч: 1 💰 за каждого Союзника (любого игрока) в соседних регионах.
      *turnStart(g, self, ev) {
        if (!mine(g, self, ev) || self.zone !== 'field') return;
        let n = 0;
        for (const r of g.adjacent(self.region)) for (const pl of [0, 1]) if (g.allyAt(pl, r)) n++;
        if (n) { g.fx('merchants', self); yield* g.gainCoins(self.ctrl, n, self); }
      },
    },
  },

  // Засада речных гномов (X): Речной гном за каждые 2 потраченные 💰.
  372: {
    *effect(g, ctx) {
      const n = Math.floor((ctx.X || 0) / 2);
      g.fx('gnomeAmbush', ctx.self, null, { n });
      for (let k = 0; k < n; k++) yield* g.create(ctx.player, 902); // a token that dies at once (Виктор) does not stop the rest
    },
  },

  // Стены змия хрустального.
  373: {
    static: {
      // Низкие двери: вы не можете играть Союзников за 4 💰 или больше (по текущей цене).
      forbidPlay(g, self, i, c, d) { return i === self.ctrl && d.type === 'ally' && g.costOf(i, c, d.id) >= 4; },
    },
    on: { *turnStart(g, self, ev) { if (mine(g, self, ev)) { g.fx('coins', self); yield* g.gainCoins(self.ctrl, 3, self); } } },
  },

  // Барбара, падший суккуб.
  374: {
    on: {
      // Оплата услуг: раз в ход (в фазе хода), по желанию.
      *damage(g, self, ev) {
        const s = g.s, p = self.ctrl;
        if (ev.tgt !== g.leader(p) || !(ev.amount > 0) || s.phase !== 'turn' || s.turn !== p || self.x.paid === s.turnStamp) return;
        if (!(yield* g.yesNo(p, `Оплата услуг: получить ${ev.amount} 💰?`, 'yes'))) return;
        self.x.paid = s.turnStamp;
        g.fx('payment', self);
        yield* g.gainCoins(p, ev.amount, self);
      },
      // Специфичные вкусы: 2 раны вашему Лидеру, затем исцелите ему 2 раны.
      *turnStart(g, self, ev) {
        if (!mine(g, self, ev)) return;
        const L = g.leader(self.ctrl);
        g.fx('peculiarTastes', self, L);
        yield* g.damage(self, L, 2);
        yield* g.heal(L, 2, self);
      },
    },
  },

  // Командный игрок: ваши Союзники в соседних регионах +1/+1.
  375: {
    *onEnter(g, self) {
      if (self.zone !== 'field') return;
      const list = g.adjacent(self.region).map((r) => g.allyAt(self.ctrl, r)).filter(Boolean);
      g.fx('teamPlayer', self, list);
      for (const a of list) yield* g.buff(a, 1, 1, 'perm', self);
    },
  },

  // Наездник на жабе.
  376: {
    on: {
      // Налёт гномов: другой ваш Союзник стоимостью ≤3 появляется — первый раз за фазу — возьмите карту.
      *enter(g, self, ev) {
        const c = ev.inst;
        if (c === self || c.ctrl !== self.ctrl || g.cardType(c) !== 'ally' || costNum(g, c) > 3) return;
        if (self.x.raidP === g.s.phaseId) return;
        self.x.raidP = g.s.phaseId;
        g.fx('draw', self);
        yield* g.draw(self.ctrl, 1);
      },
    },
    abilities: [{
      // Атака языком: 4 💰 — оглушите вражеского Союзника в этом или соседнем регионе, раз в фазу.
      name: 'Атака языком', limit: 'phase', cost: { coins: 4 },
      can: (g, self) => g.targetCandidates(self.ctrl, { kind: 'ally', side: 'enemy' }).some((t) => near(self, t)),
      *plan(g, ctx) {
        const me = ctx.self;
        const t = yield* g.chooseTarget(ctx, { kind: 'ally', side: 'enemy', prompt: 'Атака языком: оглушите вражеского Союзника рядом', filter: (g2, t2) => near(me, t2) });
        if (!t) return false;
      },
      *effect(g, ctx) { const t = g.card(ctx.targets[0]); g.fx('tongue', ctx.self, t); g.stun(t, ctx.self); },
    }],
  },

  // Разносчики пламени: боевые раны вражескому Лидеру/Напарнику → 1 рана каждому Лидеру.
  377: {
    on: {
      *damage(g, self, ev) {
        if (ev.src !== self || !ev.combat || !(ev.amount > 0) || ev.tgtCtrl === self.ctrl || !['leader', 'companion'].includes(g.cardType(ev.tgt))) return;
        const both = [g.leader(0), g.leader(1)];
        g.fx('spreadingFire', self, both);
        for (const L of both) yield* g.damage(self, L, 1);
      },
    },
  },

  // Рубака преисподней: 3 раны вашему Лидеру, затем уничтожьте вражеского Союзника стоимостью ≤3.
  378: {
    *onEnter(g, self) {
      const p = self.ctrl;
      g.fx('hellBlade', self, g.leader(p));
      yield* g.damage(self, g.leader(p), 3);
      const cands = g.targetCandidates(p, { kind: 'ally', side: 'enemy', filter: (g2, t) => costNum(g2, t) <= 3 });
      const t = yield* g.pickCard(p, cands, 'Адский клинок: уничтожьте вражеского Союзника стоимостью 3 💰 или меньше');
      if (t) yield* g.destroy(t, self);
    },
  },
};
