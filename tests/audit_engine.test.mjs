// Independent rules audit of the engine (game.js) against the official rules:
// inputs/правила_официальные.txt, inputs/правила_сводка.md, inputs/вопросы_ответы_сайт.txt, inputs/ответы_по_картам.csv.
// Every test asserts the OFFICIAL behaviour. A failing test = a deviation of the engine.
// Run: node tests/audit_engine.test.mjs  (from the game folder)
import { Game } from '../js/engine/game.js';
import { makeGame, put, addHand, ans, toMain, play, endTurn, runUntil, runBattle, test, eq, ok, done, passPriority, defaultAnswer } from './helpers.mjs';

// Run an engine generator that must not ask anything (direct calls in tests).
function drive(gen) {
  const r = gen.next();
  if (!r.done) throw new Error('unexpected request: ' + JSON.stringify(r.value?.prompt));
  return r.value;
}
const perm = (c, kw) => c.kws.push({ kw, until: null });
const modAtk = (c, n) => c.mods.push({ atk: n, hp: 0, until: null });
const attacked = (g, c) => g.events.some((e) => e.type === 'attack' && e.src === c.uid);
// Answer policy: custom hook first, default otherwise.
const pol = (hook) => (q) => { const r = hook(q); return r === undefined ? defaultAnswer(q) : r; };

// ---------------- setup ----------------
test('Подготовка: оба выбирают стартовую руку одновременно, история повторяется', () => {
  const deck = Array(40).fill(9);
  const cfg = { seed: 5, players: [{ leader: 117, deck }, { leader: 117, deck }], options: { first: 0 } };
  const g = new Game(cfg);
  eq(g.pending.player, 0);
  const pq = g.preQuestion(1); ok(pq, 'второй игрок уже может выбирать'); eq(pq.options.length, 10);
  ok(g.preRespond(1, pq.options.slice(5).map((o) => o.id)), 'ранний ответ принят');
  eq(g.preQuestion(1), null); eq(g.pending.player, 0);
  ans(g, g.pending.options.slice(0, 5).map((o) => o.id));
  eq(g.s.phase === 'setup', false, 'после первого ответа партия идёт дальше сама');
  eq(g.P(1).hand.length, 5);
  const r = new Game(cfg);
  for (const a of g.history) ok(r.respond(r.pending.player, a));
  eq(r.P(1).hand.map((c) => c.uid).join(), g.P(1).hand.map((c) => c.uid).join());
});
test('Подготовка: первый берёт 12, второй 10, оставляют 5; у каждого 5 монет', () => {
  const deck = Array(40).fill(9);
  const g = new Game({ seed: 3, players: [{ leader: 117, deck }, { leader: 117, deck }], options: { first: 0 } }); // Эрик: нет дохода в начале хода
  eq(g.pending.type, 'mulligan'); eq(g.pending.player, 0); eq(g.pending.options.length, 12); eq(g.pending.keep, 5);
  ans(g, g.pending.options.slice(0, 5).map((o) => o.id));
  eq(g.pending.type, 'mulligan'); eq(g.pending.player, 1); eq(g.pending.options.length, 10); eq(g.pending.keep, 5);
  ans(g, g.pending.options.slice(0, 5).map((o) => o.id));
  eq(g.P(0).hand.length, 5); eq(g.P(1).hand.length, 5);
  eq(g.P(0).deck.length, 35); eq(g.P(1).deck.length, 35);
  eq(g.P(0).coins, 5); eq(g.P(1).coins, 5);
});

test('Муллиган: каждый раз на 2 карты меньше; меньше 5 — оставить всё; бонус +1 монета за недостающую', () => {
  const deck = Array(40).fill(9);
  const g = new Game({ seed: 3, players: [{ leader: 20, deck }, { leader: 20, deck }], options: { first: 0, mulliganBonus: true } });
  for (const n of [12, 10, 8, 6]) { eq(g.pending.options.length, n, 'размер руки'); ok(g.pending.canMull); ans(g, 'mulligan'); }
  eq(g.pending.options.length, 4); eq(g.pending.keep, 4, 'взято меньше 5 — оставляешь всё');
  ans(g, g.pending.options.map((o) => o.id));
  eq(g.P(0).hand.length, 4); eq(g.P(0).deck.length, 36);
  eq(g.P(0).coins, 6, '5 + 1 за недостающую карту');
});

