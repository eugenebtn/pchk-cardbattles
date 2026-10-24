// Скрижали Эрика Пэнисова и Софии (ids 117–175).
// 83 Украшение и 120 Золотая монета описаны в tokens.js; 136, 147, 152, 161 — без свойств сверх ключевых слов.
import { CARDS } from '../data/cards.js';

const mine = (g, self, ev) => ev.player === self.ctrl;
const isFaceType = (g, c) => ['leader', 'companion'].includes(g.cardType(c));
const enemyFaceHit = (g, self, ev) => ev.amount > 0 && ev.tgtCtrl !== self.ctrl && isFaceType(g, ev.tgt);
// Стоимость для проверок «стоимостью N 💰 или меньше»: у токенов стоимости нет — считаем 0, X — тоже 0.
const numCost = (d) => (typeof d.cost === 'number' ? d.cost : 0);
const isTavern = (g, c) => !!c && g.isType(c, 'ТАВЕРНА');
const leaderWounds = (g, L) => Math.max(0, g.def(L).hp - L.hpNow);
const wounds = (g, c) => (g.cardType(c) === 'leader' ? leaderWounds(g, c) : c.dmg);

// «Вы можете использовать Снабжение» (необязательное).
function* optionalSupply(g, i, prompt) {
  const cands = g.field(i).filter((c) => Object.values(c.tok).some((v) => v > 0));
  if (!cands.length) return false;
  const c = yield* g.pickCard(i, cands, prompt, 'buff', { optional: true });
  if (!c) return false;
  g.fx('supply', c);
  const types = Object.keys(c.tok).filter((t) => c.tok[t] > 0);
  let t = types[0];
  if (types.length > 1) t = types[yield* g.pickOption(i, types, 'Какую фишку добавить?')];
  yield* g.addTokens(c, t, 1);
  return true;
}

// Двигатель торговли (оба повара): ваши Места в этом регионе приносят на 1 💰 больше.
const tradeEngine = {
  income(g, self, src, player) {
    return player === self.ctrl && src.ctrl === self.ctrl && src.zone === 'field' && g.cardType(src) === 'place' && src.region === self.region ? 1 : 0;
  },
};

// Бег по стенам (Цисгендий и Игристое).
const wallRun = {
  *damage(g, self, ev) {
    if (ev.src !== self || !g.onField(self) || !enemyFaceHit(g, self, ev)) return;
    if (yield* g.yesNo(self.ctrl, `Бег по стенам: вернуть «${g.name(self)}» в руку?`, 'no')) {
      g.fx('wallRun', self);
      yield* g.toHand(self);
    }
  },
};

// Сколько карт Союзников появилось на поле в текущей фазе (по журналу событий движка).
function alliesEnteredThisPhase(g) {
  let n = 0;
  for (let k = g.events.length - 1; k >= 0; k--) {
    const e = g.events[k];
    if (e.type === 'turnStart' || e.type === 'battleStart') break;
    if (e.type === 'enter' && CARDS[e.id]?.type === 'ally') n++;
  }
  return n;
}

const TYPE_NAMES = [['ally', 'Союзник'], ['companion', 'Напарник'], ['action', 'Действие'], ['item', 'Предмет'], ['place', 'Место']];

