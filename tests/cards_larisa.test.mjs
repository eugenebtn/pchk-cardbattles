// node tests/cards_larisa.test.mjs
import { makeGame, put, addHand, addGrave, ans, endTurn, runUntil, runBattle, defaultAnswer, passPriority, test, eq, ok, done } from './helpers.mjs';
import { CARDS } from '../js/data/cards.js';

// ---- local helpers ----
const isYesNo = (q) => q.type === 'pick' && q.options.length === 2 && q.options[0].label === 'Да';
/** Default policy, but say «Нет» to optional flips/yes-no questions. */
const NO = (q) => (isYesNo(q) ? 0 : defaultAnswer(q));
const YES = (q) => (isYesNo(q) ? 1 : defaultAnswer(q));
/** Policy with overrides: rules = [(q) => answer | undefined]. */
const pol = (...rules) => (q) => { for (const r of rules) { const a = r(q); if (a !== undefined) return a; } return NO(q); };
/** Run to the current player's main phase. */
const main = (g, fn = NO) => runUntil(g, (q) => q.type === 'main', fn);
/** Answer a list of answers, skipping priority windows in between; then settle with `fn` until main. */
function act(g, first, answers = [], fn = NO) {
  ans(g, first);
  for (const a of answers) { passPriority(g); ans(g, a?.uid ?? a); }
  main(g, fn);
}
const playId = (c) => `play:${c.uid}:${c.id}`;
const canUse = (g, c) => g.pending.options.some((o) => o.id === playId(c));
/** Drain an engine generator outside the game loop (must not ask anything). */
function run(g, gen) { for (let r = gen.next(); !r.done; r = gen.next()) throw new Error('unexpected request ' + r.value?.prompt); }
const L = (p = {}) => ({ leader: 41, ...p });

// ---------- Лариса ----------
test('Лариса: в начале Сражения создаёт Крысу, Квирк даёт ей +1/+1', () => {
  const g = makeGame({ p0: L(), p1: L() });
  put(g, 0, 42);
  main(g); endTurn(g);
  runBattle(g, NO);
  const rat = g.allyAt(0, 0);
  ok(rat && rat.id === 46, 'крыса P0 в регионе 0');
  eq(g.maxHp(rat), 2, 'Ветеринар +1/+1'); eq(g.atk(rat), 2);
  eq(g.allyAt(1, 0), null, 'крыса P1 1/1 погибла в бою');
});

test('Лариса: все регионы заняты — выбранный Союзник +1/+1, Крысы нет, Квирк молчит', () => {
  const g = makeGame({ p0: L(), p1: L() });
  put(g, 0, 42);
  const a = [0, 1, 2, 3, 4].map((r) => put(g, 0, 10, r)); // Бойцы 2/2
  main(g); endTurn(g);
  runUntil(g, (q) => q.type === 'target' && q.prompt.startsWith('Рой крыс!'), NO);
  ans(g, a[3].uid);
  eq(g.atk(a[3]), 3); eq(g.maxHp(a[3]), 3);
  eq(a[3].mods.length, 1, 'Квирк не сработал — новой карты нет');
  eq(g.allies(0).length, 5);
});

test('Лариса «Пи-Пи-Пи»: скидка только первой карте и только в свой ход', () => {
  const g = makeGame({ p0: L(), p1: L() });
  put(g, 0, 46, 0); put(g, 0, 46, 1); // 2 крысы + Лариса = 3 Животных
  const speech = addHand(g, 0, 35), swarm = addHand(g, 0, 22), march = addHand(g, 0, 23);
  main(g);
  eq(g.costOf(0, speech), 0, 'Речь 2 - 3');
  eq(g.costOf(0, march), 0);
  act(g, playId(speech));
  eq(g.P(0).coins, 7, 'заплачено 0');
  eq(g.costOf(0, swarm), 2, 'вторая карта без скидки');
  ans(g, 'end');
  runUntil(g, (q) => g.s.turn === 1 && q.type === 'main', NO);
  eq(g.costOf(0, march), 1, 'в чужой ход скидки нет');
});

// ---------- Рой крыс + Виктор ----------
test('Рой крыс: 2 + 1 за каждый Рой на кладбище; Виктор усиливает и токены', () => {
  const g = makeGame({ p0: L(), p1: L() });
  put(g, 0, 30, 4);
  addGrave(g, 0, 22); addGrave(g, 0, 22);
  const c = addHand(g, 0, 22);
  main(g);
  act(g, playId(c));
  const rats = g.allies(0).filter((x) => x.id === 46);
  eq(rats.length, 4);
  for (const r of rats) { eq(g.atk(r), 2); eq(g.maxHp(r), 2); }
  eq(g.P(0).grave.filter((x) => x.id === 22).length, 3);
});