// ---------------- round / turn ----------------
test('Очерёдность меняется каждый раунд, и когда Сражение пропущено', () => {
  const g = makeGame();
  const c = addHand(g, 0, 5); g.P(0).coins = 6; // Кёнигпон: пропустить следующее Сражение
  toMain(g); play(g, c, [0]); endTurn(g);
  runUntil(g, (q) => q.type === 'draw' && g.s.round === 2);
  ok(g.events.some((e) => e.type === 'battleSkipped'), 'бой пропущен');
  eq(g.s.first, 1, 'после пропущенного боя первым ходит второй'); eq(g.s.turn, 1);
  runUntil(g, (q) => q.type === 'draw' && g.s.round === 3);
  eq(g.s.first, 0); eq(g.s.turn, 0);
});

test('Ход: «в начале хода» до взятия 2; лимит руки 10 в конце хода', () => {
  const g = makeGame();
  for (let k = 0; k < 11; k++) addHand(g, 0, 9);
  ans(g, 'go'); passPriority(g);
  eq(g.pending.type, 'draw'); eq(g.P(0).coins, 7, 'Богатый род (+2) сработал до взятия');
  ans(g, 'card'); ans(g, 'card'); passPriority(g);
  eq(g.P(0).hand.length, 13);
  ans(g, 'end'); passPriority(g);
  eq(g.pending.type, 'multi'); eq(g.pending.min, 3);
  ans(g, g.pending.options.slice(0, 3).map((o) => o.id));
  eq(g.P(0).hand.length, 10); eq(g.P(0).grave.length, 3);
});

test('Доход Места — только со следующего своего хода', () => {
  const g = makeGame({ p0: { leader: 117 } }); // Эрик: без собственного дохода
  const row = addHand(g, 0, 11); // Торговый ряд, 2
  toMain(g); eq(g.P(0).coins, 7);
  play(g, row, [0]); eq(g.P(0).coins, 5);
  endTurn(g);
  runUntil(g, (q) => q.type === 'draw' && g.s.turn === 1);
  eq(g.P(0).coins, 5, 'в ход противника дохода нет');
  runUntil(g, (q) => q.type === 'draw' && g.s.turn === 0 && g.s.round === 2);
  eq(g.P(0).coins, 6, 'в начале следующего своего хода +1');
});

// ---------------- battle order ----------------
test('Сражение идёт с крайнего левого региона первого игрока (первый = P1 → 4..0)', () => {
  const g = makeGame({ first: 1 });
  runUntil(g, (q) => q.type === "draw" && g.s.round === 2);
  const order = g.events.filter((e) => e.type === 'regionStart').map((e) => e.region);
  eq(JSON.stringify(order), JSON.stringify([4, 3, 2, 1, 0]));
});

test('Манёвры: сначала первый игрок, потом второй', () => {
  const g = makeGame({ first: 1 });
  put(g, 0, 48, 0); put(g, 1, 48, 0); // Кошки с Манёвром
  const who = [];
  runUntil(g, (q) => q.type === "draw" && g.s.round === 2, pol((q) => { if (q.maneuver) { who.push(q.player); return null; } }));
  eq(who[0], 1, 'первым манёвры делает первый игрок'); eq(who[1], 0);
});

// ---------------- strikes ----------------
test('Раны наносятся одновременно (оба 2/2 погибают)', () => {
  const g = makeGame();
  put(g, 0, 106, 2); put(g, 1, 106, 2);
  toMain(g); endTurn(g); runBattle(g);
  eq(g.allyAt(0, 2), null); eq(g.allyAt(1, 2), null);
});

test('Преимущество: убил — ответа нет; не убил — ответ есть', () => {
  const g = makeGame();
  const z = put(g, 0, 106, 0); perm(z, 'advantage'); put(g, 1, 46, 0); // 2/2 adv vs 1/1
  const z2 = put(g, 0, 106, 1); perm(z2, 'advantage'); put(g, 1, 161, 1); // 2/2 adv vs 5/5
  toMain(g); endTurn(g); runBattle(g);
  eq(g.allyAt(1, 0), null); eq(z.dmg, 0, 'без ответных ран');
  eq(g.allyAt(0, 1), null, 'выживший бьёт в ответ');
});

test('Предел ран: карта не получает ран больше здоровья', () => {
  const g = makeGame();
  const m = put(g, 0, 161, 0); const r = put(g, 1, 46, 0); // 5/5 vs 1/1
  toMain(g); endTurn(g); runBattle(g);
  const ev = g.events.find((e) => e.type === 'damage' && e.src === m.uid && e.tgt === r.uid);
  eq(ev.amount, 1);
});

