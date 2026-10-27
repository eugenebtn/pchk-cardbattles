// Скрижаль Крысы Ларисы (стартовый набор), карты 22–44.
// Токены (Крыса 46, Коза 45, Кошка 48, белки 49/50, Дитя 47) и обратные стороны
// (Квирк-коза 54, Альбо-крыса 58, Павел-пони 52) — в tokens.js.
const mine = (g, self, ev) => ev.player === self.ctrl;
const ALL_REGIONS = [0, 1, 2, 3, 4];

/** Light stand-in instance, used only to ask the engine whether a token may be put in a region. */
function probe(id, p) {
  return { uid: -1, id, owner: p, ctrl: p, zone: 'limbo', region: null, slot: null, dmg: 0, mods: [], kws: [], tok: {}, stunUntil: -1, created: true, equip: null, extraTypes: [], enteredAt: 0, x: {}, used: {} };
}
/** Can player p put a new ally `id` into region r (empty and not forbidden, e.g. by Павел Толя)? */
export function canAllyAt(g, p, id, r) {
  return !g.allyAt(p, r) && g.allyRegions(p, probe(id, p), id).includes(r);
}
/** -1/-1 without an immediate death check: the card dies at the next check, after the other «появляется» triggers. */
function softBuff(g, t, atk, hp, src) {
  if (!t || !g.onField(t)) return;
  t.mods.push({ atk, hp, until: null, src: src?.uid });
  g.emit('buff', { uid: t.uid, atk, hp, src: src?.uid, log: `«${g.name(t)}» получает ${atk >= 0 ? '+' : ''}${atk}/${hp >= 0 ? '+' : ''}${hp}.` });
}
/** «В начале вашего хода вы можете перевернуть эту карту обратной стороной.» */
function flipFront(backId, prompt, fxName) {
  return function* turnStart(g, self, ev) {
    if (!mine(g, self, ev)) return;
    // A companion (Квирк) turning into an ally needs a free region.
    if (g.cardType(self) !== 'ally' && !g.allyRegions(self.ctrl, self, backId).length) return;
    if (yield* g.yesNo(self.ctrl, prompt, 'no')) { g.fx(fxName, self); yield* g.flip(self, backId); }
  };
}
/**
 * Did this card just die from combat wounds of the current strike step?
 * (the engine then runs the «при нанесении ран» triggers of that step via afterStrikes)
 */
function diedInStrike(g, self) {
  if (!g.s.inBattle) return false;
  const STOP = new Set(['declare', 'declareAbility', 'resolve', 'ability', 'regionStart', 'battleStart', 'turnStart', 'round']);
  for (let k = g.events.length - 1; k >= 0; k--) {
    const e = g.events[k];
    if (STOP.has(e.type)) return false;
    if (e.type === 'damage' && e.tgt === self.uid) return !!e.combat;
  }
  return false;
}
/** Run `fn` right after the «при нанесении ран» triggers of the current strike step. */
function afterThisStrike(g, fn) {
  const prev = g.afterStrikes;
  g.afterStrikes = function* (defer) {
    g.afterStrikes = prev;
    yield* prev.call(g, defer);
    yield* fn();
  };
}

