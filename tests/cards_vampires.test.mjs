// node tests/cards_vampires.test.mjs
import { makeGame, put, addHand, addGrave, ans, toMain, play as play0, useAbility as useAbility0, endTurn, runUntil, runBattle, test, eq, ok, done, passPriority, defaultAnswer } from './helpers.mjs';

/** The pending main request lists options computed when it was asked; refresh after editing the position. */
function refresh(g) {
  const q = g.pending;
  if (q?.type === 'main') q.options.splice(0, q.options.length, ...g.mainOptions(q.player));
}
const play = (g, ...a) => { refresh(g); play0(g, ...a); };
const useAbility = (g, ...a) => { refresh(g); useAbility0(g, ...a); };

const DAN = 62, VLAD = 63, LARISA = 41, SFINK = 20;
const H1 = 28; // здоровье Сфинктериона — Лидер противника по умолчанию
/** Fast-play windows are switched off so that answers go straight to the cards under test. */
const mk = (opts = {}) => {
  const g = makeGame({ p0: { leader: opts.l0 ?? DAN, deck: opts.d0 }, p1: { leader: opts.l1 ?? SFINK, deck: opts.d1 }, first: opts.first ?? 0 });
  g.cfg.options.autoPass = [true, true];
  return g;
};
/** Start the game: answer turn-start prompts, then take two coins. */
function begin(g, answers = []) {
  if (g.pending?.begin) ans(g, 'go');
  passPriority(g);
  for (const a of answers) ans(g, typeof a === 'function' ? a(g.pending) : (a?.uid ?? a));
  // Remaining turn-start prompts: default answers (show nothing, skip optional, «да»).
  for (let k = 0; k < 20 && g.pending && g.pending.type !== 'draw' && g.pending.type !== 'main'; k++) ans(g, defaultAnswer(g.pending));
  toMain(g);
}
const abIndex = (g, c, name) => g.script(c).abilities.findIndex((a) => a.name === name);
/** End the second player's turn and play the battle through (default answers) to the next round's first draw. */
function endRound(g) { const r = g.s.round; ans(g, 'end'); runUntil(g, (q) => (q.type === 'draw' && g.s.round > r) || g.s.over); }
const hasOpt = (g, id) => g.pending.options.some((o) => o.id === id);
/** Drive an engine generator that needs no answers. */
const run = (it) => { for (let r = it.next(); !r.done; r = it.next()) if (r.value) throw new Error('unexpected request ' + r.value.prompt); };

// ---------- Лидеры ----------
test('Дан Балан: Отец рода — показать Вампиров → кровь на Лидера', () => {
  const g = mk();
  const a = addHand(g, 0, 69), b = addHand(g, 0, 85); addHand(g, 0, 9);
  ans(g, 'go'); passPriority(g);
  eq(g.pending.type, 'multi'); eq(g.pending.options.length, 2, 'только Вампиры');
  ans(g, [a.uid, b.uid]);
  toMain(g);
  eq(g.tokens(g.leader(0), 'blood'), 2);
});

test('Дан Балан: Рой челюстей и оплата кровью Лидера для Вампиров', () => {
  const g = mk();
  const v = put(g, 0, 85, 4);
  begin(g);
  g.leader(0).tok.blood = 5;
  useAbility(g, g.leader(0), 0, [0, 1]);
  const jaws = g.allies(0).filter((c) => c.id === 64);
  eq(jaws.length, 2); ok(g.has(jaws[0], 'maneuver'));
  eq(g.tokens(g.leader(0), 'blood'), 1);
  useAbility(g, v, 0); // Разгульная вампирша за 1 🩸 с Лидера
  eq(g.atk(v), 2); eq(g.tokens(g.leader(0), 'blood'), 0);
});

test('Граф Влад: Борец за ценности убивает → кровь = изначальному здоровью; персонаж включает Лидера', () => {
  const g = mk({ l0: VLAD });
  const e = put(g, 1, 4, 0); e.dmg = 6; // Вульф Ва 4/8, осталось 2
  begin(g);
  g.P(0).coins = 10;
  useAbility(g, g.leader(0), 0, [e, g.leader(0)]);
  eq(g.allyAt(1, 0), null);
  eq(g.tokens(g.leader(0), 'blood'), 8, 'изначальное здоровье 8 на единственного Вампира — Лидера');
  useAbility(g, g.leader(0), 0, [g.leader(1)]);
  eq(g.leader(1).hpNow, H1 - 2); eq(g.tokens(g.leader(0), 'blood'), 8);
  eq(g.P(0).coins, 4);
});

test('Граф Влад: сбросить → взять; 2 🩸 → 1 💰', () => {
  const g = mk({ l0: VLAD });
  const h = addHand(g, 0, 9);
  begin(g);
  g.leader(0).tok.blood = 3;
  const coins = g.P(0).coins;
  useAbility(g, g.leader(0), 1, [[h.uid]]);
  eq(h.zone, 'grave'); eq(g.P(0).hand.length, 1);
  useAbility(g, g.leader(0), 2);
  eq(g.P(0).coins, coins + 1); eq(g.tokens(g.leader(0), 'blood'), 0);
});