test('Виктор: -1/-1 сразу убивает новых вражеских Союзников с 1 здоровьем', () => {
  const g = makeGame({ p0: L(), p1: L() });
  put(g, 1, 30, 4);
  const c = addHand(g, 0, 22);
  const k = addHand(g, 0, 39); // Болтливая лошадь 2/2 → 1/1
  main(g);
  act(g, playId(c));
  eq(g.allies(0).length, 0, 'крысы погибли');
  act(g, playId(k), [0]);
  eq(g.atk(k), 1); eq(g.hp(k), 1);
});

// ---------- Медведь ----------
test('Медведь-шатун: Разговор с Животными и схватка уже с усилением Квирка', () => {
  const g = makeGame({ p0: L(), p1: L() });
  put(g, 0, 42);
  const e = put(g, 1, 4, 2); // Вульф Ва 4/8
  const bear = addHand(g, 0, 28);
  g.P(0).coins = 10;
  main(g);
  eq(g.costOf(0, bear), 8, '9 - Лариса');
  act(g, playId(bear), [0]);
  eq(e.dmg, 6, 'Медведь 6/6 после Ветеринара');
  eq(bear.dmg, 4); eq(g.maxHp(bear), 6);
});

// ---------- Нина ----------
test('Нина: дети в соседних регионах, «Моя добыча!» сколько угодно раз, детей не жертвуют', () => {
  const g = makeGame({ p0: L(), p1: L() });
  const nina = addHand(g, 0, 40);
  const f = put(g, 0, 10, 0);
  g.P(0).coins = 10;
  main(g);
  act(g, playId(nina), [2]);
  const kids = [g.allyAt(0, 1), g.allyAt(0, 3)];
  ok(kids.every((k) => k && k.id === 47), 'дети в 1 и 3');
  ans(g, `ab:${nina.uid}:0`);
  ok(!g.pending.options.some((o) => kids.some((k) => k.uid === o.id)), 'детей нельзя выбрать');
  ans(g, f.uid); main(g);
  eq(g.allyAt(0, 0), null);
  for (const k of kids) { eq(g.atk(k), 2); eq(g.maxHp(k), 2); }
  ans(g, `ab:${nina.uid}:0`); ans(g, nina.uid); main(g);
  eq(g.onField(nina), false, 'Нина пожертвовала собой');
  for (const k of kids) eq(g.atk(k), 3);
});

// ---------- Сельская местность ----------
test('Сельская местность: +1 💰 и Коза в начале хода, если в регионе нет Союзника; Оберег', () => {
  const g = makeGame({ p0: L(), p1: L() });
  const farm = put(g, 0, 38, 1);
  put(g, 0, 38, 2); put(g, 0, 10, 2);
  main(g);
  eq(g.P(0).coins, 5 + 2 + 2);
  eq(g.allyAt(0, 1)?.id, 45, 'коза в регионе 1');
  eq(g.allyAt(0, 2)?.id, 10, 'в регионе 2 союзник уже есть');
  ok(!g.targetCandidates(1, { kind: 'cardNotLeader', side: 'enemy' }).includes(farm), 'Оберег: не цель противника');
});

// ---------- Павел Толя ----------
test('Павел Толя: вражеский Союзник в регионе -1/-1, новых класть нельзя (и токены)', () => {
  const g = makeGame({ p0: L(), p1: L() });
  put(g, 0, 27, 2);
  const e = put(g, 1, 10, 2);
  put(g, 1, 10, 0); put(g, 1, 10, 1); // занять 0 и 1
  const h = addHand(g, 1, 10);
  main(g);
  eq(g.atk(e), 1); eq(g.maxHp(e), 1);
  ok(!g.allyRegions(1, h, 10).includes(2), 'регион 2 закрыт');
  endTurn(g);
  runBattle(g, NO);
  // Крыса P1 не может появиться в регионе 2 → встала в 3.
  eq(g.allyAt(1, 3)?.id, 46);
});