export default {
  // Эрик Пэнисов (Лидер). «Непредсказуемость» — в движке (canPlay).
  117: {
    on: {
      // Невероятная жестокость
      *damage(g, self, ev) {
        const a = ev.src;
        if (!a || a.ctrl !== self.ctrl || g.cardType(a) !== 'ally' || !g.onField(a) || !enemyFaceHit(g, self, ev)) return;
        g.fx('cruelty', self, a);
        yield* g.buff(a, 1, 0, 'perm', self);
      },
    },
  },

  // София (Лидер)
  118: {
    on: {
      *turnStart(g, self, ev) {
        if (!mine(g, self, ev)) return;
        if (self.hpNow >= g.def(self).hp) { g.fx('draw', self); yield* g.draw(self.ctrl, 1); }
        else { g.fx('heal', self, self); yield* g.heal(self, 2, self); }
      },
    },
    static: {
      // Искусство друидов
      costMod(g, self, player, card, def, cur) { return player === self.ctrl && def.subtypes.includes('ПРИРОДА') && cur > 1 ? -1 : 0; },
    },
  },

  // Али, суровый корчмарь
  119: {
    *onEnter(g, self) {
      const cands = g.targetCandidates(self.ctrl, { kind: 'ally', side: 'enemy', filter: (g2, t) => isTavern(g2, g2.placeAt(self.ctrl, t.region)) });
      const t = yield* g.pickCard(self.ctrl, cands, 'Покушение на гостя: уничтожить вражеского Союзника в регионе с вашей Таверной?', 'harm', { optional: true });
      if (t) { g.fx('assassinate', self, t); yield* g.destroy(t, self); }
    },
    on: {
      // Семейный бизнес
      *destroyed(g, self, info) {
        if (info.exiled || g.def(info.inst).type !== 'ally') return;
        g.fx('coins', self);
        yield* g.gainCoins(self.ctrl, 1, self);
      },
    },
  },

  // Володимир: карты, используемые не в ваш ход, стоят на 1 💰 меньше.
  121: {
    static: { costMod(g, self, player) { return player === self.ctrl && g.s.turn !== player ? -1 : 0; } },
  },

  // Женуария Николаевна (лицевая сторона)
  123: {
    on: {
      *enter(g, self, ev) {
        const a = ev.inst;
        if (a === self || a.ctrl !== self.ctrl || g.cardType(a) !== 'ally' || a.zone !== 'field') return;
        if (!g.adjacent(self.region).includes(a.region)) return;
        g.fx('healingWord', self, a);
        yield* g.buff(a, 0, 2, 'perm', self);
      },
      *turnStart(g, self, ev) {
        if (!mine(g, self, ev)) return;
        if (yield* g.yesNo(self.ctrl, 'Обращение: перевернуть Женуарию в паучиху?', 'yes')) { g.fx('transform', self); yield* g.flip(self, 122); }
      },
    },
  },
  // Женуария-паучиха (обратная сторона)
  122: {
    on: {
      *enter(g, self, ev) {
        const a = ev.inst;
        if (a.ctrl === self.ctrl || g.cardType(a) !== 'ally' || a.zone !== 'field') return;
        if (![self.region, ...g.adjacent(self.region)].includes(a.region)) return;
        g.fx('web', self, a);
        yield* g.buff(a, -2, 0, 'perm', self);
      },
      *turnStart(g, self, ev) {
        if (!mine(g, self, ev)) return;
        if (yield* g.yesNo(self.ctrl, 'Развращение: перевернуть паучиху обратно в Женуарию?', 'no')) { g.fx('transform', self); yield* g.flip(self, 123); }
      },
    },
  },

  // Бунгало с кукурузой
  124: {
    on: {
      *turnStart(g, self, ev) {
        if (!mine(g, self, ev)) return;
        const nature = g.P(self.ctrl).grave.filter((c) => g.def(c).subtypes.includes('ПРИРОДА')).length;
        g.fx('coins', self);
        yield* g.gainCoins(self.ctrl, 1 + (nature >= 3 ? 1 : 0), self);
      },
    },
  },

  // Подземный тайник
  125: {
    on: {
      *turnStart(g, self, ev) {
        if (!mine(g, self, ev)) return;
        g.fx('coins', self);
        yield* g.gainCoins(self.ctrl, 1, self);
        yield* g.addTokens(self, 'goods', 1, self);
      },
    },
    abilities: [
      {
        name: 'Достать товар', cost: { goods: 2 },
        *effect(g, ctx) { g.fx('draw', ctx.self); yield* g.draw(ctx.player, 1); },
      },
      {
        name: 'Достать ножи', fast: true, cost: { goods: 2 },
        can: (g, self) => { const a = g.allyAt(self.ctrl, self.region); return !!a && g.isType(a, 'ПЛУТ'); },
        *effect(g, ctx) { const L = g.leader(1 - ctx.player); g.fx('knives', ctx.self, L); yield* g.damage(ctx.self, L, 2); },
      },
    ],
  },

  // Цисгендий, неуловимый монах (Альтернатива — Игристое)
  127: {
    *onEnter(g, self) {
      const t = yield* g.pickCard(self.ctrl, g.allies(self.ctrl), 'Спасти от покушения: ваш Союзник получает Нерушимость до конца фазы', 'buff');
      if (t) { g.fx('protect', self, t); g.grant(t, 'indestructible', 'phase', self); }
    },
    on: wallRun,
  },
  // Игристое, агент под прикрытием (другая сторона Альтернативы)
  126: {
    // Карта сыграна этой стороной: при уходе в любую зону она снова становится Цисгендием (лицевой стороной).
    *plan(g, ctx) { if (ctx.self.id === 127) ctx.self.origId = 127; },
    *onEnter(g, self) {
      // Ловля снаряда: перенаправить вражеское свойство или Действие на стопке на эту карту.
      const opts = [];
      for (const it of g.s.stack) {
        if (it.player === self.ctrl) continue;
        if (it.kind === 'card' && g.def(it.inst).type !== 'action') continue;
        if (it.ctx.targets.includes(self.uid)) continue;
        it.ctx.targets.forEach((uid, k) => {
          const spec = it.ctx.specs[k];
          if (!spec || spec.zone || !spec.kind) return;
          if (!g.targetCandidates(it.player, { kind: spec.kind, side: spec.side, filter: spec.filter }).includes(self)) return;
          opts.push({ it, k, label: `${it.label}: цель «${g.card(uid) ? g.name(g.card(uid)) : '?'}» → Игристое` });
        });
      }
      if (!opts.length) return;
      const a = yield* g.pickOption(self.ctrl, ['Не менять цель', ...opts.map((o) => o.label)], 'Ловля снаряда: изменить цель вражеского свойства или Действия?');
      if (!a) return;
      const o = opts[a - 1];
      g.fx('catchShot', self, g.card(o.it.ctx.targets[o.k]));
      o.it.ctx.targets[o.k] = self.uid;
      g.log(`Игристое перехватывает «${o.it.label}».`);
    },
    on: wallRun,
  },

  // Отель «Глубокий канал»
  128: {
    *onEnter(g, self) {
      const i = self.ctrl, p = g.P(i);
      const top = p.deck.slice(0, 4);
      if (!top.length) return;
      if (!(yield* g.yesNo(i, 'Ежегодная встреча торговцев: посмотреть 4 верхних карты Скрижали?', 'yes'))) return;
      const merchants = top.filter((c) => g.isType(c, 'ТОРГОВЕЦ'));
      const shown = merchants.length ? yield* g.pickFrom(i, merchants, { min: 0, max: merchants.length, prompt: 'Покажите любое число Торговцев — они уйдут в руку' }) : [];
      for (const c of shown) { g.removeFromZone(c); c.zone = 'hand'; p.hand.push(c); g.emit('draw', { player: i, uid: c.uid, log: `${p.name} показывает «${g.name(c)}» и берёт в руку.` }); }
      const rest = top.filter((c) => !shown.includes(c));
      let order = rest;
      if (rest.length > 1) {
        const a = yield* g.ask(i, { type: 'order', prompt: 'В каком порядке положить остальные карты в низ Скрижали (первая — выше)?', options: rest.map((c) => ({ id: c.uid, cardId: c.id })) });
        const picked = (a || []).map((u) => rest.find((c) => c.uid === u)).filter(Boolean);
        order = [...new Set([...picked, ...rest])];
      }
      for (const c of order) { g.removeFromZone(c); c.zone = 'deck'; p.deck.push(c); }
      g.fx('merchants', self);
    },
    on: { *turnStart(g, self, ev) { if (mine(g, self, ev)) { g.fx('coins', self); yield* g.gainCoins(self.ctrl, 3, self); } } },
  },

  // Добромраз, коварный предсказатель
  129: {
    *onEnter(g, self) {
      const k = yield* g.pickOption(self.ctrl, TYPE_NAMES.map((t) => t[1]), 'Предсказание: выберите тип карты');
      self.x.prophecy = TYPE_NAMES[k ?? 0][0];
      g.log(`Добромраз предсказывает: «${TYPE_NAMES[k ?? 0][1]}».`);
    },
    on: {
      *cardUsed(g, self, ev) {
        if (ev.player === self.ctrl || !self.x.prophecy || ev.def.type !== self.x.prophecy) return;
        g.fx('prophecy', self); yield* g.draw(self.ctrl, 1);
      },
    },
  },

  // Рыночная площадь (Разговор с Торговцами — в движке)
  130: { on: { *turnStart(g, self, ev) { if (mine(g, self, ev)) { g.fx('coins', self); yield* g.gainCoins(self.ctrl, 3, self); } } } },

  // Удача полурослика
  131: {
    *plan(g, ctx) {
      const t = yield* g.chooseTarget(ctx, {
        hint: 'buff', prompt: 'Удача полурослика: ваша карта получает Оберег до конца фазы',
        candidates: (g2, c) => [g2.leader(c.player), ...g2.targetCandidates(c.player, { kind: 'card', side: 'own' })],
      });
      if (!t) return false;
    },
    *effect(g, ctx) {
      const t = g.card(ctx.targets[0]);
      g.fx('luck', ctx.self, t);
      g.grant(t, 'ward', 'phase', ctx.self);
      if (g.cardType(t) === 'ally') yield* g.buff(t, 1, 0, 'phase', ctx.self);
    },
  },

  // Последний миг
  132: {
    *effect(g, ctx) {
      const list = g.allies();
      g.fx('lastMoment', ctx.self, list);
      for (const a of list) yield* g.destroy(a, ctx.self);
    },
  },

  // Драконья ярость
  133: {
    targets: { kind: 'allyOrCompanion', side: 'enemy', prompt: 'Драконья ярость: X ран вражескому Союзнику или Напарнику' },
    *effect(g, ctx) {
      const t = g.card(ctx.targets[0]);
      g.fx('dragonFire', ctx.self, t);
      t.x.exileOnDeath = true;
      yield* g.damage(ctx.self, t, ctx.X || 0);
      yield* g.checkDeaths();
      if (g.onField(t)) delete t.x.exileOnDeath;
    },
  },

  // Лягание копытом
  134: {
    targets: { kind: 'ally', side: 'enemy', prompt: 'Лягание копытом: 2 раны и оглушение' },
    *effect(g, ctx) {
      const t = g.card(ctx.targets[0]);
      g.fx('hoofKick', ctx.self, t);
      yield* g.damage(ctx.self, t, 2);
      if (g.onField(t)) g.stun(t, ctx.self);
    },
  },

  // Повар борделя «Барсук»
  135: {
    static: tradeEngine,
    on: {
      // Сытный обед
      *coinsGained(g, self, ev) {
        const s = ev.src;
        if (ev.player !== self.ctrl || !s || s.ctrl !== self.ctrl || s.zone !== 'field' || g.cardType(s) !== 'place' || s.region !== self.region) return;
        const L = g.leader(self.ctrl);
        g.fx('heal', self, L); yield* g.heal(L, ev.amount, self);
      },
    },
  },

  // Жанна, благородная эльфийка
  137: {
    *onEnter(g, self) {
      const i = self.ctrl;
      const cands = g.P(i).hand.filter((c) => {
        const d = g.def(c);
        if (!g.isType(c, 'ПЛУТ') || typeof d.cost !== 'number' || d.cost > 2) return false;
        if (d.type === 'ally') return g.allyRegions(i, c, c.id).length > 0;
        if (d.type === 'place') return g.placeRegions(i).length > 0;
        return ['companion', 'item'].includes(d.type);
      });
      const c = yield* g.pickCard(i, cands, 'Забота матери: бесплатно положить Плута (до 2 💰) из руки на поле?', 'buff', { optional: true });
      if (!c) return;
      const d = g.def(c);
      let r = null;
      if (d.type === 'ally') r = yield* g.pickRegion(i, g.allyRegions(i, c, c.id), `Куда положить «${d.name}»?`);
      else if (d.type === 'place') r = yield* g.pickRegion(i, g.placeRegions(i), `Куда положить «${d.name}»?`, 'place');
      g.fx('motherCare', self, c);
      yield* g.putOnField(c, i, r);
    },
    on: {
      // Скрытая атака
      *enter(g, self, ev) {
        const a = ev.inst;
        if (a === self || a.ctrl !== self.ctrl || g.cardType(a) !== 'ally' || !g.isType(a, 'ПЛУТ') || !g.onField(a)) return;
        const n = g.atk(a);
        if (n <= 0) return;
        const t = yield* g.pickCard(self.ctrl, g.targetCandidates(self.ctrl, { kind: 'character', side: 'enemy' }), `Скрытая атака: ${n} ран вражескому персонажу`);
        if (t) { g.fx('sneakAttack', a, t); yield* g.damage(self, t, n); }
      },
    },
  },

  // Разбойник Кёнигпона
  138: { static: { atk(g, self, card) { return card === self && g.P(1 - self.ctrl).coins > 5 ? 2 : 0; } } },

  // Наёмник Пиф-Паф
  139: {
    *onEnter(g, self) { g.fx('supply', self); yield* g.supply(self.ctrl, 2); },
    on: {
      *cardUsed(g, self, ev) {
        if (ev.player !== self.ctrl || !ev.offTurn || ev.inst === self) return;
        g.fx('supply', self); yield* g.supply(self.ctrl, 2);
      },
    },
  },

  // Поглощение бездной
  140: {
    targets: { kind: 'cardNotLeader', side: 'enemy', prompt: 'Поглощение бездной: вражеская карта — в низ Скрижали владельца' },
    *effect(g, ctx) { const t = g.card(ctx.targets[0]); g.fx('abyss', ctx.self, t); yield* g.toDeckBottom(t); },
  },

  // Мелкая кража
  142: { *effect(g, ctx) { g.fx('theft', ctx.self); yield* g.create(ctx.player, 83); } },

  // Портовый попрошайка — кражу дохода делает движок (gainCoins).
  143: { stealIncome: true },

  // Ящик с инструментами
  144: {
    on: { *turnStart(g, self, ev) { if (mine(g, self, ev)) yield* optionalSupply(g, self.ctrl, 'Универсальный набор: Снабжение (можно пропустить)'); } },
    abilities: [{ name: 'Полезная находка', cost: { selfDestroy: true }, *effect(g, ctx) { g.fx('coins', ctx.self); yield* g.gainCoins(ctx.player, 1, null, { noMods: true }); } }],
  },

  // Внимательный осмотр
  145: {
    *effect(g, ctx) { g.fx('inspect', ctx.self); yield* g.supply(ctx.player, 2); yield* g.draw(ctx.player, 1); },
  },

  // Биктор Вуд — открытая рука противника в движке (view).
  146: {
    on: {
      // Подлый удар
      *damage(g, self, ev) {
        if (ev.src !== self || ev.amount <= 0 || ev.tgtCtrl === self.ctrl || g.cardType(ev.tgt) !== 'leader') return;
        const o = 1 - self.ctrl;
        const c = yield* g.pickCard(self.ctrl, g.P(o).hand, 'Подлый удар: выберите карту, которую противник сбросит');
        if (c) { g.fx('dirtyTrick', self, c); yield* g.discard(o, c); }
      },
    },
  },

  // Маска Януса
  148: {
    abilities: [
      {
        name: 'Некротический шар', cost: { coins: 3 },
        targets: { kind: 'allyOrCompanion', side: 'enemy', prompt: 'Некротический шар: раны = ваши оставшиеся 💰' },
        *effect(g, ctx) { const t = g.card(ctx.targets[0]); g.fx('darkOrb', ctx.self, t); yield* g.damage(ctx.self, t, g.P(ctx.player).coins); },
      },
      {
        name: 'Призыв нежити', cost: { coins: 4 },
        can: (g, self) => g.allyRegions(self.ctrl, self, 152).length > 0,
        *effect(g, ctx) {
          g.fx('raiseDead', ctx.self);
          const n = g.P(ctx.player).coins;
          const ghoul = yield* g.create(ctx.player, 152);
          if (ghoul && n > 0) yield* g.buff(ghoul, n, n, 'perm', ctx.self);
        },
      },
      {
        name: 'Мудрость Януса', cost: { coins: 2 }, limit: 'phase',
        *effect(g, ctx) {
          const i = ctx.player, p = g.P(i);
          const top = p.deck.slice(0, 3);
          if (!top.length) return;
          g.fx('janusWisdom', ctx.self);
          const ok = top.filter((c) => numCost(g.def(c)) <= p.coins);
          if (!ok.length) { g.log('Мудрость Януса: подходящих карт нет.'); return; }
          const [c] = yield* g.pickFrom(i, ok, { min: 0, max: 1, prompt: `Мудрость Януса: покажите карту стоимостью до ${p.coins} 💰 и возьмите её` });
          if (!c) return;
          g.removeFromZone(c); c.zone = 'hand'; p.hand.push(c);
          g.emit('draw', { player: i, uid: c.uid, log: `${p.name} показывает «${g.name(c)}» и берёт в руку.` });
        },
      },
    ],
  },

  // Золотой доспех Януса
  149: {
    *onEnter(g, self) { const L = g.leader(self.ctrl); g.fx('heal', self, L); yield* g.heal(L, g.P(self.ctrl).coins, self); },
    static: { income(g, self, src, player) { return player === self.ctrl && src.ctrl === self.ctrl ? 1 : 0; } },
  },

  // Бунт голубятни
  150: {
    *plan(g, ctx) {
      const r = yield* g.pickRegion(ctx.player, [0, 1, 2, 3, 4], 'Бунт голубятни: выберите регион', 'ally', { optional: true });
      if (r == null) return false;
      ctx.riotRegion = r;
    },
    *effect(g, ctx) {
      const r = ctx.riotRegion;
      const list = [];
      for (const p of [0, 1]) { const reg = g.P(p).regions[r]; if (reg.ally) list.push(reg.ally); if (reg.place) list.push(reg.place); }
      g.fx('pigeonRiot', ctx.self, list, { regions: [r] });
      for (const c of list) yield* g.toHand(c);
    },
  },

  // Главарь банды орков
  151: {
    *onEnter(g, self) {
      const cands = g.allies(self.ctrl).filter((a) => a !== self && numCost(g.def(a)) <= 2);
      const t = yield* g.pickCard(self.ctrl, cands, 'Уничтожить вашего Союзника (до 2 💰), чтобы создать Орка 3/3?', 'buff', { optional: true });
      if (!t) return;
      if (!(yield* g.destroy(t, self))) return;
      g.fx('orcGang', self);
      yield* g.create(self.ctrl, 147);
    },
  },

  // Кирюша, возрождённый бобёр
  153: {
    playFromGrave: true,
    on: {
      *turnStart(g, self, ev) {
        if (!mine(g, self, ev)) return;
        const cands = g.characters(self.ctrl).filter((c) => wounds(g, c) > 0);
        const t = yield* g.pickCard(self.ctrl, cands, 'Бобровая струя: исцелить 2 раны вашему персонажу?', 'buff', { optional: true });
        if (t) { g.fx('heal', self, t); yield* g.heal(t, 2, self); }
      },
    },
  },

  // Папа-ёлка
  154: { *onEnter(g, self) { g.fx('treeFamily', self); yield* g.create(self.ctrl, 161); } },

  // Походный бордель
  155: {
    cost(g, player, inst, base) { return base - alliesEnteredThisPhase(g); },
    on: { *turnStart(g, self, ev) { if (mine(g, self, ev)) { g.fx('coins', self); yield* g.gainCoins(self.ctrl, 2, self); } } },
  },

  // Верховный жрец Гуди — «Продление жизни» в движке (heal).
  156: {
    on: {
      // Необходимые жертвы
      *turnStart(g, self, ev) {
        if (!mine(g, self, ev)) return;
        const i = self.ctrl;
        const cands = g.P(i).hand.filter((c) => g.def(c).type === 'ally');
        const c = yield* g.pickCard(i, cands, 'Необходимые жертвы: сбросить Союзника из руки и исцелить Лидера на его здоровье?', 'buff', { optional: true });
        if (!c) return;
        const n = g.def(c).hp || 0;
        yield* g.discard(i, c);
        const L = g.leader(i);
        g.fx('sacrifice', self, L);
        yield* g.heal(L, n, self);
      },
    },
  },

  // Опутывание травами
  157: {
    cost(g, player, inst, base) { return base + g.allies(1 - player).length; },
    *effect(g, ctx) { g.fx('herbs', ctx.self); g.s.skipBattles++; g.log('Опутывание травами: следующая фаза Сражения пропускается.'); },
  },

  // Старейшина Пырей Коразон
  158: {
    on: {
      *damage(g, self, ev) {
        const s = g.s;
        if (ev.src !== self || !ev.bt || !s.inBattle || !g.onField(self) || !enemyFaceHit(g, self, ev)) return;
        if (self.x.leap === s.phaseId) return;
        self.x.leap = s.phaseId;
        const free = [0, 1, 2, 3, 4].filter((r) => !s.battled.includes(r) && r !== s.battleRegion && !g.allyAt(self.ctrl, r));
        const r = yield* g.pickRegion(self.ctrl, free, 'Прыжок на боевом баране: переместить Пырея в регион, где ещё не было Сражения?', 'ally', { optional: true });
        if (r == null) return;
        g.fx('ramLeap', self);
        g.moveAlly(self, r);
      },
    },
  },

  // Шаманизм
  159: {
    canPlay(g, i, c) {
      const al = g.P(i).grave.filter((x) => g.def(x).type === 'ally' && !g.legendClash(i, x));
      return al.some((x) => g.allyRegions(i, x, x.id).length > 0);
    },
    *plan(g, ctx) {
      const t = yield* g.chooseTarget(ctx, {
        zone: 'grave', hint: 'buff', prompt: 'Шаманизм: Союзник из вашего кладбища',
        candidates: (g2, c) => g2.P(c.player).grave.filter((x) => g2.def(x).type === 'ally' && !g2.legendClash(c.player, x)),
      });
      if (!t) return false;
    },
    *effect(g, ctx) {
      const t = g.card(ctx.targets[0]);
      const regs = g.allyRegions(ctx.player, t, t.id);
      if (!regs.length) return;
      const r = yield* g.pickRegion(ctx.player, regs, `Куда положить «${g.name(t)}»?`);
      g.fx('shaman', ctx.self, t);
      yield* g.putOnField(t, ctx.player, r);
    },
  },

  // Таверна «Кайф»
  160: {
    on: {
      *turnStart(g, self, ev) {
        if (!mine(g, self, ev)) return;
        const n = g.P(self.ctrl).grave.filter((c) => g.def(c).type === 'ally').length;
        g.fx('coins', self);
        yield* g.gainCoins(self.ctrl, 1 + Math.floor(n / 2), self);
      },
    },
  },

  // Обломки торгового судна
  162: {
    enterTokens: { goods: 3 },
    on: {
      *turnStart(g, self, ev) {
        if (!mine(g, self, ev) || g.tokens(self, 'goods') <= 0) return;
        self.tok.goods -= 1; g.emit('tokens', { uid: self.uid });
        g.fx('shipwreck', self);
        yield* g.gainCoins(self.ctrl, 4, self);
      },
    },
  },

  // Добродушный повар
  163: {
    static: tradeEngine,
    on: {
      // Тёплый приём
      *battleStart(g, self) {
        const cands = g.allies(self.ctrl).filter((a) => isTavern(g, g.placeAt(self.ctrl, a.region)));
        const t = yield* g.pickCard(self.ctrl, cands, 'Тёплый приём: ваш Союзник рядом с Таверной получает +1/+1', 'buff');
        if (t) { g.fx('warmWelcome', self, t); yield* g.buff(t, 1, 1, 'perm', self); }
      },
    },
  },

  // Лёша Пэнисов, божественный ребёнок
  164: {
    on: {
      *turnStart(g, self, ev) { if (mine(g, self, ev)) { g.fx('foresight', self); yield* g.plan(self.ctrl, 3); } },
      // Реинкарнации Лёши
      *battleStart(g, self) {
        const i = self.ctrl;
        const cands = g.P(i).grave.filter((c) => g.def(c).type === 'ally' && g.allyRegions(i, c, c.id).length > 0);
        const t = yield* g.pickCard(i, cands, 'Реинкарнации Лёши: положить Союзника из кладбища на поле до конца Сражения?', 'buff', { optional: true });
        if (!t) return;
        const r = yield* g.pickRegion(i, g.allyRegions(i, t, t.id), `Куда положить «${g.name(t)}»?`);
        g.fx('reincarnation', self, t);
        yield* g.putOnField(t, i, r);
        if (g.onField(t)) { t.x.lyosha = g.s.battleNo; t.x.lyoshaSrc = self.uid; }
      },
      *battleEnd(g, self) { yield* endReincarnations(g, self); },
    },
    // «Уберите этого Союзника из игры в конце фазы Сражения» is a delayed effect that should outlive Лёша,
    // but the engine has no end-of-battle hook for cards that left the field. Fallback: if Лёша leaves
    // during the Сражение, its reincarnations leave right away instead of staying on the field forever.
    *onLeave(g, self) { if (g.s.inBattle) yield* endReincarnations(g, self); },
    // Убежать к маме
    *beforeDestroyed(g, self) { g.fx('runToMom', self); yield* g.exile(self); return 'prevented'; },
  },

  // Телекинез
  165: {
    targets: { kind: 'allyCompanionItem', side: 'enemy', prompt: 'Телекинез: вражеский Союзник, Напарник или Предмет — в руку владельца' },
    *effect(g, ctx) {
      const t = g.card(ctx.targets[0]);
      g.fx('telekinesis', ctx.self, t);
      yield* g.toHand(t);
      yield* g.draw(ctx.player, 1);
    },
  },

  // Подприкрытус, тифлинг-шпион
  166: {
    *onEnter(g, self) {
      const t = yield* g.pickCard(self.ctrl, g.targetCandidates(self.ctrl, { kind: 'character', side: 'enemy' }), 'Бросок кинжала: 1 рана вражескому персонажу');
      if (t) { g.fx('dagger', self, t); yield* g.damage(self, t, 1); }
    },
    on: {
      // Скрыться на виду
      *cardUsed(g, self) {
        if (!g.onField(self)) return;
        if (yield* g.yesNo(self.ctrl, 'Скрыться на виду: вернуть Подприкрытуса в руку?', 'no')) { g.fx('hide', self); yield* g.toHand(self); }
      },
    },
  },

  // Кеша, потерянный панцирник
  167: {
    *onEnter(g, self) {
      const pl = g.placeAt(1 - self.ctrl, self.region);
      if (pl) { g.fx('destroyCamp', self, pl); yield* g.destroy(pl, self); }
    },
    // Зарыться под землю
    *onDestroyed(g, self, info) {
      const p = g.P(info.ctrl);
      if (self.zone !== 'grave' || p.coins < 3) return;
      if (!(yield* g.yesNo(info.ctrl, 'Зарыться под землю: заплатить 3 💰 и вернуть Кешу в руку?', 'yes'))) return;
      p.coins -= 3;
      g.fx('burrow', self);
      yield* g.toHand(self);
    },
  },

  // Отряд зачистки
  168: {
    on: {
      *cardUsed(g, self, ev) {
        if (ev.player !== self.ctrl || !ev.offTurn || ev.inst === self) return;
        g.fx('levelUp', self); yield* g.buff(self, 1, 1, 'perm', self);
      },
    },
  },

  // Гений Эрика Пэнисова
  169: {
    *effect(g, ctx) {
      const i = ctx.player, p = g.P(i);
      const shown = [];
      const costs = new Set();
      let dup = false;
      g.fx('genius', ctx.self);
      while (p.deck.length && !dup) {
        const more = yield* g.yesNo(i, shown.length ? `Открыто ${shown.length} (все стоимости разные). Открыть ещё одну?` : 'Гений: открыть верхнюю карту Скрижали?', shown.length < 3 ? 'yes' : 'no');
        if (!more) break;
        const c = p.deck.shift();
        c.zone = 'reveal';
        shown.push(c);
        const key = String(g.def(c).cost);
        if (costs.has(key)) dup = true;
        costs.add(key);
        g.emit('reveal', { player: i, uid: c.uid, id: c.id, log: `${p.name} открывает «${g.name(c)}» (${key === 'null' ? '—' : key}).` });
      }
      if (!shown.length) return;
      if (!dup) {
        for (const c of shown) { c.zone = 'hand'; p.hand.push(c); g.emit('draw', { player: i, uid: c.uid }); }
        g.log(`Все стоимости разные: ${shown.length} карт(ы) в руку.`);
      } else {
        for (const c of shown) { c.zone = 'deck'; p.deck.push(c); }
        g.shuffleDeck(i);
        g.log('Стоимости совпали: открытые карты замешаны в Скрижаль.');
      }
    },
  },

  // Паспортистка Змия Хрустального
  170: {
    on: {
      *enter(g, self, ev) {
        const a = ev.inst;
        if (a.ctrl !== self.ctrl || g.cardType(a) !== 'ally' || numCost(g.def(a)) > 3) return;
        if (self.x.passPhase === g.s.phaseId) return;
        self.x.passPhase = g.s.phaseId;
        g.fx('levelUp', self); yield* g.buff(self, 1, 1, 'perm', self);
      },
    },
  },

  // Целебные ягоды
  171: {
    *effect(g, ctx) {
      const i = ctx.player;
      let left = ctx.X || 0;
      const L = g.leader(i);
      const overheal = () => g.field(i).some((c) => c.id === 156);
      g.fx('berries', ctx.self);
      while (left > 0) {
        const cands = g.characters(i).filter((c) => wounds(g, c) > 0);
        if (!cands.length) break;
        const t = cands.length === 1 ? cands[0] : yield* g.pickCard(i, cands, `Целебные ягоды: кого исцелить (осталось ${left})?`, 'buff');
        if (!t) break;
        const cap = Math.min(left, t === L && overheal() ? left : wounds(g, t));
        let n = cap;
        if (cap > 1) {
          const a = yield* g.ask(i, { type: 'pick', prompt: `Сколько ран исцелить «${g.name(t)}» (X)?`, options: Array.from({ length: cap }, (_, k) => ({ id: k + 1, label: String(k + 1) })), auto: false });
          n = a || cap;
        }
        g.fx('heal', ctx.self, t);
        const healed = yield* g.heal(t, n, ctx.self);
        left -= Math.max(n, healed);
      }
    },
  },

  // Эльфийская соль
  172: {
    abilities: [{
      name: 'Эльфийская соль', cost: { selfDestroy: true },
      can: (g, self) => saltCands(g, self.ctrl).length > 0,
      *effect(g, ctx) {
        const i = ctx.player;
        const cands = saltCands(g, i);
        if (!cands.length) return;
        let c;
        if (g.field(i).some((x) => g.isType(x, 'ЭЛЬФ'))) c = yield* g.pickCard(i, cands, 'Эльфийская соль: какое Действие использовать?', 'buff');
        else c = cands[Math.floor(g.rand() * cands.length)];
        if (!c) return;
        g.fx('elfSalt', ctx.self, c);
        g.log(`Эльфийская соль: используется «${g.name(c)}».`);
        yield* g.declareCard(i, c, c.id, { free: true, noCancel: true });
        if (c.zone === 'grave') yield* g.exile(c);
      },
    }],
  },

  // Святостой, служитель бога Солнца
  174: {
    *onEnter(g, self) { yield* fireHands(g, self); },
    on: { *turnStart(g, self, ev) { if (mine(g, self, ev)) yield* fireHands(g, self); } },
  },

  // Контрабандистка Диана
  175: {
    on: {
      *damage(g, self, ev) {
        if (ev.src !== self || ev.amount <= 0 || ev.tgtCtrl === self.ctrl || g.cardType(ev.tgt) !== 'leader') return;
        const i = self.ctrl, p = g.P(i);
        if (!p.deck.length) return;
        if (!(yield* g.yesNo(i, 'Доставить товар: найти карту в Скрижали и положить её наверх?', 'yes'))) return;
        const c = yield* g.searchDeck(i, () => true, 'Доставить товар: выберите карту — она окажется сверху Скрижали');
        g.shuffleDeck(i);
        if (!c) return;
        p.deck.splice(p.deck.indexOf(c), 1);
        p.deck.unshift(c);
        g.fx('smuggle', self);
        g.log(`${p.name} кладёт найденную карту на верх Скрижали.`);
      },
    },
  },
};

