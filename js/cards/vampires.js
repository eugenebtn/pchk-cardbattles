// Скрижали вампиров: Дан Балан (62) и Граф Влад Сосунеску (63), карты 62–116.
// 83 (Украшение) живёт в tokens.js; 64 (Челюсть) и 106 (Зомби) — ванильные токены.
const VAMP = 'ВАМПИР';
const mine = (g, self, ev) => ev.player === self.ctrl;
const isVamp = (g, c) => g.isType(c, VAMP);
const isAlly = (g, c) => g.cardType(c) === 'ally';
const costNum = (d) => (typeof d.cost === 'number' ? d.cost : 0);
/** Гнездо кукушки doubles any blood-paid property of a Vampire in its region — also the triggered ones
 *  («снять 🩸 с этой карты, чтобы…»). Activated abilities are doubled by the engine. */
const nestTimes = (g, c) => (isVamp(g, c) && c.zone === 'field' && g.placeAt(c.ctrl, c.region)?.id === 94 ? 2 : 1);

/** «В начале вашего хода получите N 💰». */
const income = (n) => function* turnStart(g, self, ev) {
  if (!mine(g, self, ev)) return;
  g.fx('coins', self);
  yield* g.gainCoins(self.ctrl, n, self);
};

/** For abilities that Гнездо кукушки may resolve twice: same target while still valid, otherwise a new choice. */
function* sameOrNew(g, ctx, valid, cands, prompt, hint = 'harm') {
  ctx.rep = (ctx.rep || 0) + 1;
  const t = g.card(ctx.targets[0]);
  if (t && valid(t)) return t;
  if (ctx.rep === 1) return null;
  return yield* g.pickCard(ctx.player, cands(), prompt, hint);
}
const graveSpec = (side, filter, prompt) => ({
  zone: 'grave', prompt, hint: side === 'own' ? 'buff' : 'harm',
  candidates: (g, ctx) => g.P(side === 'own' ? ctx.player : 1 - ctx.player).grave.filter((c) => filter(g, c)),
});
const allyCard = (g, c) => g.def(c).type === 'ally';
/** Посох паутины: the enemy ally in the region of the equipped ally. */
const webSpec = (staff) => ({
  kind: 'ally', side: 'enemy', prompt: 'Паутина: оглушите вражеского Союзника в этом регионе',
  filter: (g, c) => { const a = staff.equip ? g.card(staff.equip) : null; return !!a && a.zone === 'field' && c.region === a.region; },
});

// ---------- Экипировка (с учётом Кузнеца Свона) ----------
function swonFor(g, self) {
  if (g.s.turn !== self.ctrl || g.s.phase !== 'turn') return null;
  return g.field(self.ctrl).find((c) => c.id === 92 && c.zone === 'field' && c.x.freeEquipTurn !== g.s.turnStamp) || null;
}
function equipAbility(kinds, what) {
  const spec = (self) => ({
    kind: 'card', side: 'own', hint: 'buff', prompt: `Экипировать: выберите ${what}`,
    filter: (g, c) => kinds.includes(g.cardType(c)) && c.uid !== self.equip,
  });
  return {
    name: 'Экипировать',
    cost: (g, self) => (self.x.freeEquip || swonFor(g, self) ? {} : { coins: 2 }),
    can: (g, self) => g.targetCandidates(self.ctrl, spec(self)).length > 0,
    *plan(g, ctx) {
      ctx.self.x.freeEquip = false;
      const t = yield* g.chooseTarget(ctx, spec(ctx.self));
      if (!t) return false;
      const sw = swonFor(g, ctx.self);
      if (sw) { sw.x.freeEquipTurn = g.s.turnStamp; ctx.self.x.freeEquip = true; g.fx('qualityGuarantee', sw, ctx.self); }
    },
    *effect(g, ctx) {
      ctx.self.x.freeEquip = false;
      const t = g.card(ctx.targets[0]);
      ctx.self.equip = t.uid;
      g.fx('equip', ctx.self, t);
      g.log(`«${g.name(ctx.self)}» экипирует «${g.name(t)}».`);
    },
  };
}

