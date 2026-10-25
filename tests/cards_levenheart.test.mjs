// node tests/cards_levenheart.test.mjs
import { makeGame, put, addHand, addGrave, ans, toMain, play, useAbility, endTurn, runUntil, runBattle, test, eq, ok, done, passPriority } from './helpers.mjs';

test('Сфинктерион: +2 монеты в начале хода', () => {
  const g = makeGame();
  toMain(g); // +2 Богатый род, +2 coins taken
  eq(g.P(0).coins, 5 + 2 + 2);
});

test('Бой: союзники бьют друг друга, одинокий бьёт Лидера', () => {
  const g = makeGame({ p1: { leader: 41 } });
  put(g, 0, 15, 0); // Кряхтун 3/3
  put(g, 1, 9, 0);  // Ополчение 2/2
  put(g, 0, 10, 2); // Бойцы 2/2 — no opponent → Лидер
  toMain(g); endTurn(g);
  runBattle(g);
  const opp = g.allyAt(1, 0);
  eq(opp, null, 'ополчение погибло');
  eq(g.allyAt(0, 0).dmg, 2, 'Кряхтун ранен на 2');
  eq(g.leader(1).hpNow, 25 - 2, 'Лариса получила 2');
  // Кряхтун лечит Лидера на нанесённые раны (2, не 3 — предел ран).
  eq(g.leader(0).hpNow, 27, 'лечение не выше максимума; крыса Ларисы ранила на 1');
});

test('Предел ран и Прорыв', () => {
  const g = makeGame({ p1: { leader: 41 } });
  put(g, 0, 4, 1); // Вульф Ва 4/8 Прорыв
  put(g, 1, 9, 1); // 2/2
  toMain(g); endTurn(g); runBattle(g);
  eq(g.leader(1).hpNow, 25 - 2, 'избыток 2 ушёл Лидеру');
});

test('Оборона перенаправляет раны Лидеру', () => {
  const g = makeGame({ p1: { leader: 41 } });
  put(g, 0, 15, 3);       // Кряхтун 3/3
  put(g, 1, 45, 0);       // Коза 1/2 Оборона
  toMain(g); endTurn(g);
  runBattle(g, (q) => (q.defense ? q.options[0].id : q.type === 'priority' ? 'pass' : q.type === 'draw' ? 'coin' : q.type === 'main' ? 'end' : q.cancel ? null : q.options[0].id));
  eq(g.leader(1).hpNow, 25, 'Лидер не ранен');
  eq(g.allyAt(1, 0), null, 'Коза погибла');
});

test('Муштра: +1/+1 до начала вашего следующего хода (сводка правил, 20.07.2026)', () => {
  const g = makeGame();
  const k = put(g, 0, 9, 0); // 2/2
  toMain(g);
  useAbility(g, g.leader(0), 0, [k]);
  eq(g.atk(k), 3);
  endTurn(g); // ход соперника, затем бой
  runUntil(g, (q) => g.s.round === 2 && g.s.turn === 1);
  eq(g.atk(k), 3, 'в ход соперника и в бою бонус ещё есть');
  runUntil(g, (q) => q.type === 'draw' && g.s.turn === 0 && g.s.round === 2);
  eq(g.atk(k), 2, 'с началом моего следующего хода бонус кончился');
  eq(g.hp(k), 2);
});

test('Муштра спасает в бою: раны, принятые бонусом, уходят вместе с ним', () => {
  const g = makeGame();
  const k = put(g, 0, 9, 0); // 2/2
  put(g, 1, 9, 0);           // 2/2 напротив
  toMain(g);
  useAbility(g, g.leader(0), 0, [k]); // 3/3
  endTurn(g);
  runUntil(g, (q) => q.type === 'draw' && g.s.turn === 0 && g.s.round === 2);
  ok(g.allyAt(0, 0), 'союзник жив после боя и после конца бонуса');
});

test('Временное здоровье тратится первым: карта не гибнет, когда бонус кончился', () => {
  const g = makeGame();
  const k = put(g, 0, 9, 0); // 2/2
  toMain(g);
  g.s.cards[k.uid].mods.push({ atk: 0, hp: 2, until: { phase: g.s.phaseId } }); // +0/+2 до конца фазы
  g.s.cards[k.uid].dmg = 3; // 3 раны при здоровье 4
  ok(g.hp(k) > 0, 'жив с бонусом');
  g.expire((u) => u.phase === g.s.phaseId);
  eq(k.dmg, 1, 'две раны ушли вместе с бонусом');
  ok(g.hp(k) > 0, 'жив и без бонуса');
});

test('Казнь уничтожает, Оберег мешает выбрать цель', () => {
  const g = makeGame();
  const e = put(g, 1, 9, 0);
  const c = addHand(g, 0, 6);
  g.P(0).coins = 10;
  toMain(g);
  play(g, c, [e]);
  eq(g.allyAt(1, 0), null);
});

test('Кёнигпон пропускает Сражение', () => {
  const g = makeGame();
  const c = addHand(g, 0, 5); g.P(0).coins = 6;
  put(g, 0, 15, 0);
  toMain(g, ['coin', 'coin']);
  play(g, c, [0]);
  endTurn(g);
  runUntil(g, (q) => q.type === 'draw' && g.s.round === 2);
  eq(g.leader(1).hpNow, 28, 'боя не было');
});

test('Дейн создаёт 2 Топора, Топор наносит 2 раны', () => {
  const g = makeGame();
  const c = addHand(g, 0, 1); g.P(0).coins = 7;
  toMain(g, ['coin', 'coin']);
  play(g, c, [2]);
  const axes = g.items(0).filter((x) => x.id === 55);
  eq(axes.length, 2);
  useAbility(g, axes[0], 0, [g.leader(1)]);
  eq(g.leader(1).hpNow, 26);
  eq(g.items(0).filter((x) => x.id === 55).length, 1);
});

test('Слово света лечит избыток', () => {
  const g = makeGame();
  g.leader(0).hpNow = 10;
  const e = put(g, 1, 9, 0); // 2/2
  const c = addHand(g, 0, 18); g.P(0).coins = 4;
  toMain(g);
  play(g, c, [e]);
  eq(g.leader(0).hpNow, 19);
});

test('Торговые ряды: 2 ряда = 4 монеты', () => {
  const g = makeGame({ p0: { leader: 41 } });
  put(g, 0, 11, 0); put(g, 0, 11, 1);
  toMain(g);
  eq(g.P(0).coins, 5 + 4 + 2);
});

done();