// Действия на кладбище для Эльфийской соли: стоимость ≤ 2 и их можно сейчас разыграть (есть цели).
function saltCands(g, i) {
  return g.P(i).grave.filter((c) => {
    const d = g.def(c);
    if (d.type !== 'action' || typeof d.cost !== 'number' || d.cost > 2) return false;
    const sc = g.script(c);
    if (sc.canPlay && !sc.canPlay(g, i, c)) return false;
    if (sc.targets && !g.targetsAvailable(i, c, sc.targets)) return false;
    return true;
  });
}

// Реинкарнации Лёши: убрать из игры Союзников, возвращённых этим Лёшей в текущем Сражении.
function* endReincarnations(g, self) {
  for (const a of g.allies()) {
    if (a.x.lyosha === g.s.battleNo && a.x.lyoshaSrc === self.uid) { g.fx('reincarnationEnd', self, a); yield* g.exile(a); }
  }
}

// Огненные ладони: 1 рана каждому Союзнику (одновременно); погибшие так уходят из игры.
function* fireHands(g, self) {
  const list = g.allies();
  if (!list.length) return;
  g.fx('sunPalms', self, list);
  for (const a of list) a.x.exileOnDeath = true;
  const defer = [];
  for (const a of list) yield* g.damage(self, a, 1, { defer });
  yield* g.checkDeaths();
  for (const a of list) if (g.onField(a)) delete a.x.exileOnDeath;
  for (const ev of defer) yield* g.trigger('damage', ev);
  yield* g.checkDeaths();
}
