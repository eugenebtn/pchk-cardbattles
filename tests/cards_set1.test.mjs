// node tests/cards_set1.test.mjs
import { makeGame, put, addHand, addGrave, ans, endTurn, runUntil, defaultAnswer, passPriority, test, eq, ok, done } from './helpers.mjs';

const isYesNo = (q) => q.type === 'pick' && q.options.length === 2 && q.options[0].label === 'Да';
const NO = (q) => (isYesNo(q) ? 0 : defaultAnswer(q));
const YES = (q) => (isYesNo(q) ? 1 : defaultAnswer(q));
const main = (g, fn = NO) => runUntil(g, (q) => q.type === 'main', fn);
function act(g, first, answers = [], fn = NO) {
  ans(g, first);
  for (const a of answers) { passPriority(g); ans(g, a?.uid ?? a); }
  main(g, fn);
}
const playId = (c) => `play:${c.uid}:${c.id}`;
const canUse = (g, c) => g.pending.options.some((o) => o.id === playId(c));
const L = (p = {}) => ({ leader: 41, ...p });
const S = (p = {}) => ({ leader: 20, ...p });

test('Исчадие страданий: -1 💰 за каждого Союзника на кладбище', () => {
  const g = makeGame({ p0: S(), p1: S() });
  const c = addHand(g, 0, 368);
  addGrave(g, 0, 9); addGrave(g, 0, 9); addGrave(g, 0, 10); addGrave(g, 0, 23);
  eq(g.costOf(0, c), 10);
});

test('Афиша «Игра шутов»: Шут каждый ход; при полном поле — уничтожается, все +1/+1', () => {
  const g = makeGame({ p0: S(), p1: L() });
  const af = put(g, 0, 369);
  const a = [0, 1, 2].map((r) => put(g, 0, 9, r));
  main(g);
  eq(g.allyAt(0, 3)?.id, 901, 'шут в первом свободном');
  ok(g.onField(af), 'ещё не всё занято');
  ans(g, 'end');
  runUntil(g, (q) => q.type === 'main' && g.s.turn === 0, NO);
  ok(!g.onField(af), 'Афиша уничтожена');
  eq(g.allies(0).length, 5);
  eq(g.atk(a[0]), 3); eq(g.maxHp(g.allyAt(0, 4)), 2, 'новый шут тоже +1/+1');
});

test('Адская гончая: сброс Союзника → Прорыв (раз в фазу), первый сброс за фазу → +1/+0', () => {
  const g = makeGame({ p0: L(), p1: L() });
  const h = put(g, 0, 370, 0);
  const x1 = addHand(g, 0, 9); addHand(g, 0, 9);
  main(g);
  ans(g, `ab:${h.uid}:0`); ans(g, [x1.uid]); main(g);
  ok(g.P(0).grave.includes(x1));
  ok(g.has(h, 'breakthrough')); eq(g.atk(h), 2, 'Животная ярость');
  ok(!g.pending.options.some((o) => o.id === `ab:${h.uid}:0`), 'один раз за фазу');
  ans(g, 'end');
  runUntil(g, (q) => q.type === 'main' && g.s.turn === 1, NO);
  ok(g.has(h, 'breakthrough'), 'до начала вашего следующего хода');
  runUntil(g, (q) => q.type === 'draw' && g.s.turn === 0, NO);
  ok(!g.has(h, 'breakthrough'), 'снято'); eq(g.atk(h), 2, '+1/+0 постоянный');
});

test('Лавочник храма юмора: Шут в соседнем регионе; доход за Союзников рядом', () => {
  const g = makeGame({ p0: L(), p1: L() });
  const c = addHand(g, 0, 371);
  main(g);
  ans(g, playId(c)); ans(g, 2); passPriority(g);
  eq(g.pending.type, 'region'); ok(g.pending.options.every((o) => [1, 3].includes(o.id)));
  ans(g, 3); main(g);
  eq(g.allyAt(0, 3)?.id, 901);
  put(g, 1, 9, 1);
  ans(g, 'end');
  const coins = g.P(0).coins;
  runUntil(g, (q) => q.type === 'draw' && g.s.turn === 0 && g.s.round === 2, NO);
  eq(g.P(0).coins, coins + 2, 'свой Шут + вражеский Союзник рядом');
});

test('Засада речных гномов: X=5 → 2 Речных гнома 2/2', () => {
  const g = makeGame({ p0: S(), p1: S() });
  const c = addHand(g, 0, 372);
  main(g);
  act(g, playId(c), [5]);
  const gn = g.allies(0).filter((x) => x.id === 902);
  eq(gn.length, 2); eq(g.atk(gn[0]), 2); ok(g.isType(gn[0], 'ГНОМ'));
  eq(g.P(0).coins, 9 - 5);
});