test('Павел Толя → пони: облако пропадает; пони → обратно', () => {
  const g = makeGame({ p0: L(), p1: L() });
  const pav = put(g, 0, 27, 2);
  const e = put(g, 1, 4, 2); // Вульф Ва 4/8
  e.stunUntil = 99; // не бьёт пони в Сражении
  main(g, YES);
  eq(pav.id, 52, 'перевёрнут'); eq(g.atk(e), 4); eq(g.maxHp(e), 8);
  ok(g.has(pav, 'maneuver'));
  ans(g, 'end');
  runUntil(g, (q) => isYesNo(q) && g.s.turn === 0, NO);
  ans(g, 1);
  eq(pav.id, 27); eq(g.atk(e), 3); eq(g.maxHp(e), 7);
});

// ---------- Альбо ----------
test('Альбо: противник не играет Действия с Опережением в ваш ход', () => {
  const g = makeGame({ p0: L(), p1: L() });
  put(g, 0, 31, 0);
  const m = addHand(g, 1, 23);
  main(g);
  eq(g.canPlay(1, m, 23, { main: false }), false);
  ans(g, 'end');
  runUntil(g, (q) => g.s.turn === 1 && q.type === 'main', NO);
  ok(canUse(g, m), 'в свой ход можно');
});

test('Альбо → облик крысы: ваши Действия получают Опережение в ход противника', () => {
  const g = makeGame({ p0: L(), p1: L() });
  const albo = put(g, 0, 31, 0);
  const sp = addHand(g, 0, 35);
  main(g, YES);
  eq(albo.id, 58);
  ans(g, 'end');
  runUntil(g, (q) => q.type === 'priority' && q.player === 0 && g.s.turn === 1, NO);
  ans(g, playId(sp));
  passPriority(g);
  eq(g.atk(albo), 4, 'Вдохновляющая речь в ход противника');
  eq(g.P(0).coins, 5 + 2 - 2, 'без скидки Ларисы');
});

// ---------- Которный ----------
test('Которный: Смертельный удар убивает козу с Обороной; лечит Лидера', () => {
  const g = makeGame({ p0: { leader: 20 }, p1: { leader: 20 } });
  g.leader(0).hpNow = 20;
  const k = put(g, 0, 29, 0);
  const goat = put(g, 1, 54, 3); // Квирк-коза 3/5 Оборона
  main(g);
  eq(g.leader(0).hpNow, 23, 'Зализывание ран');
  endTurn(g);
  runBattle(g, pol((q) => (q.defense ? goat.uid : undefined)));
  eq(g.onField(goat), false, 'коза погибла от 2 ран');
  eq(g.leader(1).hpNow, 28, 'Лидер не ранен');
  ok(g.onField(k));
  ok(CARDS[29].kw.includes('fast'));
});

// ---------- Канделакис ----------
test('Канделакис: Мотивация (+2/+0, Прорыв), монеты за раненых Союзников только в Сражении', () => {
  const g = makeGame({ p0: { leader: 20 }, p1: { leader: 20 } });
  const kand = put(g, 0, 44);
  const a = put(g, 0, 10, 0); put(g, 1, 10, 0);
  ok(!CARDS[44].kw.includes('fast'), 'сам Канделакис без Опережения');
  main(g);
  eq(g.P(0).coins, 9);
  ans(g, `ab:${kand.uid}:0`); ans(g, a.uid); main(g);
  eq(g.atk(a), 4); ok(g.has(a, 'breakthrough'));
  eq(g.P(0).coins, 6);
  endTurn(g);
  runBattle(g, NO);
  eq(g.P(0).coins, 8, '2 раненых Союзника');
  eq(g.leader(1).hpNow, 26, 'Прорыв');
});

// ---------- Ворон Барон ----------
test('Ворон Барон: копия Места с типом Хлеб; уходя, уничтожает Хлеб', () => {
  const g = makeGame({ p0: L(), p1: L() });
  const baron = put(g, 0, 43);
  const wh = put(g, 0, 33, 0);
  main(g, pol((q) => (q.prompt?.startsWith('Хлебный') ? wh.uid : undefined)));
  const copy = g.placeAt(0, 1);
  ok(copy && copy.id === 33 && copy.created && g.isType(copy, 'ХЛЕБ'), 'копия-хлеб');
  eq(g.P(0).coins, 5 + 1 + 2, 'копия не приносит доход сразу');
  run(g, g.destroy(baron));
  eq(g.onField(copy), false, 'хлеб уничтожен');
  ok(g.onField(wh), 'оригинал остался');
});