export default {
  // Крыса Лариса, отважная спутница (Лидер). «Пи-Пи-Пи» (скидка первой карте хода) — в движке, costOf.
  41: {
    on: {
      // «Рой крыс!» — обязательно (ответ авторов).
      *battleStart(g, self) {
        const p = self.ctrl;
        if (ALL_REGIONS.every((r) => g.allyAt(p, r))) {
          const t = yield* g.pickCard(p, g.allies(p), 'Рой крыс!: ваш выбранный Союзник получает +1/+1', 'buff');
          if (t) { g.fx('ratSwarmBuff', self, t); yield* g.buff(t, 1, 1, 'perm', self); }
        } else {
          g.fx('ratSwarm', self);
          yield* g.create(p, 46);
        }
      },
    },
  },

  // Рой крыс: 2 Крысы + 1 за каждый «Рой крыс» на вашем кладбище.
  22: {
    *effect(g, ctx) {
      const p = ctx.player;
      const n = 2 + g.P(p).grave.filter((c) => c.id === 22).length;
      g.fx('ratSwarm', ctx.self, null, { n });
      for (let k = 0; k < n; k++) yield* g.create(p, 46); // a token that dies at once (Виктор) does not stop the rest
    },
  },

  // Марш-бросок (Опережение): все ваши Союзники +1/+0 до начала вашего следующего хода.
  23: {
    *effect(g, ctx) {
      const list = g.allies(ctx.player);
      g.fx('forcedMarch', ctx.self, list);
      for (const a of list) yield* g.buff(a, 1, 0, 'nextTurn', ctx.self);
    },
  },

  // Самопожертвование: уничтожьте вашего Союзника; если вы это делаете — возьмите 2 карты.
  24: {
    targets: { kind: 'ally', side: 'own', prompt: 'Самопожертвование: уничтожьте вашего Союзника' },
    *effect(g, ctx) {
      const t = g.card(ctx.targets[0]);
      g.fx('sacrifice', ctx.self, t);
      if (yield* g.destroy(t, ctx.self)) { g.fx('draw', ctx.self); yield* g.draw(ctx.player, 2); }
    },
  },

  // Исполнение желания: найдите любую карту в Скрижали и сразу используйте её (оплатив стоимость), затем перемешайте.
  25: {
    *effect(g, ctx) {
      const i = ctx.player, s = g.s;
      const main = s.turn === i && s.phase === 'turn' && s.stack.length === 0;
      // Карту с Альтернативой можно использовать любой из сторон.
      const sides = (c) => g.sidesOf(c).filter((side) => g.canPlay(i, c, side, { main }));
      const cands = g.P(i).deck.filter((c) => sides(c).length);
      g.fx('wish', ctx.self);
      if (cands.length) {
        const [c] = yield* g.pickFrom(i, cands, { min: 1, max: 1, prompt: 'Исполнение желания: выберите карту из Скрижали — она сразу используется (оплатите её стоимость)' });
        if (c) {
          const ok = sides(c);
          let side = ok[0];
          if (ok.length > 1) {
            side = yield* g.ask(i, { type: 'pick', prompt: 'Исполнение желания: какой стороной использовать карту?', options: ok.map((x) => ({ id: x, label: g.def({ id: x }).name })), auto: false });
          }
          yield* g.declareCard(i, c, side, { noCancel: true });
        }
      } else g.log('Исполнение желания: в Скрижали нет карты, которую можно использовать сейчас.');
      g.shuffleDeck(i);
    },
  },

  // Праздничное застолье: все ваши Союзники +1/+1, затем лечение Лидеру или карты.
  26: {
    *plan(g, ctx) {
      const m = yield* g.ask(ctx.player, { type: 'pick', prompt: 'Праздничное застолье: выберите свойство', options: [{ id: 0, label: 'Исцелить Лидеру 2 раны за каждого Союзника' }, { id: 1, label: 'Взять карты по числу Союзников, затем сбросить 2' }], cancel: true, auto: false });
      if (m == null) return false;
      ctx.mode = m;
    },
    *effect(g, ctx) {
      const p = ctx.player;
      const list = g.allies(p);
      g.fx('feast', ctx.self, list);
      for (const a of list) yield* g.buff(a, 1, 1, 'perm', ctx.self);
      const n = g.allies(p).length;
      if (ctx.mode === 0) {
        g.fx('heal', ctx.self, g.leader(p));
        yield* g.heal(g.leader(p), 2 * n, ctx.self);
      } else {
        g.fx('draw', ctx.self);
        yield* g.draw(p, n);
        yield* g.discardChoice(p, 2, 'Праздничное застолье: сбросьте 2 карты');
      }
    },
  },

  // Павел Толя, болтливый конюх (обратная сторона — облик пони, 52).
  27: {
    on: { turnStart: flipFront(52, 'Обращение в пони: перевернуть Павла Толю?', 'ponyForm') },
    static: {
      // Смрадное облако: противник не может класть новых Союзников в регион Павла…
      forbidRegion(g, self, player, region) { return self.zone === 'field' && player !== self.ctrl && region === self.region; },
      // …а уже стоящий там вражеский Союзник получает -1/-1, пока Павел на поле.
      atk(g, self, card) { return cloud(self, card) ? -1 : 0; },
      hp(g, self, card) { return cloud(self, card) ? -1 : 0; },
    },
  },

  // Медведь-шатун: при появлении сражается с выбранным вражеским Союзником.
  28: {
    *onEnter(g, self) {
      const cands = g.targetCandidates(self.ctrl, { kind: 'ally', side: 'enemy' });
      const t = yield* g.pickCard(self.ctrl, cands, 'Медведь-шатун: выберите вражеского Союзника для схватки');
      if (t) { g.fx('bearFight', self, t); yield* g.fight(self, t); }
    },
  },

  // Которный, тихий убийца: в начале вашего хода исцелите 3 раны вашему Лидеру.
  29: {
    on: {
      *turnStart(g, self, ev) {
        if (!mine(g, self, ev)) return;
        g.fx('lickWounds', self, g.leader(self.ctrl));
        yield* g.heal(g.leader(self.ctrl), 3, self);
      },
    },
  },

  // Виктор, гномик-матершинник: новый вражеский Союзник -1/-1, новый ваш +1/+1 (и токены тоже).
  30: {
    on: {
      *enter(g, self, ev) {
        const c = ev.inst;
        if (c === self || !g.onField(c) || g.cardType(c) !== 'ally') return;
        if (c.ctrl === self.ctrl) { g.fx('inspiringVerse', self, c); yield* g.buff(c, 1, 1, 'perm', self); }
        else { g.fx('swearSong', self, c); softBuff(g, c, -1, -1, self); }
      },
    },
  },

  // Альбо, офицер городской стражи (обратная сторона — облик крысы, 58).
  31: {
    on: { turnStart: flipFront(58, 'Обращение в крысу: перевернуть Альбо?', 'ratForm') },
    static: {
      // На страже закона: в ваш ход противник не может играть Действия с Опережением.
      forbidPlay(g, self, i, c, d, { fast }) { return i !== self.ctrl && g.s.phase === 'turn' && g.s.turn === self.ctrl && d.type === 'action' && fast; },
    },
  },

  // Бешеная обезьянка.
  32: {
    *onEnter(g, self) {
      // Проворство: если в регионе есть ваше Место — +1/+0 и Манёвр.
      if (self.zone === 'field' && g.placeAt(self.ctrl, self.region)) {
        g.fx('agility', self);
        yield* g.buff(self, 1, 0, 'perm', self);
        g.grant(self, 'maneuver', 'perm', self);
      }
    },
    // Обезьяна с гранатой: раны любому выбранному вражескому персонажу, равные атаке при гибели.
    *onDestroyed(g, self, info) {
      const p = info.ctrl, n = info.atk;
      const grenade = function* () {
        if (n <= 0) return;
        const cands = g.targetCandidates(p, { kind: 'character', side: 'enemy' });
        const t = yield* g.pickCard(p, cands, `Обезьяна с гранатой: ${n} ран(ы) вражескому персонажу`);
        if (t) { g.fx('grenade', self, t); yield* g.damage(self, t, n); }
      };
      // Ответ авторов: одновременные триггеры второго игрока срабатывают раньше. Если обезьяна первого
      // игрока погибла от боевых ран, «при нанесении ран» второго игрока (Бойцы Октагона) успевают раньше.
      if (p === g.s.first && diedInStrike(g, self)) afterThisStrike(g, grenade);
      else yield* grenade();
    },
  },

  // Пороховой склад.
  33: {
    on: { *turnStart(g, self, ev) { if (mine(g, self, ev)) { g.fx('coins', self); yield* g.gainCoins(self.ctrl, 1, self); } } },
    abilities: [{
      name: 'Взрыв!', cost: { coins: 6, selfDestroy: true },
      targets: { kind: 'cardNotLeader', side: 'enemy', prompt: 'Взрыв!: уничтожьте вражескую карту (кроме Лидера)' },
      *effect(g, ctx) { const t = g.card(ctx.targets[0]); g.fx('explosion', ctx.self, t); yield* g.destroy(t, ctx.self); },
    }],
  },

  // Презрение белок: 3 Злобные белки (Прорыв) или 2 белки-летяги (Манёвр).
  34: {
    *plan(g, ctx) {
      const m = yield* g.ask(ctx.player, { type: 'pick', prompt: 'Презрение белок: выберите свойство', options: [{ id: 0, label: '3 Злобные белки 1/1 (Прорыв)' }, { id: 1, label: '2 Злобные белки-летяги 1/1 (Манёвр)' }], cancel: true, auto: false });
      if (m == null) return false;
      ctx.mode = m;
    },
    *effect(g, ctx) {
      const [id, n] = ctx.mode === 0 ? [50, 3] : [49, 2];
      g.fx('squirrels', ctx.self, null, { n });
      for (let k = 0; k < n; k++) yield* g.create(ctx.player, id); // a token that dies at once (Виктор) does not stop the rest
    },
  },

  // Вдохновляющая речь: исцелите 1 рану каждому вашему Союзнику, все они +1/+1.
  35: {
    *effect(g, ctx) {
      const list = g.allies(ctx.player);
      g.fx('inspiringSpeech', ctx.self, list);
      for (const a of list) yield* g.heal(a, 1, ctx.self);
      for (const a of g.allies(ctx.player)) yield* g.buff(a, 1, 1, 'perm', ctx.self);
    },
  },

  // Верёвка с кошкой: Союзник в руку владельца, затем создайте Кошку 2/2 (Манёвр).
  36: {
    targets: { kind: 'ally', side: 'any', prompt: 'Верёвка с кошкой: верните Союзника в руку владельца' },
    *effect(g, ctx) {
      const t = g.card(ctx.targets[0]);
      g.fx('catRope', ctx.self, t);
      yield* g.toHand(t);
      g.fx('catSummon', ctx.self);
      yield* g.create(ctx.player, 48);
    },
  },

  // Живой таран: уничтожьте вашего Союзника; если вы это делаете — уничтожьте вражеское Место.
  37: {
    targets: [
      { kind: 'ally', side: 'own', prompt: 'Живой таран: уничтожьте вашего Союзника' },
      { kind: 'place', side: 'enemy', optional: true, prompt: 'Живой таран: вражеское Место, которое будет уничтожено' },
    ],
    *effect(g, ctx) {
      const a = g.card(ctx.targets[0]);
      g.fx('ram', ctx.self, a);
      if (!(yield* g.destroy(a, ctx.self))) return;
      const pl = ctx.targets[1] != null ? g.card(ctx.targets[1]) : null;
      if (pl && g.onField(pl)) { g.fx('ramPlace', ctx.self, pl); yield* g.destroy(pl, ctx.self); }
    },
  },

  // Сельская местность (Оберег): +1 💰; если в регионе нет вашего Союзника — создайте Козу (обязательно).
  38: {
    on: {
      *turnStart(g, self, ev) {
        if (!mine(g, self, ev)) return;
        g.fx('coins', self);
        yield* g.gainCoins(self.ctrl, 1, self);
        if (!g.onField(self)) return;
        if (canAllyAt(g, self.ctrl, 45, self.region)) { g.fx('goatSummon', self); yield* g.create(self.ctrl, 45, self.region); }
      },
    },
  },

  // Болтливая лошадь: противник показывает N карт (N — ваши карты Животных), вы выбираете одну — он её сбрасывает.
  39: {
    *onEnter(g, self) {
      const me = self.ctrl, opp = 1 - me;
      const n = g.countType(me, 'ЖИВОТНОЕ');
      const hand = g.P(opp).hand;
      if (n <= 0 || !hand.length) return;
      const shown = hand.length <= n ? [...hand]
        : yield* g.pickFrom(opp, hand, { min: n, max: n, prompt: `Болтливая лошадь: покажите противнику ${n} карт(ы) из руки` });
      g.fx('horseGossip', self, shown);
      g.emit('shown', { player: opp, ids: shown.map((c) => c.id) });
      g.log(`${g.P(opp).name} показывает: ${shown.map((c) => `«${g.name(c)}»`).join(', ')}.`);
      const [c] = yield* g.pickFrom(me, shown, { min: 1, max: 1, prompt: 'Болтливая лошадь: какую карту противник положит на кладбище?' });
      if (c) yield* g.discard(opp, c);
    },
  },

  // Болотная тварь Нина.
  40: {
    *onEnter(g, self) {
      if (self.zone !== 'field') return;
      for (const r of g.adjacent(self.region)) {
        if (!canAllyAt(g, self.ctrl, 47, r)) continue;
        g.fx('swampChild', self, null, { region: r });
        yield* g.create(self.ctrl, 47, r);
      }
    },
    abilities: [{
      // Моя добыча!: без ограничений по числу использований (ответ авторов).
      name: 'Моя добыча!',
      can: (g, self) => preyCands(g, self.ctrl).length > 0,
      *plan(g, ctx) {
        const t = yield* g.pickCard(ctx.player, preyCands(g, ctx.player), 'Моя добыча!: уничтожьте вашего Союзника (не Дитя)', 'harm', { optional: true });
        if (!t) return false;
        g.fx('prey', ctx.self, t);
        yield* g.destroy(t, ctx.self);
      },
      *effect(g, ctx) {
        const kids = g.allies(ctx.player).filter((c) => c.id === 47);
        g.fx('feedChildren', ctx.self, kids);
        for (const c of kids) yield* g.buff(c, 1, 1, 'perm', ctx.self);
      },
    }],
  },

  // Квирк, друид-ветеринар (обратная сторона — облик козы, 54).
  42: {
    on: {
      turnStart: flipFront(54, 'Обращение в козу: перевернуть Квирка?', 'goatForm'),
      // Ветеринар: ваша карта Животного, появившаяся на поле, получает +1/+1.
      *enter(g, self, ev) {
        const c = ev.inst;
        if (c === self || c.ctrl !== self.ctrl || !g.onField(c) || !g.isType(c, 'ЖИВОТНОЕ')) return;
        g.fx('vet', self, c);
        yield* g.buff(c, 1, 1, 'perm', self);
      },
    },
  },

  // Ворон Барон, мастер хлебных крошек.
  43: {
    on: {
      *turnStart(g, self, ev) {
        if (!mine(g, self, ev)) return;
        const p = self.ctrl;
        const cands = [...g.items(p), ...(g.placeRegions(p).length ? g.places(p) : [])].filter((c) => !g.isLegend(c));
        const t = yield* g.pickCard(p, cands, 'Хлебный мякиш: создать копию вашего Предмета или Места (тип Хлеб)?', 'buff', { optional: true });
        if (!t) return;
        g.fx('breadCopy', self, t);
        yield* g.createCopy(p, t, ['ХЛЕБ'], self);
      },
    },
    // Покидая поле, уничтожает все ваши карты Хлеба.
    *onLeave(g, self, info) {
      const bread = g.field(info.ctrl).filter((c) => g.isType(c, 'ХЛЕБ'));
      if (bread.length) g.fx('breadCrumble', self, bread);
      for (const b of bread) yield* g.destroy(b, null);
    },
  },

  // Канделакис, организатор боёв карликов.
  44: {
    on: {
      // Удачная ставка: только в фазе Сражения (ответ авторов), за любого раненого Союзника.
      *damage(g, self, ev) {
        if (g.s.phase !== 'battle' || !(ev.amount > 0) || !ev.tgt || g.cardType(ev.tgt) !== 'ally') return;
        g.fx('luckyBet', self, ev.tgt);
        yield* g.gainCoins(self.ctrl, 1, self);
      },
    },
    abilities: [{
      name: 'Мотивация', fast: true, cost: { coins: 3 },
      targets: { kind: 'ally', side: 'own', hint: 'buff', prompt: 'Мотивация: ваш Союзник получает +2/+0 и Прорыв' },
      *effect(g, ctx) {
        const t = g.card(ctx.targets[0]);
        g.fx('motivation', ctx.self, t);
        yield* g.buff(t, 2, 0, 'perm', ctx.self);
        g.grant(t, 'breakthrough', 'perm', ctx.self);
      },
    }],
  },
};

function cloud(pavel, card) {
  return pavel.zone === 'field' && card && card.zone === 'field' && card.slot === 'ally' && card.ctrl !== pavel.ctrl && card.region === pavel.region;
}
function preyCands(g, p) {
  return g.allies(p).filter((c) => c.id !== 47 && !g.has(c, 'indestructible'));
}