// ---------- Места и доход ----------
test('Одинокий кабак: монета за каждый регион без вашего Места', () => {
  const g = mk();
  put(g, 0, 65, 0); put(g, 0, 89, 1);
  begin(g);
  eq(g.P(0).coins, 5 + 3 + 2 + 2); // кабак 3, бар 2, 2 монеты
});

test('Показательная роскошь: 2 карты и 2 Украшения (доход со следующего хода)', () => {
  const g = mk();
  const c = addHand(g, 0, 66);
  begin(g); g.P(0).coins = 5;
  play(g, c);
  eq(g.P(0).hand.length, 2); eq(g.items(0).filter((x) => x.id === 83).length, 2);
  eq(g.P(0).coins, 0);
  endTurn(g); toMain(g); endRound(g);
  toMain(g); endTurn(g); // раунд 2: первым ходит P1
  eq(g.pending.type, 'draw'); eq(g.P(0).coins, 2, 'по 1 монете с каждого Украшения');
});

test('Разговор с мёртвыми: изгнать Союзника, посмотреть N=здоровье, 2 в руку, остальное вниз', () => {
  const g = mk({ d0: [9, 10, 15, 4, 9, 9, 9, 9] });
  const dead = addGrave(g, 0, 69); // здоровье 4
  const c = addHand(g, 0, 67);
  begin(g); g.P(0).coins = 5;
  const top = g.P(0).deck.slice(0, 4);
  play(g, c, [dead, [top[0].uid, top[1].uid], [top[3].uid, top[2].uid]]);
  eq(dead.zone, 'exile');
  ok(g.P(0).hand.includes(top[0]) && g.P(0).hand.includes(top[1]));
  const d = g.P(0).deck;
  eq(d[d.length - 2], top[3]); eq(d[d.length - 1], top[2]);
});

test('Ужасающий взрыв: оба режима', () => {
  const g = mk();
  const e = put(g, 1, 4, 0), pl = put(g, 1, 89, 2);
  const c1 = addHand(g, 0, 68), c2 = addHand(g, 0, 68);
  begin(g); g.P(0).coins = 10;
  play(g, c1, [0, e]); eq(e.dmg, 4);
  play(g, c2, [1, pl]); eq(g.placeAt(1, 2), null);
});

// ---------- Антон ----------
test('Антон: Восставший труп — изгнать Союзника с кладбища, создать Зомби', () => {
  const g = mk();
  const a = put(g, 0, 69, 0); a.tok.blood = 2;
  const dead = addGrave(g, 0, 9);
  begin(g);
  useAbility(g, a, 0, [dead, 1]);
  eq(dead.zone, 'exile'); eq(g.allyAt(0, 1).id, 106);
});

test('Антон: Опыт крови — свойства Иделаиды (доход, Роковая женщина, Манёвр нет) и +1/+1', () => {
  const g = mk();
  const a = put(g, 0, 69, 0); a.tok.blood = 5;
  const ide = addGrave(g, 1, 87);
  const adolf = addGrave(g, 1, 93);
  const e = put(g, 1, 10, 3);
  begin(g);
  useAbility(g, a, 1, [ide]);
  eq(ide.zone, 'exile'); eq(g.atk(a), 3); eq(g.maxHp(a), 5);
  const k = g.script(a).abilities.findIndex((x, i) => i >= 2 && g.canUseAbility(0, a, i, { main: true }));
  ok(k >= 2, 'прокси-свойство доступно');
  useAbility(g, a, k, [e]); // Роковая женщина за 3 🩸
  ok(g.stunned(e)); eq(g.tokens(a, 'blood'), 0);
  ok(!g.has(a, 'maneuver'));
  a.tok.blood = 2;
  useAbility(g, a, 1, [adolf]);
  ok(g.has(a, 'maneuver'), 'Манёвр Адольфа');
  const coins = g.P(0).coins;
  endTurn(g); toMain(g); endRound(g);
  toMain(g); endTurn(g);
  eq(g.pending.type, 'draw'); eq(g.P(0).coins, coins + 1, 'доход Администратора борделя');
});

test('Антон + Гнездо кукушки: второй раз выбирается другой Союзник с кладбища', () => {
  const g = mk();
  const a = put(g, 0, 69, 0); a.tok.blood = 2; put(g, 0, 94, 0);
  const d1 = addGrave(g, 0, 9), d2 = addGrave(g, 0, 10);
  begin(g);
  useAbility(g, a, 0, [d1, 1, d2, 2]);
  eq(d1.zone, 'exile'); eq(d2.zone, 'exile');
  eq(g.allies(0).filter((c) => c.id === 106).length, 2);
});