// ---------- Болтливая лошадь ----------
test('Болтливая лошадь: противник показывает N карт, вы выбираете сброс', () => {
  const g = makeGame({ p0: L(), p1: L() });
  const h1 = addHand(g, 1, 10), h2 = addHand(g, 1, 22), h3 = addHand(g, 1, 28);
  const horse = addHand(g, 0, 39);
  main(g);
  ans(g, playId(horse)); ans(g, 0); passPriority(g);
  eq(g.pending.player, 1); eq(g.pending.min, 2, 'N = Лариса + лошадь');
  ans(g, [h1.uid, h2.uid]);
  eq(g.pending.player, 0);
  ok(!g.pending.options.some((o) => o.id === h3.uid), 'непоказанную нельзя');
  ans(g, [h2.uid]);
  main(g);
  ok(g.P(1).grave.includes(h2)); ok(g.P(1).hand.includes(h1) && g.P(1).hand.includes(h3));
});

// ---------- Исполнение желания ----------
test('Исполнение желания: карта из Скрижали используется сразу, за её цену', () => {
  const g = makeGame({ p0: L({ deck: [...Array(10).fill(10), 35] }), p1: L() });
  const a = put(g, 0, 10, 0);
  const w = addHand(g, 0, 25);
  main(g);
  const sp = g.P(0).deck.find((c) => c.id === 35);
  ans(g, playId(w));
  passPriority(g);
  ok(g.pending.type === 'multi'); ans(g, [sp.uid]);
  main(g);
  eq(g.atk(a), 3, 'Речь сработала');
  eq(g.P(0).coins, 7 - 2 - 2, 'Желание 3-1, Речь 2');
  eq(g.P(0).deck.length, 10);
  ok(g.P(0).grave.includes(sp) && g.P(0).grave.includes(w));
});

// ---------- Верёвка с кошкой ----------
test('Верёвка с кошкой: Союзник в руку владельца, Кошка 2/2 с Манёвром', () => {
  const g = makeGame({ p0: L(), p1: L() });
  const e = put(g, 1, 10, 0);
  const c = addHand(g, 0, 36);
  main(g);
  act(g, playId(c), [e, 0]);
  ok(g.P(1).hand.includes(e), 'в руке владельца');
  const cat = g.allyAt(0, 0);
  eq(cat?.id, 48); ok(g.has(cat, 'maneuver'));
});

// ---------- Самопожертвование / Живой таран / Пороховой склад ----------
test('Самопожертвование: уничтожить своего Союзника и взять 2 карты', () => {
  const g = makeGame({ p0: L(), p1: L() });
  const a = put(g, 0, 10, 0);
  const c = addHand(g, 0, 24);
  main(g);
  act(g, playId(c), [a]);
  eq(g.onField(a), false); eq(g.P(0).hand.length, 2);
});

test('Живой таран: свой Союзник + вражеское Место; Оберег Сельской местности', () => {
  const g = makeGame({ p0: L(), p1: L() });
  const a = put(g, 0, 10, 0);
  const wh = put(g, 1, 33, 1), farm = put(g, 1, 38, 2);
  const c = addHand(g, 0, 37);
  main(g);
  ans(g, playId(c)); ans(g, a.uid);
  ok(!g.pending.options.some((o) => o.id === farm.uid), 'Оберег');
  ans(g, wh.uid); main(g);
  eq(g.onField(a), false); eq(g.onField(wh), false); ok(g.onField(farm));
});

test('Пороховой склад: +1 💰, «Взрыв!» за 6 уничтожает вражеского Напарника и сам склад', () => {
  const g = makeGame({ p0: L(), p1: L() });
  const wh = put(g, 0, 33, 0);
  const kand = put(g, 1, 44);
  main(g);
  eq(g.P(0).coins, 8);
  ans(g, `ab:${wh.uid}:0`); ans(g, kand.uid); main(g);
  eq(g.onField(kand), false); eq(g.onField(wh), false); eq(g.P(0).coins, 2);
});

// ---------- Марш-бросок ----------
test('Марш-бросок: +1/+0 всем вашим Союзникам до начала вашего следующего хода', () => {
  const g = makeGame({ p0: L(), p1: L() });
  const a = put(g, 0, 9, 4); // Ополчение 2/2
  const c = addHand(g, 0, 23);
  main(g);
  act(g, playId(c));
  eq(g.atk(a), 3);
  endTurn(g); runBattle(g, NO);
  eq(g.leader(1).hpNow, 22, 'бил с +1');
  eq(g.atk(a), 3, 'ещё действует');
  runUntil(g, (q) => q.type === 'draw' && g.s.turn === 0, NO);
  eq(g.atk(a), 2, 'снято');
});