test('Прорыв: избыток Напарнику; Напарник погиб — остаток Лидеру НЕ переносится', () => {
  const g = makeGame();
  put(g, 0, 4, 0); put(g, 1, 46, 0); // Вульф Ва 4 Прорыв vs Крыса 1/1 → избыток 3
  const comp = put(g, 1, 16, null); comp.dmg = 5; // Бульбух, осталось 1 здоровья
  toMain(g); endTurn(g);
  runBattle(g, pol((q) => (q.prompt?.includes('Лидера или Напарника') ? comp.uid : undefined)));
  ok(!g.onField(comp), 'Напарник погиб');
  eq(g.leader(1).hpNow, 28, 'Лидер не ранен');
});

test('Прорыв + Оборона: избыток после Защитника всё равно идёт Лидеру', () => {
  const g = makeGame();
  put(g, 0, 4, 0); put(g, 1, 46, 0); // избыток 3
  const goat = put(g, 1, 45, 3); // Коза 1/2 Оборона
  toMain(g); endTurn(g);
  runBattle(g, pol((q) => (q.defense ? goat.uid : undefined)));
  ok(!g.onField(goat)); eq(g.leader(1).hpNow, 27);
});

test('Прорыв + несколько Оборон подряд (17.5.2)', () => {
  const g = makeGame();
  put(g, 0, 4, 0); put(g, 1, 46, 0); // избыток 3
  const g1 = put(g, 1, 45, 3), g2 = put(g, 1, 45, 4);
  toMain(g); endTurn(g);
  runBattle(g, pol((q) => (q.defense ? q.options[0].id : undefined)));
  ok(!g.onField(g1)); eq(g2.dmg, 1); eq(g.leader(1).hpNow, 28);
});

test('Оборона без Прорыва: избыток Лидеру не наносится', () => {
  const g = makeGame();
  put(g, 0, 161, 0); // Мама-ёлка 5/5, напротив пусто
  const goat = put(g, 1, 45, 3);
  toMain(g); endTurn(g);
  runBattle(g, pol((q) => (q.defense ? goat.uid : undefined)));
  ok(!g.onField(goat)); eq(g.leader(1).hpNow, 28);
});

test('Карта с Прорывом бьёт Лидера напрямую, раны перенесены Обороной — избыток всё равно Лидеру (глоссарий 17.5.1)', () => {
  const g = makeGame();
  put(g, 0, 4, 0); // Вульф Ва 4/8 Прорыв, напротив пусто
  const goat = put(g, 1, 45, 3); // Коза 1/2 Оборона
  toMain(g); endTurn(g);
  runBattle(g, pol((q) => (q.defense ? goat.uid : undefined)));
  ok(!g.onField(goat), 'Коза погибла');
  eq(g.leader(1).hpNow, 26, '4 раны: 2 Козе, 2 избыточные Лидеру');
});

test('Смертельный удар + Прорыв: 1 рана союзнику (он уничтожен), остальное Лидеру', () => {
  const g = makeGame();
  const k = put(g, 0, 29, 0); perm(k, 'breakthrough'); // Которный 2/2
  const sw = put(g, 1, 92, 0); // Кузнец Свон 1/5
  toMain(g); endTurn(g); runBattle(g);
  ok(!g.onField(sw)); eq(g.leader(1).hpNow, 27);
  const ev = g.events.find((e) => e.type === 'damage' && e.src === k.uid && e.tgt === sw.uid);
  eq(ev.amount, 1);
});

test('Смертельный удар через Оборону уничтожает Защитника (Q&A «Которный»)', () => {
  const g = makeGame();
  put(g, 0, 136, 0); // Охотник за головами 1/1
  const cook = put(g, 1, 135, 2); // Повар 1/4 Оборона
  toMain(g); endTurn(g);
  runBattle(g, pol((q) => (q.defense ? cook.uid : undefined)));
  ok(!g.onField(cook)); eq(g.leader(1).hpNow, 28);
});

// ---------------- keywords ----------------
test('Нерушимость: «Уничтожьте» не действует, но от потери здоровья погибает', () => {
  const g = makeGame();
  const sw = put(g, 1, 92, 0); perm(sw, 'indestructible');
  const kz = addHand(g, 0, 6);
  toMain(g); play(g, kz, [sw]);
  ok(g.onField(sw), 'Казнь не уничтожила');
  drive(g.damage(null, sw, 5));
  ok(!g.onField(sw), 'погиб от ран');
});

test('Оберег: нельзя выбрать целью, но союзники его бьют', () => {
  const g = makeGame();
  const v = put(g, 1, 30, 0); // Виктор 1/2 Оберег
  addHand(g, 0, 6); // Казнь
  put(g, 0, 161, 0);
  toMain(g);
  ok(!g.pending.options.some((o) => o.kind === 'play'), 'Казнь нельзя сыграть — единственная цель с Оберегом');
  endTurn(g); runBattle(g);
  ok(!g.onField(v));
});