// ---------- Действия ----------
test('Мучительные видения: -3/-3', () => {
  const g = mk();
  const e = put(g, 1, 4, 0);
  const c = addHand(g, 0, 70);
  begin(g); g.P(0).coins = 5;
  play(g, c, [e]);
  eq(g.atk(e), 1); eq(g.maxHp(e), 5);
});

test('Сделка с архидемоном: с Вельможей 3/3, без — 2/2', () => {
  const g = mk();
  const c = addHand(g, 0, 71);
  begin(g); g.P(0).coins = 1;
  play(g, c);
  eq(g.leader(0).hpNow, 22); eq(g.P(0).coins, 3);
  const g2 = mk({ l0: LARISA });
  const c2 = addHand(g2, 0, 71);
  begin(g2); g2.P(0).coins = 1;
  const cost = g2.costOf(0, c2);
  play(g2, c2);
  eq(g2.leader(0).hpNow, 23); eq(g2.P(0).coins, 1 - cost + 2);
});

test('Огненная стена: 3 раны всем вражеским Союзникам', () => {
  const g = mk();
  const e1 = put(g, 1, 10, 0), e2 = put(g, 1, 4, 3), own = put(g, 0, 85, 1);
  const c = addHand(g, 0, 74);
  begin(g); g.P(0).coins = 7;
  play(g, c);
  eq(e1.zone, 'grave'); eq(e2.dmg, 3); eq(own.dmg, 0);
});

test('Вампирские ценности: исцеляет и снимает модификаторы, статичные ауры остаются', () => {
  const g = mk();
  const a = put(g, 0, 85, 0); put(g, 0, 77, 1);
  const e = put(g, 1, 4, 2);
  a.mods.push({ atk: 2, hp: 2, until: null }); a.dmg = 2;
  e.mods.push({ atk: -2, hp: -2, until: null });
  const c = addHand(g, 0, 75);
  begin(g); g.P(0).coins = 3;
  const hand = g.P(0).hand.length;
  play(g, c);
  eq(g.atk(a), 1); eq(g.hp(a), 2); eq(a.dmg, 0); eq(g.atk(e), 4);
  ok(g.has(a, 'maneuver'), 'аура Вампирбека не снимается');
  eq(g.P(0).hand.length, hand); // -1 сыграна, +1 взята
});

test('Проломить дверь: Место стоимостью ≤3', () => {
  const g = mk();
  const bar = put(g, 1, 89, 0), mon = put(g, 1, 108, 1);
  const c = addHand(g, 0, 78);
  begin(g); g.P(0).coins = 2;
  ans(g, `play:${c.uid}:78`);
  const opts = g.pending.options.map((o) => o.id);
  ok(opts.includes(bar.uid) && !opts.includes(mon.uid));
  ans(g, bar.uid); passPriority(g);
  eq(g.placeAt(1, 0), null);
});

test('Укус вампира: 2 раны, лечение Лидера, 2 🩸 на Вампира', () => {
  const g = mk();
  const v = put(g, 0, 85, 0);
  const c = addHand(g, 0, 79);
  begin(g); g.P(0).coins = 2; g.leader(0).hpNow = 20;
  play(g, c, [g.leader(1), v]);
  eq(g.leader(1).hpNow, H1 - 2); eq(g.leader(0).hpNow, 22); eq(g.tokens(v, 'blood'), 2);
});

test('Дорожный налёт: уничтожить и дважды Снабжение', () => {
  const g = mk();
  const e = put(g, 1, 4, 0); const v = put(g, 0, 85, 1); v.tok.blood = 1;
  const c = addHand(g, 0, 82);
  begin(g); g.P(0).coins = 5;
  play(g, c, [e, v, v]);
  eq(e.zone, 'grave'); eq(g.tokens(v, 'blood'), 3);
});

test('Атака когтями: Раскрытие пальцев считает только другие копии', () => {
  const g = mk();
  const e = put(g, 1, 4, 0);
  for (let k = 0; k < 3; k++) addHand(g, 1, 9);
  addGrave(g, 0, 91); addGrave(g, 0, 91);
  const c = addHand(g, 0, 91);
  begin(g); g.P(0).coins = 2;
  play(g, c, [e]);
  eq(e.dmg, 3); eq(g.P(1).hand.length, 1);
});

test('Скоординированный удар: раны = число ваших Союзников', () => {
  const g = mk();
  put(g, 0, 85, 0); put(g, 0, 85, 1); put(g, 0, 85, 2);
  const e = put(g, 1, 4, 3);
  const c = addHand(g, 0, 99);
  begin(g); g.P(0).coins = 2;
  play(g, c, [e]); eq(e.dmg, 3);
});

test('Принесите ещё!: 1 + Таверна + Торговец', () => {
  const g = mk();
  put(g, 0, 89, 0); put(g, 0, 87, 1);
  const c = addHand(g, 0, 115);
  begin(g); g.P(0).coins = 3;
  play(g, c);
  eq(g.P(0).hand.length, 3);
});