// ---------- «получает все её свойства» (Антон, Венокус) ----------
// Gained card ids are kept in self.x.gained (cleared when the card changes zones).
// Activated abilities are reached through fixed proxy slots; triggers and statics are delegated.
const EVENTS = ['turnStart', 'turnEnd', 'battleStart', 'battleEnd', 'regionStart', 'regionEnd', 'cardUsed', 'enter', 'damage', 'destroyed', 'leave', 'heal', 'coinsGained', 'discard', 'tokensGained'];
const gainedScripts = (g, self) => (self.x.gained || []).map((id) => g.script({ id })).filter((sc) => !sc.gainer);
function gainedAbs(g, self, fast) {
  const out = [];
  for (const id of self.x.gained || []) {
    (g.script({ id }).abilities || []).forEach((ab, j) => { if (!ab.proxy && !!ab.fast === fast) out.push({ id, j, ab, key: `${id}:${j}` }); });
  }
  return out;
}
const limKey = (g, self, limit) => (limit === 'phase' ? g.s.phaseId : limit === 'turn' ? (g.s.turn === self.ctrl ? g.s.turnStamp : -1) : 'game');
function proxy(label, fast, k) {
  const entry = (g, self) => gainedAbs(g, self, fast)[k];
  return {
    proxy: true, fast, name: `${label} ${k + 1}${fast ? ' (Опережение)' : ''}`,
    cost: (g, self) => { const e = entry(g, self); return e ? g.abilityCost(self, e.ab) : {}; },
    can(g, self) {
      const e = entry(g, self);
      if (!e) return false;
      const ab = e.ab;
      if (ab.myTurnOnly && g.s.turn !== self.ctrl) return false;
      if (ab.limit && (self.x.plim || {})[e.key] === limKey(g, self, ab.limit)) return false;
      if (ab.can && !ab.can(g, self)) return false;
      if (ab.targets && !g.targetsAvailable(self.ctrl, self, ab.targets)) return false;
      return true;
    },
    *plan(g, ctx) {
      const e = entry(g, ctx.self);
      if (!e) return false;
      ctx.proxied = e;
      if (e.ab.plan) { if ((yield* e.ab.plan(g, ctx)) === false) return false; }
      else if (e.ab.targets) {
        for (const spec of [].concat(e.ab.targets)) {
          const t = yield* g.chooseTarget(ctx, spec);
          if (t === null && !spec.optional) return false;
        }
      }
      if (ctx.cancelled) return false;
      if (e.ab.limit) { ctx.self.x.plim = ctx.self.x.plim || {}; ctx.self.x.plim[e.key] = limKey(g, ctx.self, e.ab.limit); }
    },
    *effect(g, ctx) { if (ctx.proxied) yield* ctx.proxied.ab.effect(g, ctx); },
  };
}
function gainerParts(label) {
  const on = {};
  for (const name of EVENTS) {
    on[name] = function* (g, self, ev) {
      for (const sc of gainedScripts(g, self)) if (sc.on?.[name]) yield* sc.on[name](g, self, ev);
    };
  }
  const sum = (fn) => (g, self, ...a) => gainedScripts(g, self).reduce((s, sc) => s + (sc.static?.[fn] ? (sc.static[fn](g, self, ...a) || 0) : 0), 0);
  const any = (fn) => (g, self, ...a) => gainedScripts(g, self).some((sc) => sc.static?.[fn] && sc.static[fn](g, self, ...a));
  const statics = {
    atk: sum('atk'), hp: sum('hp'), costMod: sum('costMod'), income: sum('income'),
    forbidPlay: any('forbidPlay'), forbidRegion: any('forbidRegion'), grantFast: any('grantFast'),
    kw(g, self, card, kw) {
      if (card === self && kw !== 'created' && (self.x.gained || []).some((id) => g.def({ id }).kw.includes(kw))) return true;
      return gainedScripts(g, self).some((sc) => sc.static?.kw && sc.static.kw(g, self, card, kw));
    },
  };
  const proxies = [];
  for (let k = 0; k < 4; k++) proxies.push(proxy(label, false, k));
  for (let k = 0; k < 4; k++) proxies.push(proxy(label, true, k));
  return {
    gainer: true, on, static: statics, proxies,
    *onLeave(g, self, info) { for (const sc of gainedScripts(g, self)) if (sc.onLeave) yield* sc.onLeave(g, self, info); },
    *beforeDestroyed(g, self, info) {
      for (const sc of gainedScripts(g, self)) if (sc.beforeDestroyed && (yield* sc.beforeDestroyed(g, self, info)) === 'prevented') return 'prevented';
    },
  };
}
function gainAbilities(g, self, id, src) {
  self.x.gained = [...(self.x.gained || []), id];
  g.fx('absorb', src || self, self);
  g.log(`«${g.name(self)}» получает свойства карты «${g.def({ id }).name}».`);
}

// ---------- Вампидап: контроль до ухода карты ----------
function* returnControl(g, t) {
  if (!g.onField(t) || t.ctrl === t.owner) return;
  const owner = t.owner, from = g.P(t.ctrl), to = g.P(owner);
  for (const it of g.items(t.ctrl)) if (it.equip === t.uid) { it.equip = null; g.emit('unequip', { uid: it.uid }); }
  if (!to.regions[t.region].ally) { yield* g.takeControl(t, owner); return; }
  // The owner's slot got filled meanwhile: the owner moves it to another free region, or it is lost to the graveyard.
  const regs = g.allyRegions(owner, t, t.id);
  if (!regs.length) { yield* g.toGrave(t); return; }
  const r = yield* g.pickRegion(owner, regs, `«${g.name(t)}» возвращается: куда положить?`);
  from.regions[t.region].ally = null;
  to.regions[r].ally = t; t.region = r; t.ctrl = owner;
  g.emit('control', { uid: t.uid, player: owner, log: `${to.name} возвращает контроль над «${g.name(t)}».` });
}

// ---------- Замок Нассератт: возвращение изгнанного ----------
function* returnExiled(g, self) {
  const t = self.x.exiled ? g.card(self.x.exiled) : null;
  self.x.exiled = null;
  if (!t || t.zone !== 'exile' || t.created) return;
  const regs = g.allyRegions(t.owner, t, t.id);
  if (!regs.length) { g.log(`«${g.name(t)}» не может вернуться — свободных регионов нет.`); return; }
  const r = yield* g.pickRegion(t.owner, regs, `«${g.name(t)}» возвращается в игру: куда положить?`);
  g.fx('release', self, t);
  yield* g.putOnField(t, t.owner, r);
}

const anton = gainerParts('Опыт крови: свойство');
const venokus = gainerParts('Диаблери: свойство');

