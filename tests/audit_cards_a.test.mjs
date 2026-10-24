// node tests/audit_cards_a.test.mjs — независимый аудит карт 1–44, 368–378 и токенов.
import { makeGame, put, addHand, ans, toMain, useAbility, runUntil, defaultAnswer, passPriority, test, eq, ok, done } from './helpers.mjs';

const isYesNo = (q) => q.type === 'pick' && q.options.length === 2 && q.options[0].label === 'Да';
const NO = (q) => (isYesNo(q) ? 0 : defaultAnswer(q));
const main = (g, fn = NO) => runUntil(g, (q) => q.type === 'main', fn);
const playId = (c, side = c.id) => `play:${c.uid}:${side}`;
/** Run a generator that must not ask anything. */
function drain(it) { for (let r = it.next(); !r.done; r = it.next()) throw new Error('unexpected request'); }

// 1. Дейн: на карте «наносятся раны» (без числа); ответ авторов — Топор по Союзнику тоже даёт карту.
test('Дейн «Ветеран армии»: любые раны вражескому Союзнику в ваш ход — карта (Топор, 2 раны)', () => {
  const g = makeGame();
  put(g, 0, 1, 0);
  const axe = put(g, 0, 55);
  const e = put(g, 1, 9, 2); // 2/2
  toMain(g);
  const h = g.P(0).hand.length;
  useAbility(g, axe, 0, [e]);
  eq(g.allyAt(1, 2), null, 'Топор убил ополчение');
  eq(g.P(0).hand.length, h + 1, 'Дейн дал карту');
});
test('Дейн: раны вражескому Лидеру карту не дают', () => {
  const g = makeGame();
  put(g, 0, 1, 0);
  const axe = put(g, 0, 55);
  toMain(g);
  const h = g.P(0).hand.length;
  useAbility(g, axe, 0, [g.leader(1)]);
  eq(g.P(0).hand.length, h);
});

// 2. Альбо, облик крысы: «во время хода противника» — Сражение не ход противника (раунд = ход, ход, Сражение).
test('Альбо, облик крысы: в Сражении Действия не получают Опережение', () => {
  const g = makeGame({ p0: { leader: 41 }, p1: { leader: 41 } });
  put(g, 0, 58, 0);
  put(g, 0, 12, 1); // Манёвр — чтобы в Сражении был запрос
  const sp = addHand(g, 0, 35);
  const q = runUntil(g, (x) => g.s.phase === 'battle', NO);
  ok(q, 'дошли до Сражения');
  eq(g.canPlay(0, sp, 35, { main: false }), false, 'в Сражении без Опережения');
});
test('Альбо, облик крысы: в ход противника Опережение есть', () => {
  const g = makeGame({ p0: { leader: 41 }, p1: { leader: 41 } });
  put(g, 0, 58, 0);
  const sp = addHand(g, 0, 35);
  runUntil(g, () => g.s.turn === 1 && g.s.phase === 'turn' && g.pending.type === 'main', NO);
  eq(g.canPlay(0, sp, 35, { main: false }), true);
});

// 3. Лодка Януса: на карте напечатан Манёвр.
test('Лодка Януса: Манёвр — в начале Сражения можно переместить в свободный регион Мест', () => {
  const g = makeGame();
  const b = put(g, 0, 19, 0);
  put(g, 0, 11, 1);
  const q = runUntil(g, (x) => x.type === 'region' && x.row === 'place' && g.s.phase === 'battle', NO);
  ok(q, 'спросили про Манёвр Лодки');
  ok(!q.options.some((o) => o.id === 0 || o.id === 1), 'только свободные регионы');
  ans(g, 3);
  eq(g.placeAt(0, 3), b); eq(g.placeAt(0, 0), null); eq(b.region, 3);
});

// 4. Адская гончая: «первый раз за фазу» — считаются и сбросы до появления гончей.
test('Адская гончая: сброс раньше в этой фазе — Животная ярость не срабатывает', () => {
  const g = makeGame({ p0: { leader: 41 }, p1: { leader: 41 } });
  const a = addHand(g, 0, 9), b = addHand(g, 0, 9), m = addHand(g, 0, 23);
  main(g);
  drain(g.discard(0, a));
  const h = put(g, 0, 370, 0);
  ans(g, playId(m)); main(g); // обновить список действий
  useAbility(g, h, 0, [[b.uid]]);
  ok(g.has(h, 'breakthrough'));
  eq(g.atk(h), 2, '1 + Марш-бросок; это второй сброс за фазу — без +1');
});

// 5. Исполнение желания: карту с Альтернативой можно использовать любой стороной.
test('Исполнение желания: Лос Ускаманос из Скрижали обратной стороной (Джей Зи)', () => {
  const g = makeGame({ p0: { deck: [...Array(10).fill(9), 12] } });
  const w = addHand(g, 0, 25);
  toMain(g); // 9 монет
  const los = g.P(0).deck.find((c) => c.id === 12);
  ans(g, playId(w)); passPriority(g);
  ans(g, [los.uid]);
  const q = g.pending;
  ok(q.type === 'pick' && q.options.some((o) => o.id === 60), 'выбор стороны');
  ans(g, 60);
  ans(g, 1); // регион
  main(g);
  eq(g.allyAt(0, 1)?.id, 60);
  eq(g.P(0).coins, 9 - 3 - 6);
});

done();