// ---------- Предметы ----------
test('Символ бога Солнца: Оберег экипированному Союзнику или Месту', () => {
  const g = mk();
  const a = put(g, 0, 85, 0), pl = put(g, 0, 89, 1);
  const s = put(g, 0, 72);
  begin(g); g.P(0).coins = 4;
  useAbility(g, s, 0, [a]);
  ok(g.has(a, 'ward')); ok(!g.targetCandidates(1, { kind: 'ally', side: 'enemy' }).includes(a));
  useAbility(g, s, 0, [pl]);
  ok(!g.has(a, 'ward')); ok(g.has(pl, 'ward')); eq(g.P(0).coins, 0);
});

test('Меч Бесагона: 3 раны при появлении, удвоение атаки в Сражении, возврат в зону Лидера', () => {
  const g = mk();
  const e = put(g, 1, 4, 4); // Вульф Ва 4/8
  const a = put(g, 0, 10, 0);  // Бойцы 2/2 одни в регионе
  const sw = addHand(g, 0, 76);
  begin(g); g.P(0).coins = 7;
  play(g, sw, [e]);
  eq(e.dmg, 3);
  useAbility(g, sw, 0, [a]);
  eq(sw.equip, a.uid);
  endTurn(g); toMain(g); endRound(g);
  eq(g.leader(1).hpNow, H1 - 4, 'атака удвоена: 4');
  eq(g.atk(a), 3, 'после фазы удвоение снято (2 +1 от свойства Бойцов)');
  // Союзник погиб — меч возвращается в зону Лидера.
  const g2 = mk(); const a2 = put(g2, 0, 10, 0); const sw2 = put(g2, 0, 76); sw2.equip = a2.uid;
  begin(g2);
  run(g2.destroy(a2));
  eq(a2.zone, 'grave'); eq(sw2.zone, 'support'); eq(sw2.equip, null);
});

test('Посох паутины: копит паутину даже без экипировки; 2 паутины — оглушение в регионе', () => {
  const g = mk();
  const st = put(g, 0, 109);
  const a = put(g, 0, 85, 2), e = put(g, 1, 10, 2);
  ans(g, 'go'); passPriority(g);
  ans(g, 1); // да, положить паутину
  toMain(g);
  eq(g.tokens(st, 'web'), 1);
  st.tok.web = 2;
  ok(!g.canUseAbility(0, st, 1, { main: true }), 'без экипировки нельзя');
  g.P(0).coins = 2;
  useAbility(g, st, 0, [a]);
  useAbility(g, st, 1, [e]); // цель выбирается (Оберег защищает)
  ok(g.stunned(e)); eq(g.tokens(st, 'web'), 0);
});

test('Вампирский гроб: лечение 1 и 1 🩸 в начале хода; уничтожить — Вампир с кладбища в руку', () => {
  const g = mk();
  const cof = put(g, 0, 90);
  const v = put(g, 0, 102, 0); v.dmg = 2;
  const dead = addGrave(g, 0, 85);
  ans(g, 'go'); passPriority(g);
  ans(g, v.uid); // Лидер Дан тоже Вампир — выбираем Стражей
  toMain(g);
  eq(v.dmg, 1); eq(g.tokens(v, 'blood'), 1);
  useAbility(g, cof, 0, [dead]);
  eq(dead.zone, 'hand'); eq(cof.zone, 'grave');
});

test('Кузнец Свон: найти Предмет на верх Скрижали; бесплатная экипировка раз за ход', () => {
  const g = mk({ d0: [9, 9, 9, 72, 9, 9] });
  const sw = addHand(g, 0, 92);
  const s1 = put(g, 0, 72), s2 = put(g, 0, 109);
  const a = put(g, 0, 85, 0);
  begin(g); g.P(0).coins = 3;
  const item = g.P(0).deck.find((c) => c.id === 72);
  play(g, sw, [2, [item.uid]]);
  eq(g.P(0).deck[0], item);
  eq(g.P(0).coins, 0);
  g.P(0).coins = 2;
  useAbility(g, s1, 0, [a]);
  eq(g.P(0).coins, 2, 'первая экипировка бесплатна');
  useAbility(g, s2, 0, [a]);
  eq(g.P(0).coins, 0, 'вторая стоит 2');
});

// ---------- Союзники ----------
test('Прикуслав: уничтожить себя → Вампир получает Оберег и Нерушимость до конца фазы', () => {
  const g = mk();
  const pr = put(g, 0, 73, 0), v = put(g, 0, 85, 1);
  begin(g);
  useAbility(g, pr, 0, [v]);
  eq(pr.zone, 'grave'); ok(g.has(v, 'ward')); ok(g.has(v, 'indestructible'));
  endTurn(g);
  ok(!g.has(v, 'ward'));
});