export default {
  // Дан Балан, основатель клана (Лидер)
  62: {
    on: {
      *turnStart(g, self, ev) {
        if (!mine(g, self, ev)) return;
        const vamps = g.P(self.ctrl).hand.filter((c) => g.isType(c, VAMP));
        if (!vamps.length) return;
        const shown = yield* g.pickFrom(self.ctrl, vamps, { min: 0, max: vamps.length, prompt: 'Отец рода: покажите карты Вампиров из руки (1 🩸 за каждую)' });
        if (!shown.length) return;
        g.fx('reveal', self, shown);
        g.log(`${g.P(self.ctrl).name} показывает: ${shown.map((c) => `«${g.name(c)}»`).join(', ')}.`);
        yield* g.addTokens(self, 'blood', shown.length, self);
      },
    },
    abilities: [{
      name: 'Рой челюстей', cost: { blood: 4 },
      can: (g, self) => g.allyRegions(self.ctrl, self, 64).length > 0,
      *effect(g, ctx) {
        g.fx('batSwarm', ctx.self);
        yield* g.create(ctx.player, 64);
        yield* g.create(ctx.player, 64);
      },
    }],
  },

  // Граф Влад Сосунеску (Лидер)
  63: {
    abilities: [
      {
        name: 'Борец за ценности', fast: true, cost: { coins: 3 },
        targets: { kind: 'character', side: 'enemy', prompt: 'Борец за ценности: 2 раны вражескому персонажу' },
        *effect(g, ctx) {
          const t = g.card(ctx.targets[0]);
          const base = g.def(t).hp ?? 0, leader = g.cardType(t) === 'leader';
          g.fx('bloodBite', ctx.self, t);
          yield* g.damage(ctx.self, t, 2);
          if (leader || g.onField(t)) return;
          const vamps = g.field(ctx.player).filter((c) => isVamp(g, c));
          const v = yield* g.pickCard(ctx.player, vamps, `Борец за ценности: положите ${base} 🩸 на вашего Вампира`, 'buff');
          if (v) yield* g.addTokens(v, 'blood', base, ctx.self);
        },
      },
      {
        name: 'Сбросить и взять', cost: { blood: 1 },
        can: (g, self) => g.P(self.ctrl).hand.length > 0,
        *effect(g, ctx) {
          const d = yield* g.discardChoice(ctx.player, 1, 'Сбросьте карту, чтобы взять карту');
          if (d.length) { g.fx('draw', ctx.self); yield* g.draw(ctx.player, 1); }
        },
      },
      {
        name: 'Кровь в монеты', cost: { blood: 2 },
        *effect(g, ctx) { g.fx('coins', ctx.self); yield* g.gainCoins(ctx.player, 1, ctx.self); },
      },
    ],
  },

  // Одинокий кабак
  65: {
    on: {
      *turnStart(g, self, ev) {
        if (!mine(g, self, ev)) return;
        const n = g.P(self.ctrl).regions.filter((r) => !r.place).length;
        g.fx('coins', self);
        yield* g.gainCoins(self.ctrl, n, self);
      },
    },
  },

  // Показательная роскошь
  66: {
    *effect(g, ctx) {
      g.fx('luxury', ctx.self);
      yield* g.draw(ctx.player, 2);
      yield* g.create(ctx.player, 83);
      yield* g.create(ctx.player, 83);
    },
  },

  // Разговор с мёртвыми
  67: {
    canPlay: (g, i) => g.P(i).grave.some((c) => allyCard(g, c)),
    *plan(g, ctx) {
      const t = yield* g.chooseTarget(ctx, graveSpec('own', allyCard, 'Разговор с мёртвыми: уберите из игры Союзника с вашего кладбища'));
      if (!t) return false;
    },
    *effect(g, ctx) {
      const t = g.card(ctx.targets[0]);
      const n = g.def(t).hp ?? 0;
      g.fx('speakDead', ctx.self, t);
      yield* g.exile(t);
      const p = g.P(ctx.player);
      const top = p.deck.slice(0, n);
      if (!top.length) return;
      const keep = yield* g.pickFrom(ctx.player, top, { min: Math.min(2, top.length), max: Math.min(2, top.length), prompt: 'Разговор с мёртвыми: две карты в руку (остальные — вниз Скрижали)' });
      for (const c of keep) {
        p.deck.splice(p.deck.indexOf(c), 1);
        c.zone = 'hand'; p.hand.push(c);
        g.emit('draw', { player: ctx.player, uid: c.uid });
      }
      let rest = top.filter((c) => !keep.includes(c));
      if (rest.length > 1) {
        const ord = yield* g.ask(ctx.player, { type: 'order', prompt: 'Порядок карт вниз Скрижали (первая окажется выше)', options: rest.map((c) => ({ id: c.uid, cardId: c.id })), reveal: true });
        const byOrder = (ord || []).map((u) => g.card(u)).filter((c) => rest.includes(c));
        if (byOrder.length === rest.length && new Set(byOrder).size === rest.length) rest = byOrder;
      }
      for (const c of rest) { p.deck.splice(p.deck.indexOf(c), 1); p.deck.push(c); g.emit('toDeck', { player: ctx.player, uid: c.uid }); }
    },
  },

  // Ужасающий взрыв
  68: {
    canPlay: (g, i) => g.targetCandidates(i, { kind: 'allyOrCompanion', side: 'enemy' }).length > 0 || g.targetCandidates(i, { kind: 'place', side: 'enemy' }).length > 0,
    *plan(g, ctx) {
      const opts = [];
      if (g.targetCandidates(ctx.player, { kind: 'allyOrCompanion', side: 'enemy' }).length) opts.push({ id: 0, label: '4 раны вражескому Союзнику или Напарнику' });
      if (g.targetCandidates(ctx.player, { kind: 'place', side: 'enemy' }).length) opts.push({ id: 1, label: 'Уничтожить вражеское Место' });
      const m = yield* g.ask(ctx.player, { type: 'pick', prompt: 'Ужасающий взрыв', options: opts, cancel: true, auto: false });
      if (m == null) return false;
      ctx.mode = m;
      const t = yield* g.chooseTarget(ctx, m === 0
        ? { kind: 'allyOrCompanion', side: 'enemy', prompt: 'Ужасающий взрыв: 4 раны' }
        : { kind: 'place', side: 'enemy', prompt: 'Ужасающий взрыв: уничтожить Место' });
      if (!t) return false;
    },
    *effect(g, ctx) {
      const t = g.card(ctx.targets[0]);
      g.fx('explosion', ctx.self, t);
      if (ctx.mode === 0) yield* g.damage(ctx.self, t, 4);
      else yield* g.destroy(t, ctx.self);
    },
  },

  // Антон, муж на час
  69: {
    ...anton,
    abilities: [
      {
        name: 'Восставший труп', cost: { blood: 2 },
        can: (g, self) => g.P(self.ctrl).grave.some((c) => allyCard(g, c)),
        *plan(g, ctx) { if (!(yield* g.chooseTarget(ctx, graveSpec('own', allyCard, 'Восставший труп: уберите из игры Союзника с вашего кладбища')))) return false; },
        *effect(g, ctx) {
          const t = yield* sameOrNew(g, ctx, (c) => c.zone === 'grave', () => g.P(ctx.player).grave.filter((c) => allyCard(g, c)), 'Восставший труп: ещё один Союзник с кладбища', 'buff');
          if (!t) return;
          g.fx('raiseDead', ctx.self, t);
          yield* g.exile(t);
          yield* g.create(ctx.player, 106);
        },
      },
      {
        name: 'Опыт крови', cost: { blood: 2 },
        can: (g, self) => g.P(1 - self.ctrl).grave.some((c) => allyCard(g, c)),
        *plan(g, ctx) { if (!(yield* g.chooseTarget(ctx, graveSpec('enemy', allyCard, 'Опыт крови: уберите из игры Союзника с вражеского кладбища')))) return false; },
        *effect(g, ctx) {
          const t = yield* sameOrNew(g, ctx, (c) => c.zone === 'grave', () => g.P(1 - ctx.player).grave.filter((c) => allyCard(g, c)), 'Опыт крови: ещё один Союзник с вражеского кладбища');
          if (!t) return;
          const id = t.id;
          yield* g.exile(t);
          if (!g.onField(ctx.self)) return;
          gainAbilities(g, ctx.self, id, ctx.self);
          yield* g.buff(ctx.self, 1, 1, 'perm', ctx.self);
        },
      },
      ...anton.proxies,
    ],
  },

  // Мучительные видения
  70: {
    targets: { kind: 'ally', side: 'enemy', prompt: 'Мучительные видения: -3/-3 вражескому Союзнику' },
    *effect(g, ctx) { const t = g.card(ctx.targets[0]); g.fx('visions', ctx.self, t); yield* g.buff(t, -3, -3, 'perm', ctx.self); },
  },

  // Сделка с архидемоном
  71: {
    *effect(g, ctx) {
      const n = g.field(ctx.player).some((c) => g.isType(c, 'ВЕЛЬМОЖА')) ? 3 : 2;
      const L = g.leader(ctx.player);
      g.fx('demonDeal', ctx.self, L);
      yield* g.damage(ctx.self, L, n);
      yield* g.gainCoins(ctx.player, n, ctx.self);
    },
  },

  // Символ бога Солнца
  72: {
    abilities: [equipAbility(['ally', 'place'], 'вашего Союзника или Место')],
    static: { kw: (g, self, card, kw) => kw === 'ward' && self.equip === card.uid },
  },

  // Прикуслав, верная челюсть
  73: {
    abilities: [{
      name: 'Спасение хозяина', fast: true, cost: { selfDestroy: true },
      targets: { kind: 'character', side: 'own', hint: 'buff', prompt: 'Спасение хозяина: ваш Вампир получает Оберег и Нерушимость', filter: (g, c) => isVamp(g, c) && c.id !== 73 },
      *effect(g, ctx) {
        const t = g.card(ctx.targets[0]);
        g.fx('guard', ctx.self, t);
        g.grant(t, 'ward', 'phase', ctx.self);
        g.grant(t, 'indestructible', 'phase', ctx.self);
      },
    }],
  },

  // Огненная стена
  74: {
    *effect(g, ctx) {
      const list = g.allies(1 - ctx.player);
      g.fx('fireWall', ctx.self, list);
      for (const t of list) yield* g.damage(ctx.self, t, 3);
    },
  },

  // Вампирские ценности
  75: {
    *effect(g, ctx) {
      const list = [...g.allies(), ...g.companions()];
      g.fx('vampireValues', ctx.self, list);
      for (const t of list) {
        if (!g.onField(t)) continue;
        if (t.dmg > 0) yield* g.heal(t, t.dmg, ctx.self);
        t.mods = [];
        t.x.doubleAtk = null;
        g.emit('buff', { uid: t.uid, atk: 0, hp: 0, log: `«${g.name(t)}»: атака и здоровье равны изначальным.` });
      }
      yield* g.checkDeaths();
      yield* g.draw(ctx.player, 1);
    },
  },

  // Меч Бесагона
  76: {
    *onEnter(g, self) {
      const t = yield* g.pickCard(self.ctrl, g.targetCandidates(self.ctrl, { kind: 'ally', side: 'enemy' }), 'Меч Бесагона: 3 раны вражескому Союзнику');
      if (t) { g.fx('swordSlash', self, t); yield* g.damage(self, t, 3); }
    },
    abilities: [equipAbility(['ally'], 'вашего Союзника')],
    equipOn: {
      *battleStart(g, item, ally) {
        if (!ally || !g.onField(ally)) return;
        ally.x.doubleAtk = g.s.phaseId;
        g.fx('swordDouble', item, ally);
        g.log(`«${g.name(ally)}»: атака удвоена до конца фазы.`);
      },
    },
  },

  // Вампирбек, вампир-рикша
  77: {
    static: { kw: (g, self, card, kw) => kw === 'maneuver' && card.ctrl === self.ctrl && isAlly(g, card) && isVamp(g, card) },
    on: {
      *enter(g, self, ev) {
        const t = ev.inst;
        if (t === self || t.ctrl !== self.ctrl || !isAlly(g, t) || !isVamp(g, t) || t.x.vampirbek) return;
        if (g.bloodAvailable(self) < 2) return;
        if (!(yield* g.yesNo(self.ctrl, `Самое главное — это семья: снять 2 🩸 с «${g.name(self)}», чтобы дать «${g.name(t)}» +2/+2?`, 'yes'))) return;
        const times = nestTimes(g, self);
        yield* g.payBlood(self, 2);
        t.x.vampirbek = true;
        g.fx('family', self, t);
        for (let k = 0; k < times; k++) yield* g.buff(t, 2, 2, 'perm', self);
      },
    },
  },

  // Проломить дверь
  78: {
    targets: { kind: 'place', side: 'any', prompt: 'Проломить дверь: уничтожьте Место стоимостью 3 или меньше', filter: (g, c) => costNum(g.def(c)) <= 3 },
    *effect(g, ctx) { const t = g.card(ctx.targets[0]); g.fx('breakDoor', ctx.self, t); yield* g.destroy(t, ctx.self); },
  },

  // Укус вампира
  79: {
    targets: { kind: 'character', side: 'enemy', prompt: 'Укус вампира: 2 раны вражескому персонажу' },
    *effect(g, ctx) {
      const t = g.card(ctx.targets[0]);
      g.fx('bloodBite', ctx.self, t);
      yield* g.damage(ctx.self, t, 2);
      yield* g.heal(g.leader(ctx.player), 2, ctx.self);
      const v = yield* g.pickCard(ctx.player, g.field(ctx.player).filter((c) => isVamp(g, c)), 'Укус вампира: положите 2 🩸 на вашего Вампира', 'buff');
      if (v) yield* g.addTokens(v, 'blood', 2, ctx.self);
    },
  },

  // Арена для выступлений
  80: {
    on: {
      turnStart: income(1),
      *enter(g, self, ev) {
        const t = ev.inst;
        if (t.ctrl !== self.ctrl || !isAlly(g, t) || t.zone !== 'field') return;
        for (let r = 0; r < 5; r++) if (r !== t.region && !g.allyAt(self.ctrl, r)) return;
        g.fx('arena', self, t);
        yield* g.buff(t, 2, 2, 'perm', self);
      },
    },
  },

  // Деревенская закусочная
  81: {
    on: { turnStart: income(2) },
    abilities: [{
      name: 'Сделать заказ', cost: { coins: 2 }, limit: 'phase',
      *effect(g, ctx) { const L = g.leader(ctx.player); g.fx('heal', ctx.self, L); yield* g.heal(L, 3, ctx.self); },
    }],
  },

  // Дорожный налёт
  82: {
    targets: { kind: 'ally', side: 'enemy', prompt: 'Дорожный налёт: уничтожьте вражеского Союзника' },
    *effect(g, ctx) {
      const t = g.card(ctx.targets[0]);
      g.fx('raid', ctx.self, t);
      yield* g.destroy(t, ctx.self);
      yield* g.supply(ctx.player, 2);
    },
  },

  // Лука, супербигдикган
  84: {
    abilities: [{
      name: 'И чё?', fast: true, cost: { blood: 2 },
      *effect(g, ctx) { g.fx('shrug', ctx.self); g.grant(ctx.self, 'ward', 'phase', ctx.self); },
    }],
    on: {
      *battleStart(g, self) {
        if (g.bloodAvailable(self) < 2) return;
        if (!(yield* g.yesNo(self.ctrl, 'Подростковая ярость: снять 2 🩸, чтобы получить +2/+0 и Прорыв до конца Сражения?', 'yes'))) return;
        const times = nestTimes(g, self);
        yield* g.payBlood(self, 2);
        g.fx('rage', self);
        for (let k = 0; k < times; k++) {
          yield* g.buff(self, 2, 0, 'battle', self);
          g.grant(self, 'breakthrough', 'battle', self);
        }
      },
    },
  },

  // Разгульная вампирша
  85: {
    abilities: [{
      name: 'Кутёж', fast: true, cost: { blood: 1 },
      *effect(g, ctx) { g.fx('bloodRush', ctx.self); yield* g.buff(ctx.self, 1, 1, 'phase', ctx.self); },
    }],
  },

  // Адриан Вурдаласку
  86: {
    on: { *turnStart(g, self, ev) { if (mine(g, self, ev)) yield* g.plan(self.ctrl, 1); } },
    abilities: [{
      name: 'Грандиозный план', cost: { blood: 2 },
      can: (g, self) => g.P(self.ctrl).grave.some((c) => g.isType(c, 'ТАКТИКА')),
      *plan(g, ctx) { if (!(yield* g.chooseTarget(ctx, graveSpec('own', (g2, c) => g2.isType(c, 'ТАКТИКА'), 'Грандиозный план: Тактика с кладбища в руку')))) return false; },
      *effect(g, ctx) {
        const t = yield* sameOrNew(g, ctx, (c) => c.zone === 'grave', () => g.P(ctx.player).grave.filter((c) => g.isType(c, 'ТАКТИКА')), 'Грандиозный план: ещё одна Тактика', 'buff');
        if (!t) return;
        g.fx('revive', ctx.self, t);
        yield* g.toHand(t);
      },
    }],
  },

  // Иделаида, похитительница сердец
  87: {
    on: { turnStart: income(1) },
    abilities: [{
      name: 'Роковая женщина', cost: { blood: 3 },
      targets: { kind: 'ally', side: 'enemy', prompt: 'Роковая женщина: оглушите вражеского Союзника' },
      *effect(g, ctx) {
        const t = yield* sameOrNew(g, ctx, (c) => g.onField(c), () => g.targetCandidates(ctx.player, { kind: 'ally', side: 'enemy' }), 'Роковая женщина: оглушите вражеского Союзника');
        if (!t) return;
        g.fx('charm', ctx.self, t);
        g.stun(t, ctx.self);
      },
    }],
  },

  // Цеца, королева фабрики
  88: {
    on: {
      *enter(g, self, ev) {
        const t = ev.inst;
        if (t.ctrl === self.ctrl || !isAlly(g, t) || ev.created || t.created) return;
        g.fx('humiliate', self, t);
        yield* g.damage(self, t, 1);
        yield* g.addTokens(self, 'blood', 1, self);
      },
    },
    abilities: [{
      name: 'Унижение', cost: { blood: 3 },
      targets: { kind: 'ally', side: 'enemy', prompt: 'Унижение: -2/-2 вражескому Союзнику' },
      *effect(g, ctx) {
        const t = yield* sameOrNew(g, ctx, (c) => g.onField(c), () => g.targetCandidates(ctx.player, { kind: 'ally', side: 'enemy' }), 'Унижение: -2/-2 вражескому Союзнику');
        if (!t) return;
        g.fx('humiliate', ctx.self, t);
        yield* g.buff(t, -2, -2, 'perm', ctx.self);
      },
    }],
  },

  // Вампирский бар
  89: {
    on: {
      turnStart: income(2),
      *enter(g, self, ev) {
        const t = ev.inst;
        if (t.ctrl !== self.ctrl || !isAlly(g, t) || !isVamp(g, t) || t.region !== self.region) return;
        g.fx('bloodBar', self, t);
        yield* g.addTokens(t, 'blood', 2, self);
      },
    },
  },

  // Вампирский гроб
  90: {
    on: {
      *turnStart(g, self, ev) {
        if (!mine(g, self, ev)) return;
        const vamps = g.characters(self.ctrl).filter((c) => isVamp(g, c));
        const t = yield* g.pickCard(self.ctrl, vamps, 'Вампирский гроб: исцелите 1 рану вашему Вампиру и положите на него 1 🩸', 'buff');
        if (!t) return;
        g.fx('coffin', self, t);
        yield* g.heal(t, 1, self);
        yield* g.addTokens(t, 'blood', 1, self);
      },
    },
    abilities: [{
      name: 'Восстать из гроба', cost: { selfDestroy: true },
      can: (g, self) => g.P(self.ctrl).grave.some((c) => g.isType(c, VAMP)),
      *plan(g, ctx) { if (!(yield* g.chooseTarget(ctx, graveSpec('own', (g2, c) => g2.isType(c, VAMP), 'Вампирский гроб: Вампир с кладбища в руку')))) return false; },
      *effect(g, ctx) { const t = g.card(ctx.targets[0]); g.fx('coffin', ctx.self, t); yield* g.toHand(t); },
    }],
  },

  // Атака когтями
  91: {
    targets: { kind: 'allyOrCompanion', side: 'enemy', prompt: 'Атака когтями: 3 раны' },
    *effect(g, ctx) {
      const t = g.card(ctx.targets[0]);
      g.fx('claws', ctx.self, t);
      yield* g.damage(ctx.self, t, 3);
      const n = g.P(ctx.player).grave.filter((c) => c.id === 91 && c !== ctx.self).length;
      if (n) { g.fx('claws', ctx.self, g.leader(1 - ctx.player)); yield* g.discardRandom(1 - ctx.player, n); }
    },
  },

  // Кузнец Свон (бесплатная экипировка — в equipAbility)
  92: {
    *onEnter(g, self) {
      const p = g.P(self.ctrl);
      const items = p.deck.filter((c) => g.def(c).type === 'item');
      if (!items.length) return;
      const [c] = yield* g.pickFrom(self.ctrl, items, { min: 0, max: 1, prompt: 'Орудие героев: найдите Предмет (он окажется на верху Скрижали)' });
      if (!c) return;
      g.shuffleDeck(self.ctrl);
      p.deck.splice(p.deck.indexOf(c), 1);
      p.deck.unshift(c);
      g.fx('forge', self);
      g.log(`«${g.name(self)}» кладёт «${g.name(c)}» на верх Скрижали.`);
    },
  },

  // Адольф, похититель энергии
  93: {
    abilities: [{
      name: 'Поглощение энергии', cost: { blood: 3 },
      *effect(g, ctx) {
        const o = 1 - ctx.player;
        g.fx('drain', ctx.self, g.leader(o));
        if (g.P(o).hand.length) yield* g.discardChoice(o, 1, 'Поглощение энергии: сбросьте карту');
        else yield* g.damage(ctx.self, g.leader(o), 3);
      },
    }],
  },

  // Гнездо кукушки (удвоение — в движке)
  94: { on: { turnStart: income(2) } },

  // Королевский экипаж (Место с Манёвром)
  95: {
    on: {
      *turnStart(g, self, ev) {
        if (!mine(g, self, ev)) return;
        // One income of 2 (+1 with your Вельможа here): Повар/Доспех/Попрошайка see a single payment.
        const a = g.allyAt(self.ctrl, self.region);
        g.fx('coins', self);
        yield* g.gainCoins(self.ctrl, 2 + (a && g.isType(a, 'ВЕЛЬМОЖА') ? 1 : 0), self);
      },
      *battleStart(g, self) {
        const p = g.P(self.ctrl);
        const free = g.placeRegions(self.ctrl);
        if (!free.length) return;
        const r = yield* g.pickRegion(self.ctrl, free, 'Манёвр: переместить подсвеченный «Королевский экипаж»?', 'place', { optional: true, focus: self.uid });
        if (r == null || r === self.region || p.regions[r].place) return;
        const from = self.region;
        p.regions[from].place = null; p.regions[r].place = self; self.region = r;
        g.emit('move', { uid: self.uid, from, to: r, log: `«${g.name(self)}» перемещается.` });
      },
    },
  },

  // Отпрыск высшего вампира
  96: {
    abilities: [
      {
        name: 'Укус', cost: { blood: 2 },
        targets: { kind: 'allyOrCompanion', side: 'enemy', prompt: 'Отпрыск: 1 рана вражескому Союзнику или Напарнику' },
        *effect(g, ctx) {
          const t = yield* sameOrNew(g, ctx, (c) => g.onField(c), () => g.targetCandidates(ctx.player, { kind: 'allyOrCompanion', side: 'enemy' }), 'Отпрыск: 1 рана');
          if (!t) return;
          g.fx('bloodBite', ctx.self, t);
          yield* g.damage(ctx.self, t, 1);
        },
      },
      {
        name: 'Пробуждение крови', cost: { blood: 4 }, limit: 'game',
        *effect(g, ctx) {
          g.fx('awaken', ctx.self);
          yield* g.buff(ctx.self, 3, 3, 'perm', ctx.self);
          yield* g.gainCoins(ctx.player, 3, ctx.self);
        },
      },
    ],
  },

  // Флореан Наклыкану
  97: {
    on: {
      *turnStart(g, self, ev) {
        if (!mine(g, self, ev) || self.zone !== 'field') return;
        const x = g.tokens(self, 'blood');
        if (x <= 0) return;
        if (!(yield* g.yesNo(self.ctrl, `Призвать приспешников: снять ${x} 🩸 и найти Союзника-Вампира стоимостью ${x} или меньше?`, 'yes'))) return;
        const times = nestTimes(g, self);
        self.tok.blood = 0;
        g.emit('tokens', { uid: self.uid });
        g.fx('summonMinions', self);
        const p = self.ctrl, region = self.region;
        for (let k = 0; k < times; k++) {
          const c = yield* g.searchDeck(p, (g2, c2) => g2.def(c2).type === 'ally' && g2.isType(c2, VAMP) && costNum(g2.def(c2)) <= x, 'Призвать приспешников: Союзник-Вампир');
          if (c) {
            const regs = g.allyRegions(p, c, c.id).filter((r) => g.adjacent(region ?? -9).includes(r));
            if (regs.length) {
              const r = yield* g.pickRegion(p, regs, `Куда положить «${g.name(c)}»?`);
              yield* g.putOnField(c, p, r);
            } else g.log('Соседних свободных регионов нет.');
          }
          g.shuffleDeck(p);
        }
      },
    },
  },

  // Кудрегар Пышнолистлов
  98: {
    *onEnter(g, self) {
      const regs = [self.region, ...g.adjacent(self.region)];
      const list = [0, 1].flatMap((p) => regs.map((r) => g.allyAt(p, r))).filter((c) => c && c !== self);
      g.fx('birchAllergy', self, list, { regions: regs });
      for (const t of list) g.stun(t, self);
    },
    on: {
      *damage(g, self, ev) {
        if (ev.tgt !== self || ev.amount <= 0) return;
        const others = g.allies(self.ctrl).filter((c) => c !== self);
        const t = yield* g.pickCard(self.ctrl, others, `Берёзовый сок: исцелите ${ev.amount} ран другому вашему Союзнику`, 'buff');
        if (t) { g.fx('heal', self, t); yield* g.heal(t, ev.amount, self); }
      },
    },
  },

  // Скоординированный удар
  99: {
    targets: { kind: 'allyOrCompanion', side: 'enemy', prompt: 'Скоординированный удар' },
    *effect(g, ctx) {
      const t = g.card(ctx.targets[0]);
      g.fx('coordinated', ctx.self, t);
      yield* g.damage(ctx.self, t, g.allies(ctx.player).length);
    },
  },

  // Подростки-беспризорники
  100: {
    on: {
      *cardUsed(g, self, ev) {
        if (ev.player === self.ctrl || ev.def.type === 'ally') return;
        const L = g.leader(ev.player);
        g.fx('cringe', self, L);
        yield* g.damage(self, L, 1);
      },
    },
  },

  // Димитар Норд-Упыряну (дар вампиризма и Разговор — в движке/данных)
  101: {
    abilities: [{
      name: 'Призыв семейства', cost: { blood: 2 },
      *effect(g, ctx) { g.fx('draw', ctx.self); yield* g.draw(ctx.player, 1); },
    }],
  },

  // Стражи высшего совета
  102: {
    abilities: [{
      name: 'Регенерация', cost: { blood: 2 },
      can: (g, self) => self.dmg > 0,
      *effect(g, ctx) { g.fx('heal', ctx.self, ctx.self); yield* g.heal(ctx.self, 2, ctx.self); },
    }],
  },

  // Солдат инквизиции
  103: {
    static: {
      costMod(g, self, player, card, def) {
        if (player === self.ctrl || !['ally', 'companion'].includes(def.type) || def.subtypes.includes('ЧЕЛОВЕК')) return 0;
        return self.x.firstPhase === g.s.phaseId ? 0 : 1;
      },
    },
    on: {
      *cardUsed(g, self, ev) {
        if (ev.player !== self.ctrl && ['ally', 'companion'].includes(ev.def.type) && !ev.def.subtypes.includes('ЧЕЛОВЕК')) self.x.firstPhase = g.s.phaseId;
      },
    },
  },

  // Агент тайной канцелярии
  104: {
    *onEnter(g, self) {
      const p = self.ctrl, o = 1 - p;
      if (!g.field(p).some((c) => c !== self && g.isType(c, 'ЧЕЛОВЕК'))) return;
      const hand = g.P(o).hand;
      g.fx('spy', self, g.leader(o));
      g.log(`Рука противника: ${hand.map((c) => `«${g.name(c)}»`).join(', ') || 'пусто'}.`);
      const cands = hand.filter((c) => ['ally', 'companion'].includes(g.def(c).type) && !g.isType(c, 'ЧЕЛОВЕК'));
      if (!cands.length) return;
      const [c] = yield* g.pickFrom(p, cands, { min: 0, max: 1, prompt: `Ликвидация. Рука противника: ${hand.map((x) => g.name(x)).join(', ')}. Сбросить Союзника/Напарника (не Человека)?` });
      if (c) yield* g.discard(o, c);
    },
  },

  // Искатель нечисти
  105: {
    *onEnter(g, self) {
      const e = g.allyAt(1 - self.ctrl, self.region);
      if (e && !g.isType(e, 'ЧЕЛОВЕК')) { g.fx('hunt', self, e); g.grant(self, 'advantage', 'nextTurn', self); }
    },
  },

  // Бьянка Сосунеску (обратная сторона Монастыря)
  107: {
    *onEnter(g, self) {
      const t = yield* g.pickCard(self.ctrl, g.targetCandidates(self.ctrl, { kind: 'ally', side: 'enemy' }), 'Мучительный голод: уничтожьте вражеского Союзника');
      if (!t) return;
      const cost = costNum(g.def(t));
      g.fx('hunger', self, t);
      if ((yield* g.destroy(t, self)) && cost > 0) yield* g.addTokens(self, 'blood', cost, self);
    },
    abilities: [{
      name: 'Огненная стена', cost: { blood: 3 },
      *effect(g, ctx) {
        const list = g.characters(1 - ctx.player);
        g.fx('fireWall', ctx.self, list);
        for (const t of list) yield* g.damage(ctx.self, t, 1);
      },
    }],
  },

  // Монастырь святой Бьянки
  108: {
    on: {
      *damage(g, self, ev) {
        const t = ev.tgt;
        if (ev.amount <= 0 || ev.tgtCtrl !== self.ctrl || g.def(t).type !== 'ally') return;
        const r = g.onField(t) ? (t.zone === 'field' ? t.region : null) : t.vLastRegion;
        if (r == null || Math.abs(r - self.region) > 1) return;
        yield* g.addTokens(self, 'blood', 1, self);
      },
      // Remember where an ally was when it left (combat wounds trigger after deaths).
      *leave(g, self, ev) { if (ev.inst && ev.region != null) ev.inst.vLastRegion = ev.region; },
      *turnStart(g, self, ev) {
        if (!mine(g, self, ev)) return;
        const regs = [self.region, ...g.adjacent(self.region)];
        const cands = regs.map((r) => g.allyAt(self.ctrl, r)).filter(Boolean);
        const t = yield* g.pickCard(self.ctrl, cands, 'Удар плетью: нанести 2 раны вашему Союзнику рядом, чтобы взять карту? (можно пропустить)', 'buff', { optional: true });
        if (!t) return;
        g.fx('whip', self, t);
        yield* g.damage(self, t, 2);
        yield* g.draw(self.ctrl, 1);
      },
    },
    abilities: [{
      name: 'Явление Бьянки', cost: { blood: 10 },
      can: (g, self) => g.allyRegions(self.ctrl, self, 107).length > 0,
      *effect(g, ctx) { if (!g.onField(ctx.self)) return; g.fx('bianca', ctx.self); yield* g.flip(ctx.self, 107); },
    }],
  },

  // Посох паутины
  109: {
    on: {
      *turnStart(g, self, ev) {
        if (!mine(g, self, ev)) return;
        if (yield* g.yesNo(self.ctrl, 'Посох паутины: положить 1 фишку паутины?', 'yes')) yield* g.addTokens(self, 'web', 1, self);
      },
    },
    abilities: [
      equipAbility(['ally'], 'вашего Союзника'),
      {
        // «оглушить вражеского Союзника в этом регионе» — a chosen target (Оберег protects it).
        name: 'Паутина',
        can: (g, self) => g.tokens(self, 'web') >= 2 && g.targetCandidates(self.ctrl, webSpec(self)).length > 0,
        *plan(g, ctx) {
          if (!(yield* g.chooseTarget(ctx, webSpec(ctx.self)))) return false;
          ctx.self.tok.web -= 2;
          g.emit('tokens', { uid: ctx.self.uid });
        },
        *effect(g, ctx) {
          const t = g.card(ctx.targets[0]);
          g.fx('web', ctx.self, t);
          g.stun(t, ctx.self);
        },
      },
    ],
  },

  // Служитель святой Бьянки
  110: {
    on: {
      *damage(g, self, ev) {
        if (ev.tgt !== self || ev.amount <= 0) return;
        const cands = g.field(self.ctrl).filter((c) => c !== self && g.tokens(c, 'blood') > 0);
        const t = yield* g.pickCard(self.ctrl, cands, 'Служитель святой Бьянки: положите 1 🩸 на вашу карту с 🩸', 'buff');
        if (t) { g.fx('sacrifice', self, t); yield* g.addTokens(t, 'blood', 1, self); }
      },
    },
  },

  // Блэт, охотник на вампиров
  111: {
    cost: (g, player, inst, base) => (inst.x.smokePhase === g.s.phaseId ? 3 : base),
    *onEnter(g, self) {
      const hit = [];
      for (let k = 0; k < 3; k++) {
        const cands = g.targetCandidates(self.ctrl, { kind: 'character', side: 'enemy' }).filter((c) => !hit.includes(c));
        const t = yield* g.pickCard(self.ctrl, cands, `Бросок кунаев: цель ${k + 1} из 3 (можно закончить)`, 'harm', { optional: true });
        if (!t) break;
        hit.push(t);
      }
      if (hit.length) g.fx('kunai', self, hit);
      for (const t of hit) yield* g.damage(self, t, 2);
    },
    abilities: [{
      name: 'Дымовая завеса', fast: true, cost: { blood: 3 },
      *effect(g, ctx) {
        const c = ctx.self;
        if (!g.onField(c)) return;
        g.fx('smoke', c);
        yield* g.toHand(c);
        if (c.zone === 'hand') c.x.smokePhase = g.s.phaseId;
      },
    }],
  },

  // Глава канцелярии Венокус
  112: {
    ...venokus,
    abilities: [
      {
        name: 'Диаблери', cost: { blood: 4 },
        targets: { kind: 'ally', side: 'enemy', prompt: 'Диаблери: уберите из игры вражеского Союзника' },
        *effect(g, ctx) {
          const t = yield* sameOrNew(g, ctx, (c) => g.onField(c) && c.ctrl !== ctx.player, () => g.targetCandidates(ctx.player, { kind: 'ally', side: 'enemy' }), 'Диаблери: уберите из игры вражеского Союзника');
          if (!t) return;
          const vamp = isVamp(g, t), id = t.id;
          g.fx('diablerie', ctx.self, t);
          yield* g.exile(t);
          if (vamp && g.onField(ctx.self)) gainAbilities(g, ctx.self, id, ctx.self);
        },
      },
      ...venokus.proxies,
    ],
  },

  // Вампидап, эталон красоты
  113: {
    enterTokens: { blood: 3 },
    *onEnter(g, self) {
      const p = self.ctrl;
      const cands = g.targetCandidates(p, { kind: 'ally', side: 'enemy', filter: (g2, c) => costNum(g2.def(c)) <= 3 && !g2.allyAt(p, c.region) });
      const t = yield* g.pickCard(p, cands, 'Очарование: завладейте вражеским Союзником стоимостью 3 или меньше');
      if (!t) return;
      g.fx('charm', self, t);
      if (yield* g.takeControl(t, p)) { self.x.charmed = t.uid; t.x.charmedBy = self.uid; }
    },
    *onLeave(g, self) {
      const t = self.x.charmed ? g.card(self.x.charmed) : null;
      self.x.charmed = null;
      if (t && g.onField(t) && t.x.charmedBy === self.uid) { t.x.charmedBy = null; yield* returnControl(g, t); }
    },
    abilities: [{
      name: 'Фанат актёра', cost: { blood: 2 },
      can: (g, self) => { const t = self.x.charmed ? g.card(self.x.charmed) : null; return !!t && g.onField(t) && t.x.charmedBy === self.uid; },
      *effect(g, ctx) {
        const t = ctx.self.x.charmed ? g.card(ctx.self.x.charmed) : null;
        if (!t || !g.onField(t) || t.x.charmedBy !== ctx.self.uid) return;
        g.fx('fan', ctx.self, t);
        yield* g.buff(t, 1, 1, 'perm', ctx.self);
      },
    }],
  },

  // «Красное и красное»
  114: {
    on: { turnStart: income(3) },
    abilities: [{
      name: 'Вон из магазина!', fast: true, cost: { coins: 3 },
      can: (g, self) => g.targetCandidates(self.ctrl, { kind: 'ally', side: 'any' }).some((c) => c.region === self.region),
      *plan(g, ctx) {
        const r = ctx.self.region;
        if (!(yield* g.chooseTarget(ctx, { kind: 'ally', side: 'any', prompt: 'Вон из магазина!: Союзник из этого региона в руку владельца', filter: (g2, c) => c.region === r }))) return false;
      },
      *effect(g, ctx) { const t = g.card(ctx.targets[0]); g.fx('kickOut', ctx.self, t); yield* g.toHand(t); },
    }],
  },

  // Принесите ещё!
  115: {
    *effect(g, ctx) {
      const p = ctx.player;
      g.fx('draw', ctx.self);
      yield* g.draw(p, 1);
      if (g.places(p).some((c) => g.isType(c, 'ТАВЕРНА'))) yield* g.draw(p, 1);
      if (g.field(p).some((c) => g.isType(c, 'ТОРГОВЕЦ'))) yield* g.draw(p, 1);
    },
  },

  // Замок Нассератт
  116: {
    enterTokens: { blood: 3 },
    *onEnter(g, self) {
      const t = yield* g.pickCard(self.ctrl, g.targetCandidates(self.ctrl, { kind: 'ally', side: 'enemy' }), 'Замок Нассератт: уберите из игры вражеского Союзника');
      if (!t) return;
      g.fx('dungeon', self, t);
      yield* g.exile(t);
      if (!t.created && t.zone === 'exile') self.x.exiled = t.uid;
    },
    *onLeave(g, self) { yield* returnExiled(g, self); },
    on: {
      *turnStart(g, self, ev) {
        if (!mine(g, self, ev)) return;
        self.tok.blood = Math.max(0, g.tokens(self, 'blood') - 1);
        g.emit('tokens', { uid: self.uid, log: `«${g.name(self)}»: −1 🩸.` });
        if (g.tokens(self, 'blood') <= 0) yield* g.destroy(self, self);
      },
    },
  },
};