test('Легенда: вторую с тем же именем сыграть нельзя; у противника — можно', () => {
  const g = makeGame();
  put(g, 0, 15, 0); put(g, 1, 15, 1);
  const c2 = addHand(g, 0, 15);
  toMain(g);
  ok(!g.pending.options.some((o) => o.id === `play:${c2.uid}:15`));
  const g2 = makeGame(); put(g2, 1, 15, 1); const c3 = addHand(g2, 0, 15); toMain(g2);
  ok(g2.pending.options.some((o) => o.id === `play:${c3.uid}:15`));
});

test('Созданная карта, покидая поле, убирается из игры', () => {
  const g = makeGame();
  ans(g, 'go');
  const goat = drive(g.create(0, 45, 2));
  drive(g.damage(null, goat, 5));
  eq(goat.zone, 'exile'); ok(!g.P(0).grave.includes(goat));
  const goat2 = drive(g.create(0, 45, 3));
  drive(g.toHand(goat2));
  eq(goat2.zone, 'exile'); ok(!g.P(0).hand.includes(goat2));
});

test('Смена зоны снимает раны, фишки, усиления, оглушение', () => {
  const g = makeGame();
  ans(g, 'go');
  const sw = put(g, 0, 92, 0); sw.dmg = 2; sw.tok.blood = 1; sw.mods.push({ atk: 1, hp: 1, until: null }); perm(sw, 'ward'); g.stun(sw);
  drive(g.toHand(sw));
  eq(sw.dmg, 0); eq(Object.keys(sw.tok).length, 0); eq(sw.mods.length, 0); eq(sw.kws.length, 0); eq(sw.stunUntil, -1);
});

test('Разговор с…: −1 за каждую вашу карту типа, карта с двумя типами считается 1 раз', () => {
  const g = makeGame();
  const kz = addHand(g, 0, 6); // Казнь 6, «за каждую вашу карту Воина»
  put(g, 0, 9, 0); // ЧЕЛОВЕК/ВОИН
  put(g, 0, 16, null); // Бульбух ДВАРФ/ВОИН (Напарник)
  put(g, 1, 9, 0); // вражеский Воин не считается
  // + Лидер Сфинктерион (ВОИН) — тоже «ваша карта Воина»
  eq(g.costOf(0, kz), 3);
});

// ---------------- stack ----------------
test('Стопка: ответ разрешается раньше', () => {
  const g = makeGame();
  const e = put(g, 1, 92, 0);
  const kz = addHand(g, 0, 6), ds = addHand(g, 1, 21);
  toMain(g);
  ans(g, `play:${kz.uid}:6`); ans(g, e.uid);
  eq(g.pending.type, 'priority'); eq(g.pending.player, 1);
  ans(g, `play:${ds.uid}:21`); ans(g, e.uid);
  passPriority(g);
  const res = g.events.filter((x) => x.type === 'resolve').map((x) => x.uid);
  eq(JSON.stringify(res), JSON.stringify([ds.uid, kz.uid]));
  ok(!g.onField(e));
});

test('Нелегальное действие: цель пропала — карта на кладбище, монеты не возвращаются', () => {
  const g = makeGame();
  const e = put(g, 1, 92, 0);
  const kz = addHand(g, 0, 6);
  toMain(g); eq(g.P(0).coins, 9);
  ans(g, `play:${kz.uid}:6`); ans(g, e.uid);
  eq(g.pending.type, 'priority');
  drive(g.toHand(e)); // цель ушла с поля до разрешения
  passPriority(g);
  ok(g.events.some((x) => x.type === 'fizzle'));
  ok(g.P(0).grave.includes(kz)); eq(g.P(0).coins, 4);
});

test('Оберег, полученный до разрешения, отменяет свойство', () => {
  const g = makeGame();
  const e = put(g, 1, 92, 0);
  const kz = addHand(g, 0, 6);
  toMain(g);
  ans(g, `play:${kz.uid}:6`); ans(g, e.uid);
  perm(e, 'ward');
  passPriority(g);
  ok(g.onField(e)); ok(g.P(0).grave.includes(kz));
});