test('Вампирбек: Манёвр Вампирам; +2/+2 входящему Вампиру за 2 🩸 (один раз)', () => {
  const g = mk();
  const vb = put(g, 0, 77, 0); vb.tok.blood = 4;
  const c = addHand(g, 0, 85);
  begin(g); g.P(0).coins = 5;
  play(g, c, [1, 1]);
  const v = g.allyAt(0, 1);
  eq(g.atk(v), 3); eq(g.maxHp(v), 4); eq(g.tokens(vb, 'blood'), 2);
  ok(g.has(v, 'maneuver')); ok(g.has(vb, 'maneuver'));
});

test('Арена: +2/+2, если в каждом другом регионе ваш Союзник; доход 1', () => {
  const g = mk();
  put(g, 0, 80, 0);
  for (const r of [0, 1, 2, 3]) put(g, 0, 10, r);
  const c = addHand(g, 0, 85);
  begin(g);
  eq(g.P(0).coins, 5 + 1 + 2);
  play(g, c, [4]);
  eq(g.atk(g.allyAt(0, 4)), 3);
});

test('Деревенская закусочная: доход 2; Сделать заказ — раз за фазу', () => {
  const g = mk();
  const z = put(g, 0, 81, 0);
  begin(g);
  eq(g.P(0).coins, 9);
  g.leader(0).hpNow = 15;
  useAbility(g, z, 0);
  eq(g.leader(0).hpNow, 18);
  ok(!g.canUseAbility(0, z, 0, { main: true }));
});

test('Лука: Подростковая ярость (только 2 🩸) и И чё?', () => {
  const g = mk();
  const l = put(g, 0, 84, 0); l.tok.blood = 6;
  const e = put(g, 1, 10, 0); // 2/2
  begin(g);
  useAbility(g, l, 0); ok(g.has(l, 'ward')); eq(g.tokens(l, 'blood'), 4);
  endTurn(g); toMain(g); endRound(g);
  eq(g.tokens(l, 'blood'), 2 + 3, 'сняли 2, затем Кровопийца: +2 за убитого и +1 за раны Лидеру');
  eq(e.zone, 'grave');
  eq(g.leader(1).hpNow, H1 - 2, 'Прорыв: 4 атаки, 2 избытка');
  eq(g.atk(l), 2, 'бонус до конца Сражения');
});

test('Адриан: планирование в начале хода; Тактика с кладбища в руку', () => {
  const g = mk();
  const ad = put(g, 0, 86, 0); ad.tok.blood = 2;
  const t = addGrave(g, 0, 91);
  ans(g, 'go'); passPriority(g);
  eq(g.pending.type, 'multi'); ok(g.pending.plan);
  ans(g, []);
  toMain(g);
  useAbility(g, ad, 0, [t]);
  eq(t.zone, 'hand');
});

test('Иделаида: доход 1, оглушение за 3 🩸', () => {
  const g = mk();
  const i = put(g, 0, 87, 0); i.tok.blood = 3;
  const e = put(g, 1, 10, 0);
  begin(g);
  eq(g.P(0).coins, 8);
  useAbility(g, i, 0, [e]);
  ok(g.stunned(e));
  endTurn(g); toMain(g); endRound(g);
  eq(e.zone, 'grave', 'Иделаида убила'); eq(i.dmg, 0, 'оглушённый не бьёт');
});

test('Цеца: Острое слово на не созданного вражеского Союзника; Унижение', () => {
  const g = mk({ first: 1 });
  const z = put(g, 0, 88, 0); z.tok.blood = 2;
  const c = addHand(g, 1, 4);
  begin(g); g.P(1).coins = 10;
  play(g, c, [3]);
  const e = g.allyAt(1, 3);
  eq(e.dmg, 1); eq(g.tokens(z, 'blood'), 3);
  run(g.create(1, 64, 2)); // созданный — без Острого слова
  eq(g.allyAt(1, 2).dmg, 0); eq(g.tokens(z, 'blood'), 3);
  endTurn(g); toMain(g);
  useAbility(g, z, 0, [e]);
  eq(g.atk(e), 2); eq(g.tokens(z, 'blood'), 0);
});

test('Вампирский бар: Вампир в этом регионе получает 2 🩸 (+1 с Димитаром)', () => {
  const g = mk();
  put(g, 0, 89, 2); put(g, 0, 101, 0);
  const c = addHand(g, 0, 85), c2 = addHand(g, 0, 85);
  begin(g); g.P(0).coins = 5;
  play(g, c, [2]);
  eq(g.tokens(g.allyAt(0, 2), 'blood'), 3);
  play(g, c2, [3]);
  eq(g.tokens(g.allyAt(0, 3), 'blood'), 0);
});

test('Адольф: противник сбрасывает карту; при пустой руке — 3 раны Лидеру', () => {
  const g = mk();
  const a = put(g, 0, 93, 0); a.tok.blood = 6;
  const h = addHand(g, 1, 9);
  begin(g);
  useAbility(g, a, 0, [[h.uid]]);
  eq(h.zone, 'grave');
  useAbility(g, a, 0);
  eq(g.leader(1).hpNow, H1 - 3);
});