// ---------- Презрение белок / Речь / Застолье ----------
test('Презрение белок: оба режима', () => {
  const g = makeGame({ p0: L(), p1: L() });
  const c1 = addHand(g, 0, 34), c2 = addHand(g, 0, 34);
  g.P(0).coins = 20;
  main(g);
  act(g, playId(c1), [0]);
  const sq = g.allies(0);
  eq(sq.length, 3); ok(sq.every((x) => x.id === 50 && g.has(x, 'breakthrough')));
  act(g, playId(c2), [1]);
  eq(g.allies(0).filter((x) => x.id === 49).length, 2);
});

test('Вдохновляющая речь: исцеляет 1 и даёт +1/+1 всем вашим Союзникам', () => {
  const g = makeGame({ p0: L(), p1: L() });
  const a = put(g, 0, 10, 0), b = put(g, 0, 10, 1);
  a.dmg = 1;
  const c = addHand(g, 0, 35);
  main(g);
  act(g, playId(c));
  eq(a.dmg, 0); eq(g.maxHp(a), 3); eq(g.atk(b), 3);
});

test('Праздничное застолье: +1/+1, затем лечение или карты со сбросом', () => {
  const g = makeGame({ p0: L(), p1: L() });
  const a = put(g, 0, 10, 0); put(g, 0, 10, 1);
  const c1 = addHand(g, 0, 26), c2 = addHand(g, 0, 26);
  g.P(0).coins = 20; g.leader(0).hpNow = 15;
  main(g);
  act(g, playId(c1), [0]);
  eq(g.leader(0).hpNow, 19); eq(g.atk(a), 3);
  const hand = g.P(0).hand.length; // c2
  ans(g, playId(c2)); ans(g, 1); passPriority(g);
  eq(g.pending.type, 'multi'); eq(g.pending.min, 2);
  ans(g, g.pending.options.slice(0, 2).map((o) => o.id)); main(g);
  eq(g.P(0).hand.length, hand - 1 + 2 - 2); eq(g.atk(a), 4);
});

// ---------- Бешеная обезьянка ----------
test('Бешеная обезьянка: Проворство у Места; без Места — без Манёвра; граната при гибели', () => {
  const g = makeGame({ p0: L(), p1: L() });
  put(g, 0, 33, 1);
  const m1 = addHand(g, 0, 32), m2 = addHand(g, 0, 32), s = addHand(g, 0, 24);
  g.P(0).coins = 20;
  main(g);
  act(g, playId(m1), [1]);
  eq(g.atk(m1), 2); ok(g.has(m1, 'maneuver'));
  act(g, playId(m2), [3]);
  eq(g.atk(m2), 1); ok(!g.has(m2, 'maneuver'), 'нет врождённого Манёвра');
  act(g, playId(s), [m1]);
  eq(g.leader(1).hpNow, 23, 'граната на 2 (атака при гибели)');
});

function monkeyVsOctagon(first) {
  const g = makeGame({ p0: L(), p1: L(), first });
  put(g, 0, 32, 0);
  const oct = put(g, 1, 10, 0);
  g.grant(oct, 'breakthrough', 'perm');
  runUntil(g, (q) => q.type === 'draw' && g.s.round === 2, pol(
    (q) => (q.prompt?.startsWith('Обезьяна') ? q.options.find((o) => o.id === oct.uid)?.id : undefined),
  ));
  ok(g.s.log.some((l) => l.includes('Бешеная обезьянка» погибает')), 'обезьяна погибла');
  return { g, oct };
}
test('Обезьяна первого игрока vs Бойцы Октагона второго: Бойцы успевают усилиться', () => {
  const { g, oct } = monkeyVsOctagon(0);
  ok(g.onField(oct), 'выжили'); eq(g.maxHp(oct), 3); eq(oct.dmg, 2);
});
test('Обезьяна второго игрока vs Бойцы Октагона первого: граната успевает убить', () => {
  const { g, oct } = monkeyVsOctagon(1);
  eq(g.onField(oct), false);
});

// ---------- Квирк ----------
test('Квирк: переворот в козу и обратно', () => {
  const g = makeGame({ p0: L(), p1: L() });
  const q = put(g, 0, 42);
  main(g, YES);
  eq(q.id, 54); eq(g.allyAt(0, 0), q); ok(g.has(q, 'defense'));
  ans(g, 'end');
  runUntil(g, (x) => isYesNo(x) && g.s.turn === 0, NO);
  ans(g, 1);
  eq(q.id, 42); eq(g.allyAt(0, 0), null); ok(g.companions(0).includes(q));
});

done();