test('Стены змия хрустального: +3 💰; нельзя играть Союзников за 4+', () => {
  const g = makeGame({ p0: S(), p1: S() });
  put(g, 0, 373, 0);
  const big = addHand(g, 0, 28), small = addHand(g, 0, 371), cheapNow = addHand(g, 0, 368);
  for (let k = 0; k < 9; k++) addGrave(g, 0, 9); // Исчадие 13-9 = 4 → всё ещё нельзя
  main(g);
  eq(g.P(0).coins, 5 + 2 + 3 + 2);
  ok(!canUse(g, big)); ok(canUse(g, small)); ok(!canUse(g, cheapNow));
  addGrave(g, 0, 9); // теперь 3
  ok(g.canPlay(0, cheapNow, 368, { main: true }), 'за 3 уже можно');
});

test('Барбара: 2 раны и лечение Лидеру в начале хода → 2 💰 раз в ход', () => {
  const g = makeGame({ p0: L(), p1: L() });
  put(g, 0, 374);
  const rub = addHand(g, 0, 378);
  main(g, YES);
  eq(g.leader(0).hpNow, 25); eq(g.P(0).coins, 5 + 2 + 2);
  act(g, playId(rub), [0], YES);
  eq(g.leader(0).hpNow, 22, 'Рубака ранил Лидера');
  eq(g.P(0).coins, 9 - 5, 'второй раз за ход монет нет');
});

test('Барбара: отказ от монет — можно получить позже в этом ходу', () => {
  const g = makeGame({ p0: L(), p1: L() });
  put(g, 0, 374);
  const rub = addHand(g, 0, 378);
  main(g, NO);
  eq(g.P(0).coins, 7);
  act(g, playId(rub), [0], YES);
  eq(g.P(0).coins, 7 - 5 + 3);
});

test('Командный игрок: ваши Союзники в соседних регионах +1/+1', () => {
  const g = makeGame({ p0: S(), p1: S() });
  const a = put(g, 0, 9, 1), b = put(g, 0, 9, 3), far = put(g, 0, 9, 4), e = put(g, 1, 9, 1);
  const c = addHand(g, 0, 375);
  main(g);
  act(g, playId(c), [2]);
  eq(g.atk(a), 3); eq(g.maxHp(b), 3); eq(g.atk(far), 2); eq(g.atk(e), 2);
});

test('Наездник на жабе: карта за первого дешёвого Союзника за фазу; Атака языком оглушает рядом', () => {
  const g = makeGame({ p0: S(), p1: S() });
  const t = put(g, 0, 376, 2);
  const m1 = addHand(g, 0, 32), m2 = addHand(g, 0, 32), big = addHand(g, 0, 4);
  const near = put(g, 1, 9, 3), far = put(g, 1, 9, 0);
  g.P(0).coins = 20;
  main(g);
  act(g, playId(big), [4]);
  eq(g.P(0).hand.length, 2, 'Вульф Ва дороже 3 — карты нет');
  act(g, playId(m1), [1]);
  eq(g.P(0).hand.length, 2, '+1 карта');
  act(g, playId(m2), [0]);
  eq(g.P(0).hand.length, 1, 'второй раз за фазу — нет');
  ans(g, `ab:${t.uid}:0`);
  ok(!g.pending.options.some((o) => o.id === far.uid), 'далёкий не цель');
  ans(g, near.uid); main(g);
  ok(g.stunned(near));
  ok(!g.pending.options.some((o) => o.id === `ab:${t.uid}:0`), 'раз в фазу');
});

test('Разносчики пламени: боевые раны Лидеру → 1 рана каждому Лидеру', () => {
  const g = makeGame({ p0: S(), p1: S() });
  put(g, 0, 377, 0);
  main(g); endTurn(g);
  runUntil(g, (q) => q.type === 'draw' && g.s.round === 2, NO);
  eq(g.leader(1).hpNow, 28 - 2 - 1); eq(g.leader(0).hpNow, 27);
});

test('Рубака преисподней: 3 раны своему Лидеру, уничтожает вражеского Союзника ≤3 (Оберег мешает)', () => {
  const g = makeGame({ p0: S(), p1: S() });
  const vik = put(g, 1, 30, 0), bear = put(g, 1, 28, 1), cheap = put(g, 1, 10, 2);
  const c = addHand(g, 0, 378);
  main(g);
  act(g, playId(c), [4]);
  eq(g.leader(0).hpNow, 25);
  ok(!g.onField(cheap), 'Бойцы (2) уничтожены');
  ok(g.onField(vik) && g.onField(bear));
});

done();