test('Гнездо кукушки: доход 2 и двойное свойство Вампира за 🩸', () => {
  const g = mk();
  put(g, 0, 94, 1);
  const o = put(g, 0, 96, 1); o.tok.blood = 2;
  const o2 = put(g, 0, 96, 2); o2.tok.blood = 2;
  const e = put(g, 1, 4, 0);
  begin(g);
  eq(g.P(0).coins, 9);
  useAbility(g, o, 0, [e]); eq(e.dmg, 2, 'дважды');
  useAbility(g, o2, 0, [e]); eq(e.dmg, 3, 'вне региона Гнезда — один раз');
});

test('Королевский экипаж: 2 + 1 с Вельможей; Манёвр Места', () => {
  const g = mk();
  const ex = put(g, 0, 95, 0); put(g, 0, 86, 0);
  ans(g, 'go'); passPriority(g);
  ans(g, []); // Адриан: планирование
  toMain(g);
  eq(g.P(0).coins, 5 + 3 + 2);
  endTurn(g); toMain(g); endTurn(g);
  runUntil(g, (q) => q.type === 'region' && q.row === 'place');
  ans(g, 3);
  eq(g.placeAt(0, 3), ex); eq(g.placeAt(0, 0), null);
});

test('Отпрыск: 1 рана за 2 🩸; +3/+3 и 3 💰 только один раз', () => {
  const g = mk();
  const o = put(g, 0, 96, 0); o.tok.blood = 10;
  const e = put(g, 1, 4, 0);
  begin(g);
  useAbility(g, o, 0, [e]); eq(e.dmg, 1);
  const c = g.P(0).coins;
  useAbility(g, o, 1);
  eq(g.atk(o), 4); eq(g.maxHp(o), 6); eq(g.P(0).coins, c + 3);
  ok(!g.canUseAbility(0, o, 1, { main: true }));
});

test('Флореан: снять всю кровь → Союзник-Вампир стоимостью ≤ X в соседний регион', () => {
  const g = mk({ d0: [9, 9, 85, 84, 87, 9, 9] });
  const f = put(g, 0, 97, 2); f.tok.blood = 2;
  ans(g, 'go'); passPriority(g);
  ans(g, 1);
  eq(g.pending.type, 'multi');
  ok(g.pending.options.every((o) => [85, 84].includes(g.card(o.id).id)), 'только Вампиры ≤2');
  const luka = g.pending.options.find((o) => g.card(o.id).id === 84).id;
  ans(g, [luka]);
  eq(g.pending.type, 'region'); ok(g.pending.options.every((o) => [1, 3].includes(o.id)));
  ans(g, 3);
  toMain(g);
  eq(g.allyAt(0, 3).id, 84); eq(g.tokens(f, 'blood'), 0);
});

test('Кудрегар: оглушает всех других Союзников рядом (и своих); Берёзовый сок', () => {
  const g = mk();
  const own = put(g, 0, 85, 1), own2 = put(g, 0, 10, 4), e = put(g, 1, 10, 2), far = put(g, 1, 10, 0);
  own2.dmg = 1;
  const c = addHand(g, 0, 98);
  begin(g); g.P(0).coins = 5;
  play(g, c, [2]);
  const k = g.allyAt(0, 2);
  ok(g.stunned(own)); ok(g.stunned(e)); ok(!g.stunned(far)); ok(!g.stunned(own2));
  ok(!g.stunned(k));
});

test('Кудрегар: раны исцеляют другого Союзника (через Огненную стену противника)', () => {
  const g = mk({ first: 1 });
  const ally = put(g, 0, 4, 1); ally.dmg = 3;
  const k = put(g, 0, 98, 2);
  const c = addHand(g, 1, 74);
  begin(g); g.P(1).coins = 7;
  play(g, c, [ally]); // Берёзовый сок: выбрать Вульф Ва (единственный кандидат → автоматически)
  eq(k.dmg, 3); eq(ally.dmg, 3, '3 от стены + 3 исцелено = 3');
});

test('Подростки-беспризорники: не-Союзник противника → 1 рана его Лидеру', () => {
  const g = mk({ first: 1 });
  put(g, 0, 100, 0);
  const a = addHand(g, 1, 74), b = addHand(g, 1, 10);
  begin(g); g.P(1).coins = 10;
  play(g, b, [3]); eq(g.leader(1).hpNow, H1);
  play(g, a); eq(g.leader(1).hpNow, H1 - 1);
});