// ---------------- Eric ----------------
test('Эрик: одна карта «как с Опережением» за фазу вне своего хода', () => {
  const g = makeGame({ p1: { leader: 117 } });
  const a = addHand(g, 1, 92), b = addHand(g, 1, 104);
  g.P(1).coins = 10;
  ans(g, 'go');
  eq(g.pending.type, 'priority'); eq(g.pending.player, 1);
  ok(g.pending.options.some((o) => o.id === `play:${b.uid}:104`));
  ans(g, `play:${a.uid}:92`); ans(g, 0); passPriority(g);
  ok(g.onField(a));
  eq(g.pending.type, 'draw', 'вторую карту в этой фазе Эрик сыграть не может'); eq(g.pending.player, 0);
  const q = runUntil(g, (q) => q.type === 'priority' && q.player === 1 && g.s.inBattle);
  ok(q.options.some((o) => o.id === `play:${b.uid}:104`), 'в новой фазе снова можно');
});

// ---------------- stun ----------------
function stunSetup() {
  const g = makeGame({ p1: { leader: 117 } }); // P0 первый; P1 = Эрик
  const A = put(g, 0, 106, 0); // Зомби 2/2, напротив пусто → бьёт Лидера Эрика
  const K = addHand(g, 1, 98); // Кудрегар: при появлении оглушает союзников в этом и соседних регионах
  return { g, A, K };
}
test('Оглушение ДО нанесения ран: не бьёт в этом Сражении, бьёт в следующем (18.2)', () => {
  const { g, A, K } = stunSetup();
  let played = false;
  const fn = pol((q) => {
    if (!played && q.type === 'priority' && q.player === 1 && g.s.inBattle && g.s.battleRegion === 0 && !attacked(g, A)) { played = true; return `play:${K.uid}:98`; }
    if (q.type === 'region' && q.uid === K.uid) return 1;
  });
  runUntil(g, (q) => q.type === 'draw' && g.s.round === 2, fn);
  ok(played && g.onField(K)); eq(g.leader(1).hpNow, 24, 'в 1-м бою не ударил');
  runUntil(g, (q) => q.type === 'draw' && g.s.round === 3, fn);
  eq(g.leader(1).hpNow, 22, 'во 2-м бою ударил');
});
test('Оглушение ПОСЛЕ нанесения ран: не бьёт в следующем Сражении (18.3)', () => {
  const { g, A, K } = stunSetup();
  let played = false;
  const fn = pol((q) => {
    if (!played && q.type === 'priority' && q.player === 1 && g.s.inBattle && g.s.battleRegion === 0 && attacked(g, A)) { played = true; return `play:${K.uid}:98`; }
    if (q.type === 'region' && q.uid === K.uid) return 1;
  });
  runUntil(g, (q) => q.type === 'draw' && g.s.round === 2, fn);
  ok(played && g.onField(K), 'Кудрегар сыгран в конце боя в регионе 0'); eq(g.leader(1).hpNow, 22, 'в 1-м бою ударил');
  runUntil(g, (q) => q.type === 'draw' && g.s.round === 3, fn);
  eq(g.leader(1).hpNow, 22, 'во 2-м бою оглушён и не бьёт');
});
test('Оглушение сохраняется, если Сражение пропущено', () => {
  const g = makeGame();
  const A = put(g, 0, 106, 0);
  g.stun(A); g.s.skipBattles = 1;
  runUntil(g, (q) => q.type === 'draw' && g.s.round === 3);
  eq(g.leader(1).hpNow, 28, 'бой 1 пропущен, в бою 2 оглушён');
  runUntil(g, (q) => q.type === 'draw' && g.s.round === 4);
  eq(g.leader(1).hpNow, 26);
});

// ---------------- healing & end ----------------
test('Исцеление: не больше ран; Лидер — не выше максимума; Гуди — выше, пока на поле', () => {
  const g = makeGame();
  ans(g, 'go');
  const sw = put(g, 0, 92, 0); sw.dmg = 2;
  eq(drive(g.heal(sw, 5)), 2); eq(sw.dmg, 0);
  const L = g.leader(0); L.hpNow = 25;
  drive(g.heal(L, 10)); eq(L.hpNow, 28);
  const gudi = put(g, 0, 156, null);
  drive(g.heal(L, 5)); eq(L.hpNow, 33);
  drive(g.toGrave(gudi));
  eq(L.hpNow, 33, 'текущее здоровье остаётся');
  drive(g.heal(L, 2)); eq(L.hpNow, 33, 'выше максимума уже не лечится');
});

test('Конец игры: оба Лидера на 0 одновременно — ничья', () => {
  const g = makeGame();
  const a = put(g, 0, 9, 2), b = put(g, 1, 9, 2); modAtk(a, 3); modAtk(b, 3); // 5 Прорыв vs 2 здоровья → избыток 3
  g.leader(0).hpNow = 3; g.leader(1).hpNow = 3;
  runUntil(g, () => g.s.over);
  ok(g.s.over); eq(g.s.winner, 'draw');
});

done();