test('Димитар: Разговор с Вампирами, +1 🩸, Призыв семейства', () => {
  const g = mk();
  put(g, 0, 85, 0); put(g, 0, 85, 1);
  const d = addHand(g, 0, 101);
  begin(g); g.P(0).coins = 5;
  eq(g.costOf(0, d), 4, 'Разговор с Вампирами: 2 Союзника + Лидер-Вампир (движок считает все карты типа)');
  play(g, d, [2]);
  const dm = g.allyAt(0, 2);
  run(g.addTokens(dm, 'blood', 1));
  eq(g.tokens(dm, 'blood'), 2);
  const n = g.P(0).hand.length;
  useAbility(g, dm, 0);
  eq(g.P(0).hand.length, n + 1);
});

test('Стражи высшего совета: исцелить 2 за 2 🩸', () => {
  const g = mk();
  const s = put(g, 0, 102, 0); s.tok.blood = 2; s.dmg = 3;
  begin(g);
  useAbility(g, s, 0); eq(s.dmg, 1);
});

test('Солдат инквизиции: первая не-Человек карта Союзника противника за фазу +1', () => {
  const g = mk({ first: 1, l0: SFINK, l1: DAN });
  put(g, 0, 103, 0);
  const v1 = addHand(g, 1, 85), v2 = addHand(g, 1, 85), h = addHand(g, 1, 9);
  begin(g);
  eq(g.costOf(1, h), 3, 'Человек — без наценки');
  eq(g.costOf(1, v1), 2);
  g.P(1).coins = 10;
  play(g, v1, [1]);
  eq(g.P(1).coins, 8);
  eq(g.costOf(1, v2), 1);
});

test('Агент тайной канцелярии: с другим Человеком — сбросить не-Человека из руки противника', () => {
  const g = mk();
  put(g, 0, 103, 0);
  const x = addHand(g, 1, 85); addHand(g, 1, 9);
  const c = addHand(g, 0, 104);
  begin(g); g.P(0).coins = 3;
  play(g, c, [1, [x.uid]]);
  eq(x.zone, 'grave'); eq(g.P(1).hand.length, 1);
});

test('Искатель нечисти: Преимущество напротив не-Человека', () => {
  const g = mk();
  put(g, 1, 10, 2);
  const c = addHand(g, 0, 105);
  begin(g); g.P(0).coins = 4;
  play(g, c, [2]);
  const s = g.allyAt(0, 2);
  ok(g.has(s, 'advantage'));
  endTurn(g); toMain(g); endRound(g);
  eq(s.dmg, 0, 'убил первым, ответа нет');
});

test('Служитель святой Бьянки: раны → 1 🩸 на другую карту с 🩸', () => {
  const g = mk({ first: 1 });
  const s = put(g, 0, 110, 0); const v = g.leader(0); v.tok.blood = 1;
  const c = addHand(g, 1, 74);
  begin(g); g.P(1).coins = 7;
  play(g, c, [v]); // выбор делает P0
  eq(g.tokens(v, 'blood'), 2); eq(s.zone, 'grave');
});

// ---------- Монастырь / Бьянка ----------
test('Монастырь: кровь за раны Союзников рядом, Удар плетью, переворот за 10 🩸 в любой регион', () => {
  const g = mk();
  const m = put(g, 0, 108, 2);
  const a = put(g, 0, 4, 3); // 4/8
  const e = put(g, 1, 4, 0);
  ans(g, 'go'); passPriority(g);
  eq(g.pending.type, 'target'); ans(g, a.uid); // Удар плетью
  toMain(g);
  eq(a.dmg, 2); eq(g.tokens(m, 'blood'), 1); eq(g.P(0).hand.length, 1);
  m.tok.blood = 10;
  useAbility(g, m, 0, [0 + 1, e]); // регион 1, затем Мучительный голод — автоматически единственная цель
  const b = g.allyAt(0, 1);
  eq(b, m); eq(b.id, 107); eq(g.placeAt(0, 2), null);
  eq(e.zone, 'grave'); eq(g.tokens(b, 'blood'), 6, 'стоимость Вульф Ва');
  const f = g.leader(1).hpNow;
  useAbility(g, b, 0);
  eq(g.leader(1).hpNow, f - 1);
});

test('Монастырь: кровь за боевые раны, даже если Союзник погиб', () => {
  const g = mk();
  const m = put(g, 0, 108, 2);
  put(g, 0, 85, 1); put(g, 1, 4, 1);
  begin(g); endTurn(g); toMain(g); endRound(g);
  eq(g.allyAt(0, 1), null);
  eq(g.tokens(m, 'blood'), 1);
});

// ---------- Блэт ----------
test('Блэт: Бросок кунаев до 3 целей; Дымовая завеса — в руку и за 3 💰 в эту фазу', () => {
  const g = mk();
  const e1 = put(g, 1, 4, 0), e2 = put(g, 1, 9, 1);
  const c = addHand(g, 0, 111);
  begin(g); g.P(0).coins = 8;
  play(g, c, [2, e1, e2, null]);
  eq(e1.dmg, 2); eq(e2.zone, 'grave'); eq(g.leader(1).hpNow, H1);
  const b = g.allyAt(0, 2); b.tok.blood = 3;
  useAbility(g, b, 0);
  eq(b.zone, 'hand'); eq(g.costOf(0, b), 3);
  g.P(0).coins = 3;
  play(g, b, [2, g.leader(1), null]);
  eq(g.leader(1).hpNow, H1 - 2); eq(g.P(0).coins, 0);
  const b2 = g.allyAt(0, 2); b2.tok.blood = 3;
  useAbility(g, b2, 0);
  endTurn(g);
  eq(g.costOf(0, b2), 8, 'скидка только до конца фазы');
});

// ---------- Венокус ----------
test('Венокус: Диаблери изгоняет; у Вампира — забирает свойства', () => {
  const g = mk();
  const v = put(g, 0, 112, 0); v.tok.blood = 8;
  const h = put(g, 1, 10, 1), lu = put(g, 1, 84, 2);
  begin(g);
  useAbility(g, v, 0, [h]);
  eq(h.zone, 'exile');
  eq((v.x.gained || []).length, 0);
  useAbility(g, v, 0, [lu]);
  eq(lu.zone, 'exile'); eq(v.x.gained[0], 84);
  // Получено «И чё?» (Опережение) и «Подростковая ярость».
  v.tok.blood = 2;
  refresh(g);
  const k = g.script(v).abilities.findIndex((a, i) => i > 0 && a.fast && g.canUseAbility(0, v, i, { main: true }));
  ok(k > 0);
  useAbility(g, v, k);
  ok(g.has(v, 'ward'));
});

// ---------- Вампидап ----------
test('Вампидап: Очарование до ухода карты; Фанат актёра', () => {
  const g = mk();
  const e = put(g, 1, 10, 3);  // стоимость 2
  put(g, 1, 4, 1);             // стоимость 6 — нельзя
  const c = addHand(g, 0, 113);
  begin(g); g.P(0).coins = 4;
  play(g, c, [e]);
  const vd = g.companions(0)[0];
  eq(e.ctrl, 0); eq(g.allyAt(0, 3), e); eq(g.tokens(vd, 'blood'), 3);
  useAbility(g, vd, 0);
  eq(g.atk(e), 3);
  run(g.destroy(vd));
  eq(e.ctrl, 1); eq(g.allyAt(1, 3), e);
});

test('Вампидап: если регион владельца занят — владелец переносит Союзника в свободный регион', () => {
  const g = mk();
  const e = put(g, 1, 9, 3);
  const c = addHand(g, 0, 113);
  begin(g); g.P(0).coins = 4;
  play(g, c, [e]);
  const vd = g.companions(0)[0];
  const other = put(g, 1, 10, 3); // противник занял регион 3
  const it = g.destroy(vd); let r = it.next();
  eq(r.value?.type, 'region'); eq(r.value.player, 1);
  r = it.next(0); while (!r.done) r = it.next();
  eq(e.ctrl, 1); eq(g.allyAt(1, 0), e); eq(g.allyAt(1, 3), other); eq(g.allyAt(0, 3), null);
});

// ---------- «Красное и красное» ----------
test('«Красное и красное»: доход 3; Союзник из региона — в руку владельца', () => {
  const g = mk();
  const t = put(g, 0, 114, 2); const e = put(g, 1, 4, 2);
  begin(g);
  eq(g.P(0).coins, 10);
  useAbility(g, t, 0, [e]);
  eq(e.zone, 'hand'); ok(g.P(1).hand.includes(e));
});

// ---------- Замок Нассератт ----------
test('Замок Нассератт: изгнание, −1 🩸 в начале хода, возврат при уходе', () => {
  const g = mk();
  const e = put(g, 1, 4, 1);
  const c = addHand(g, 0, 116);
  begin(g); g.P(0).coins = 3;
  play(g, c, [0, e]);
  const castle = g.placeAt(0, 0);
  eq(e.zone, 'exile'); eq(g.tokens(castle, 'blood'), 3);
  castle.tok.blood = 1;
  endTurn(g); toMain(g); endRound(g); toMain(g);
  // Начало хода P0: снять 1 → 0 → замок уничтожен → союзник возвращается (регион выбирает владелец).
  ans(g, 'end');
  eq(g.pending.type, 'region'); eq(g.pending.player, 1);
  ans(g, 1);
  eq(castle.zone, 'grave'); eq(g.allyAt(1, 1)?.uid, e.uid);
});

test('Замок Нассератт: нет свободного региона — Союзник остаётся вне игры', () => {
  const g = mk();
  const e = put(g, 1, 4, 1);
  const c = addHand(g, 0, 116);
  begin(g); g.P(0).coins = 3;
  play(g, c, [0, e]);
  const castle = g.placeAt(0, 0);
  for (let r = 0; r < 5; r++) put(g, 1, 10, r);
  run(g.destroy(castle));
  eq(e.zone, 'exile');
});

done();
