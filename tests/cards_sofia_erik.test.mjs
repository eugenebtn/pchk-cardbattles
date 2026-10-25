// node tests/cards_sofia_erik.test.mjs — Скрижали Эрика Пэнисова и Софии (117–175).
import { makeGame, put, addHand, addGrave, ans, toMain, endTurn, runUntil, runBattle, defaultAnswer, test, eq, ok, done, passPriority } from './helpers.mjs';

const ERIK = 117, SOFIA = 118;
// Answer a list of prompts, passing any priority window that the next answer is not meant for.
function feed(g, answers) {
  for (const a0 of answers) {
    const a = a0?.uid ?? a0;
    while (g.pending?.type === 'priority' && !g.pending.options.some((o) => o.id === a)) ans(g, 'pass');
    ans(g, a);
  }
  passPriority(g);
}
function play(g, inst, answers = [], side = inst.id) { ans(g, `play:${inst.uid}:${side}`); feed(g, answers); }
function useAbility(g, inst, k = 0, answers = []) { ans(g, `ab:${inst.uid}:${k}`); feed(g, answers); }
// Run an engine generator that must not ask anything.
function runGen(gen) { let r; do { r = gen.next(); if (!r.done && r.value) throw new Error('unexpected prompt ' + r.value.prompt); } while (!r.done); return r.value; }
const has = (q, s) => q.prompt && q.prompt.includes(s);
// Put cards on top of a deck (first = top).
function stackDeck(g, p, ids) { const cs = ids.map((id) => g.newInst(id, p, 'deck')); g.P(p).deck.unshift(...cs); return cs; }
// From P0's main: end the turn and get to P1's main.
function toP1Main(g) { endTurn(g); toMain(g); }

// ---------- Лидеры ----------
test('Эрик: Невероятная жестокость — союзник, ранивший Лидера, получает +1/+0', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  const a = put(g, 0, 9, 0);
  toMain(g); endTurn(g); runBattle(g);
  eq(g.leader(1).hpNow, 26);
  eq(g.atk(a), 3);
});

test('Эрик: карта вне своего хода + Володимир скидка + Отряд зачистки + Пиф-Паф снабжение', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  const squad = put(g, 0, 168, 0); put(g, 0, 121, 1); put(g, 0, 139, 2);
  const wreck = put(g, 0, 162, 0);
  const theft = addHand(g, 0, 142); const extra = addHand(g, 0, 145);
  toMain(g);
  eq(g.costOf(0, theft), 2, 'в свой ход скидки Володимира нет');
  eq(g.tokens(wreck, 'goods'), 2);
  const coins = g.P(0).coins;
  ans(g, 'end');
  runUntil(g, (q) => q.type === 'priority' && q.player === 0 && g.s.turn === 1);
  ok(g.pending.options.some((o) => o.id === `play:${extra.uid}:145`), 'Эрик может сыграть карту без Опережения');
  ans(g, `play:${theft.uid}:142`);
  feed(g, [wreck, wreck]);
  eq(g.P(0).coins, coins - 1, 'стоимость 2 - 1 (Володимир)');
  eq(g.atk(squad), 3); eq(g.maxHp(squad), 3);
  eq(g.tokens(wreck, 'goods'), 4, 'Пиф-Паф: Снабжение дважды');
  ok(g.items(0).some((c) => c.id === 83), 'Украшение создано');
  ok(!g.fastOptions(0).some((o) => o.kind === 'play'), 'только одна карта за фазу');
});

test('Опережение в чужой ход: при «спрашивать, когда целятся» игра даёт выложить Отряд зачистки в конце хода соперника', () => {
  const g = makeGame({ p1: { leader: 117 } });
  g.cfg.options.autoPass = [true, 'smart'];
  addHand(g, 1, 168); g.P(1).coins = 5; // Отряд зачистки 3 💰, Опережение
  toMain(g);
  g.respond(0, 'end'); // P0 ends the turn
  const q = g.pending;
  ok(q && q.player === 1 && q.type === 'priority' && q.options.some((o) => o.kind === 'play'), 'P1 is asked and can play the card');
});

test('София: карта без ран / исцеление 2; Искусство друидов', () => {
  const g = makeGame({ p0: { leader: SOFIA } });
  const kick = addHand(g, 0, 134); const herbs = addHand(g, 0, 157);
  toMain(g);
  eq(g.P(0).hand.length, 3, 'взяла карту');
  eq(g.costOf(0, kick), 1);
  eq(g.costOf(0, herbs), 1, 'не меньше 1');
  put(g, 1, 9, 0); put(g, 1, 9, 1);
  eq(g.costOf(0, herbs), 2, '1 + 2 врага - 1');
  const g2 = makeGame({ p0: { leader: SOFIA } });
  g2.leader(0).hpNow = 20;
  toMain(g2);
  eq(g2.leader(0).hpNow, 22); eq(g2.P(0).hand.length, 0);
});

// ---------- Союзники ----------
test('Али: уничтожает врага в регионе с Таверной, +1 💰 за погибшего Союзника', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  put(g, 0, 160, 2);
  const e2 = put(g, 1, 9, 2); const e3 = put(g, 1, 9, 3);
  const ali = addHand(g, 0, 119); g.P(0).coins = 10;
  toMain(g);
  ans(g, `play:${ali.uid}:119`); ans(g, 0);
  while (g.pending.type === 'priority') ans(g, 'pass');
  const q = g.pending;
  eq(q.options.length, 1, 'только враг в регионе с Таверной');
  ans(g, e2.uid); passPriority(g);
  eq(g.allyAt(1, 2), null); eq(g.allyAt(1, 3), e3);
  eq(g.P(0).coins, 10 + 1 + 2 - 6 + 1, 'Кайф +1, Али -6, Семейный бизнес +1');
});

test('Женуария: +0/+2 соседу; переворот в паучиху; паутина -2/-0', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  const zh = put(g, 0, 123, 1);
  const r1 = addHand(g, 0, 138); const r2 = addHand(g, 0, 143);
  const foe = addHand(g, 1, 9);
  ans(g, 'go'); ok(has(g.pending, 'Обращение')); ans(g, 0);
  toMain(g);
  play(g, r1, [2]); play(g, r2, [4]);
  eq(g.maxHp(r1), 3); eq(g.maxHp(r2), 2);
  ans(g, 'end');
  runUntil(g, (q) => has(q, 'Обращение'));
  ans(g, 1);
  eq(zh.id, 122); eq(g.atk(zh), 5 + 1, 'паучиха 5 + бонус Эрика за удар по Лидеру');
  runUntil(g, (q) => q.type === 'main' && g.s.turn === 1 && g.s.round === 3, (q) => (has(q, 'Развращение') ? 0 : defaultAnswer(q)));
  eq(zh.id, 122);
  play(g, foe, [0]);
  eq(g.atk(foe), 0, 'Ополчение 2 - 2');
});

test('Подземный тайник: доход, товар, ножи только с Плутом', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  const t = put(g, 0, 125, 0); t.tok.goods = 3;
  const rogue = addHand(g, 0, 138);
  toMain(g);
  eq(g.P(0).coins, 5 + 1 + 2); eq(g.tokens(t, 'goods'), 4);
  ok(!g.canUseAbility(0, t, 1, { main: true }), 'без Плута нельзя');
  useAbility(g, t, 0);
  ok(g.P(0).hand.length === 2, 'взята карта');
  play(g, rogue, [0]);
  useAbility(g, t, 1);
  eq(g.leader(1).hpNow, 26);
  eq(g.tokens(t, 'goods'), 0);
});

test('Цисгендий: Нерушимость выбранному; Бег по стенам возвращает в руку', () => {
  const g = makeGame();
  const mate = put(g, 0, 9, 1);
  const c = addHand(g, 0, 127); g.P(0).coins = 10;
  toMain(g);
  play(g, c, [0, mate.uid]);
  ok(g.has(mate, 'indestructible'));
  endTurn(g); runBattle(g);
  eq(c.zone, 'hand'); eq(c.id, 127);
  eq(g.leader(1).hpNow, 28 - 4 - 2);
});

test('Игристое (Альтернатива): Бег по стенам — в руку возвращается Цисгендий', () => {
  const g = makeGame();
  const c = addHand(g, 0, 127);
  toMain(g);
  play(g, c, [0], 126);
  eq(g.allyAt(0, 0).id, 126);
  endTurn(g); runBattle(g);
  eq(c.zone, 'hand'); eq(c.id, 127);
  eq(g.sidesOf(c).join(','), '127,126');
});

test('Игристое: Ловля снаряда перенаправляет Казнь на себя', () => {
  const g = makeGame();
  const mate = put(g, 0, 9, 1);
  const ig = addHand(g, 0, 127);
  const kazn = addHand(g, 1, 6); g.P(1).coins = 10;
  toMain(g); toP1Main(g);
  ans(g, `play:${kazn.uid}:6`); ans(g, mate.uid);
  eq(g.pending.player, 0);
  ans(g, `play:${ig.uid}:126`); ans(g, 0);
  ok(has(g.pending, 'Ловля снаряда'));
  ans(g, 1); passPriority(g);
  eq(g.allyAt(0, 1), mate, 'союзник спасён');
  eq(g.allyAt(0, 0), null);
  eq(ig.zone, 'grave'); eq(ig.id, 127, 'на кладбище лицевой стороной');
});

test('Отель «Глубокий канал»: Торговцы в руку, остальные вниз', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  const top = stackDeck(g, 0, [119, 9, 135, 9]);
  const h = addHand(g, 0, 128); g.P(0).coins = 10;
  toMain(g);
  play(g, h, [0, 1, [top[0].uid, top[2].uid], [top[3].uid, top[1].uid]]);
  ok(g.P(0).hand.includes(top[0]) && g.P(0).hand.includes(top[2]));
  const d = g.P(0).deck;
  eq(d[d.length - 2], top[3]); eq(d[d.length - 1], top[1]);
  endTurn(g);
  runUntil(g, (q) => q.type === 'draw' && g.s.turn === 0);
  const before = g.P(0).coins; // доход уже начислен до взятия
  ok(before >= 12 - 7 + 3, 'Отель +3');
});

test('Добромраз: противник играет Действие — берём карту', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  const d = addHand(g, 0, 129);
  const flame = addHand(g, 1, 7);
  toMain(g);
  play(g, d, [0, 2]);
  eq(d.x.prophecy, 'action');
  toP1Main(g);
  const n = g.P(0).hand.length;
  play(g, flame, [g.leader(0), g.leader(1)]);
  eq(g.P(0).hand.length, n + 1);
});

test('Рыночная площадь: Разговор с Торговцами и доход 3', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  put(g, 0, 135, 0); put(g, 0, 130, 3);
  const m = addHand(g, 0, 130);
  toMain(g);
  eq(g.costOf(0, m), 5);
  eq(g.P(0).coins, 5 + 3 + 2);
});

test('Удача полурослика: Оберег срывает Казнь, +1/+0', () => {
  const g = makeGame();
  const mate = put(g, 0, 9, 1);
  const luck = addHand(g, 0, 131);
  const kazn = addHand(g, 1, 6); g.P(1).coins = 10;
  toMain(g); toP1Main(g);
  ans(g, `play:${kazn.uid}:6`); ans(g, mate.uid);
  ans(g, `play:${luck.uid}:131`); ans(g, mate.uid);
  passPriority(g);
  eq(g.allyAt(0, 1), mate);
  ok(g.has(mate, 'ward')); eq(g.atk(mate), 3);
  eq(kazn.zone, 'grave');
});

test('Последний миг: уничтожает всех Союзников', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  put(g, 0, 9, 0); put(g, 1, 9, 1); put(g, 1, 130, 1);
  const c = addHand(g, 0, 132); g.P(0).coins = 10;
  toMain(g); play(g, c);
  eq(g.allies().length, 0); eq(g.places().length, 1);
});

test('Драконья ярость: X ран, погибший уходит из игры; выживший — нет', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  const e = put(g, 1, 9, 0); const e2 = put(g, 1, 135, 1);
  const c1 = addHand(g, 0, 133); const c2 = addHand(g, 0, 133); g.P(0).coins = 10;
  toMain(g);
  play(g, c1, [2, e]);
  ok(g.P(1).exile.includes(e)); ok(!g.P(1).grave.includes(e));
  play(g, c2, [1, e2]);
  eq(e2.dmg, 1); ok(!e2.x.exileOnDeath);
});

test('Лягание копытом: 2 раны и оглушение', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  const e = put(g, 1, 135, 0);
  const c = addHand(g, 0, 134);
  toMain(g); play(g, c, [e]);
  eq(e.dmg, 2); ok(g.stunned(e));
});

test('Повар борделя: +1 💰 Месту в регионе и исцеление Лидера на доход', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  put(g, 0, 135, 0); put(g, 0, 130, 0);
  g.leader(0).hpNow = 15;
  toMain(g);
  eq(g.P(0).coins, 5 + 4 + 2); eq(g.leader(0).hpNow, 19);
});

test('Добродушный повар: доход Места +1; Тёплый приём +1/+1 у Таверны', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  const cook = put(g, 0, 163, 0); put(g, 0, 124, 0);
  toMain(g);
  eq(g.P(0).coins, 5 + 2 + 2);
  endTurn(g); runBattle(g);
  eq(g.atk(cook), 3, '+1/+1 Тёплый приём и +1/+0 Эрика'); eq(g.maxHp(cook), 5);
});

test('Охотник за головами: Смертельный удар', () => {
  const g = makeGame();
  put(g, 0, 136, 0); put(g, 1, 167, 0);
  toMain(g); endTurn(g); runBattle(g, (q) => (has(q, 'Зарыться') ? 0 : defaultAnswer(q)));
  eq(g.allyAt(1, 0), null);
});

test('Жанна: бесплатный Плут из руки + Скрытая атака (и для обычного розыгрыша)', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  const r = addHand(g, 0, 138); const beg = addHand(g, 0, 143);
  const j = addHand(g, 0, 137); g.P(0).coins = 10;
  toMain(g);
  play(g, j, [r.uid, 2, g.leader(1)]);
  eq(g.allyAt(0, 2), r);
  eq(g.leader(1).hpNow, 26);
  play(g, beg, [3, g.leader(1)]);
  eq(g.leader(1).hpNow, 24);
});

test('Разбойник Кёнигпона: +2/+0, если у противника больше 5 💰', () => {
  const g = makeGame();
  const r = put(g, 0, 138, 0);
  eq(g.atk(r), 2); g.P(1).coins = 6; eq(g.atk(r), 4);
});

test('Пиф-Паф: Снабжение дважды при появлении', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  const w = put(g, 0, 162, 1);
  const c = addHand(g, 0, 139);
  toMain(g); play(g, c, [0, w, w]);
  eq(g.tokens(w, 'goods'), 2 + 2);
});

test('Поглощение бездной: вражеская карта в низ Скрижали', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  const pl = put(g, 1, 130, 2);
  const c = addHand(g, 0, 140); g.P(0).coins = 10;
  toMain(g); play(g, c, [pl]);
  const d = g.P(1).deck; eq(d[d.length - 1], pl);
});

test('Портовый попрошайка забирает 1 💰 из дохода Места напротив', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  put(g, 0, 143, 0); put(g, 1, 130, 0);
  toMain(g);
  const c0 = g.P(0).coins;
  toP1Main(g);
  eq(g.P(0).coins, c0 + 1);
  eq(g.P(1).coins, 5 + 2 + 2 + 2);
});

test('Ящик с инструментами: Снабжение в начале хода, уничтожить за 1 💰', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  const box = put(g, 0, 144); const w = put(g, 0, 162, 0);
  ans(g, 'go');
  ok(has(g.pending, 'Универсальный набор'));
  ans(g, w.uid);
  toMain(g);
  eq(g.tokens(w, 'goods'), 3);
  const c = g.P(0).coins;
  useAbility(g, box, 0);
  eq(g.P(0).coins, c + 1); eq(box.zone, 'grave');
});

test('Внимательный осмотр: Снабжение дважды и карта', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  const w = put(g, 0, 162, 0);
  const c = addHand(g, 0, 145);
  toMain(g); play(g, c, [w, w]);
  eq(g.tokens(w, 'goods'), 2 + 2); eq(g.P(0).hand.length, 1);
});

test('Биктор Вуд: открытая рука; Подлый удар сбрасывает выбранную карту', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  put(g, 0, 146, 0);
  const a = addHand(g, 1, 9); const b = addHand(g, 1, 6);
  ok(!g.view(0).players[1].hand[0].hidden);
  toMain(g); endTurn(g);
  runBattle(g, (q) => (has(q, 'Подлый удар') ? b.uid : defaultAnswer(q)));
  ok(g.P(1).grave.includes(b)); ok(g.P(1).hand.includes(a));
});

test('Маска Януса: шар, Гуль, мудрость (раз за фазу)', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  const m = put(g, 0, 148);
  const e = put(g, 1, 9, 0);
  const top = stackDeck(g, 0, [167, 154, 9]);
  g.P(0).coins = 20;
  toMain(g); // 22
  useAbility(g, m, 0, [e]);
  eq(g.allyAt(1, 0), null);
  eq(g.P(0).coins, 19);
  useAbility(g, m, 1, [2]);
  const ghoul = g.allyAt(0, 2);
  eq(ghoul.id, 152); eq(g.atk(ghoul), 16); eq(g.maxHp(ghoul), 16);
  useAbility(g, m, 2, [[top[0].uid]]);
  ok(g.P(0).hand.includes(top[0]));
  ok(!g.canUseAbility(0, m, 2, { main: true }), 'один раз за фазу');
});

test('Золотой доспех: исцеление на 💰 и +1 к доходу ваших карт', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  g.leader(0).hpNow = 10;
  const w = put(g, 0, 162, 0);
  const c = addHand(g, 0, 149); g.P(0).coins = 10;
  toMain(g); // 10 + 4 + 2 = 16
  play(g, c);
  eq(g.leader(0).hpNow, 19);
  const before = g.P(0).coins;
  runGen(g.gainCoins(0, 4, w));
  eq(g.P(0).coins, before + 5);
  runGen(g.gainCoins(1, 2, g.leader(1)));
});

test('Бунт голубятни: все карты региона в руки владельцев', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  const ghoul = put(g, 0, 152, 1); ghoul.created = true;
  const pl = put(g, 0, 130, 1); const e = put(g, 1, 9, 1);
  const c = addHand(g, 0, 150);
  toMain(g); play(g, c, [1]);
  ok(g.P(0).hand.includes(pl)); ok(g.P(1).hand.includes(e));
  eq(ghoul.zone, 'exile');
});

test('Главарь банды орков: жертва дешёвого Союзника → Орк 3/3', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  const r = put(g, 0, 138, 1);
  const c = addHand(g, 0, 151);
  toMain(g); play(g, c, [0, r.uid, 1]);
  eq(r.zone, 'grave');
  const o = g.allyAt(0, 1); eq(o.id, 147); ok(o.created); ok(g.has(o, 'breakthrough'));
});

test('Кирюша: играется с кладбища; Бобровая струя', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  const k = addGrave(g, 0, 153);
  g.leader(0).hpNow = 20;
  toMain(g); play(g, k, [0]);
  eq(g.allyAt(0, 0), k);
  ans(g, 'end');
  runUntil(g, (q) => has(q, 'Бобровая'));
  ans(g, g.leader(0).uid);
  eq(g.leader(0).hpNow, 22);
});

test('Папа-ёлка создаёт Маму-ёлку 5/5', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  const c = addHand(g, 0, 154); g.P(0).coins = 10;
  toMain(g); play(g, c, [0, 1]);
  const m = g.allyAt(0, 1); eq(m.id, 161); eq(g.atk(m), 5); eq(g.maxHp(m), 5);
});

test('Походный бордель: дешевле на число Союзников, появившихся в эту фазу', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  const b = addHand(g, 0, 155);
  const a1 = addHand(g, 0, 138); const a2 = addHand(g, 0, 143);
  toMain(g);
  eq(g.costOf(0, b), 4);
  play(g, a1, [0]); play(g, a2, [1]);
  eq(g.costOf(0, b), 2);
  play(g, b, [0]);
  eq(g.P(0).coins, 7 - 1 - 2 - 2);
});

test('Гуди: сброс Союзника лечит Лидера выше максимума', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  put(g, 0, 156);
  const p = addHand(g, 0, 158);
  g.leader(0).hpNow = 23;
  ans(g, 'go');
  ok(has(g.pending, 'Необходимые жертвы'));
  ans(g, p.uid);
  eq(g.leader(0).hpNow, 28);
  ok(g.P(0).grave.includes(p));
  toMain(g);
});

test('Опутывание травами: +1 💰 за врага, пропуск Сражения', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  put(g, 1, 9, 0); put(g, 1, 9, 1);
  put(g, 0, 9, 3);
  const c = addHand(g, 0, 157);
  toMain(g);
  eq(g.costOf(0, c), 3);
  play(g, c);
  eq(g.s.skipBattles, 1);
  endTurn(g); runBattle(g);
  eq(g.leader(1).hpNow, 28, 'боя не было');
});

test('Пырей: после Прорыва к Лидеру переходит в регион без Сражения и бьёт снова', () => {
  const g = makeGame();
  put(g, 0, 158, 0); put(g, 1, 9, 0);
  toMain(g); endTurn(g);
  runBattle(g, (q) => (has(q, 'Прыжок') ? 3 : defaultAnswer(q)));
  eq(g.leader(1).hpNow, 28 - 6 - 8);
  eq(g.allyAt(0, 3).id, 158);
});

test('Шаманизм: Союзник с кладбища в регион', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  const dead = addGrave(g, 0, 9);
  const c = addHand(g, 0, 159);
  toMain(g); play(g, c, [dead.uid, 3]);
  eq(g.allyAt(0, 3), dead);
});

test('Таверна «Кайф» и Бунгало с кукурузой: доход от кладбища', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  put(g, 0, 160, 0); put(g, 0, 124, 1);
  for (let k = 0; k < 4; k++) addGrave(g, 0, 9);
  for (let k = 0; k < 3; k++) addGrave(g, 0, 134);
  toMain(g);
  eq(g.P(0).coins, 5 + 3 + 2 + 2);
});

test('Обломки торгового судна: 3 📦, каждый ход -1 📦 +4 💰', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  const w = put(g, 0, 162, 0);
  toMain(g);
  eq(g.tokens(w, 'goods'), 2); eq(g.P(0).coins, 5 + 4 + 2);
});

test('Лёша: запланировать 3, реинкарнация до конца Сражения, уход из игры вместо уничтожения', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  const l = put(g, 0, 164);
  const dead = addGrave(g, 0, 9);
  ans(g, 'go');
  eq(g.pending.type, 'multi'); ok(g.pending.plan); eq(g.pending.options.length, 3);
  ans(g, []);
  toMain(g); endTurn(g);
  runBattle(g, (q) => (has(q, 'Реинкарнации') ? dead.uid : has(q, 'Куда положить') ? 2 : defaultAnswer(q)));
  eq(g.allyAt(0, 2), null); ok(g.P(0).exile.includes(dead));
  eq(g.leader(1).hpNow, 26, 'реинкарнация успела ударить');
  const kazn = addHand(g, 1, 6); g.P(1).coins = 10;
  toMain(g);
  play(g, kazn, [l]);
  ok(g.P(0).exile.includes(l)); ok(!g.P(0).grave.includes(l));
});

test('Телекинез: вражеский Союзник в руку и карта', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  const e = put(g, 1, 9, 0);
  const c = addHand(g, 0, 165);
  toMain(g); play(g, c, [e]);
  ok(g.P(1).hand.includes(e)); eq(g.P(0).hand.length, 1);
});

test('Подприкрытус: Бросок кинжала; Скрыться на виду при использовании карты', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  const s = addHand(g, 0, 166); const t = addHand(g, 0, 142);
  toMain(g);
  play(g, s, [0, g.leader(1)]);
  eq(g.leader(1).hpNow, 27);
  play(g, t, [1]);
  ok(g.P(0).hand.includes(s));
  ok(g.items(0).some((c) => c.id === 83));
});

test('Кеша: уничтожает Место напротив; при гибели — 3 💰 и в руку', () => {
  const g = makeGame();
  const pl = put(g, 1, 130, 2);
  const k = addHand(g, 0, 167); g.P(0).coins = 15;
  const kazn = addHand(g, 1, 6); g.P(1).coins = 10;
  toMain(g); play(g, k, [2]);
  eq(pl.zone, 'grave');
  toP1Main(g);
  const c = g.P(0).coins;
  ans(g, `play:${kazn.uid}:6`); ans(g, k.uid);
  passPriority(g);
  ok(has(g.pending, 'Зарыться')); ans(g, 1);
  ok(g.P(0).hand.includes(k)); eq(g.P(0).coins, c - 3);
});

test('Гений Эрика: разные стоимости — в руку; совпадение — замешать', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  const top = stackDeck(g, 0, [138, 143, 139, 146]);
  const c = addHand(g, 0, 169);
  toMain(g); play(g, c, [1, 1, 1, 0]);
  eq(g.P(0).hand.length, 3); ok(g.P(0).hand.includes(top[2]));
  const g2 = makeGame({ p0: { leader: ERIK } });
  stackDeck(g2, 0, [138, 143, 139, 146]);
  const n = g2.P(0).deck.length;
  const c2 = addHand(g2, 0, 169);
  toMain(g2); play(g2, c2, [1, 1, 1, 1]);
  eq(g2.P(0).hand.length, 0); eq(g2.P(0).deck.length, n);
});

test('Паспортистка: +1/+1 за дешёвого Союзника, раз за фазу', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  const ps = put(g, 0, 170, 0);
  const a1 = addHand(g, 0, 138); const a2 = addHand(g, 0, 143);
  toMain(g);
  play(g, a1, [1]); play(g, a2, [2]);
  eq(g.atk(ps), 2); eq(g.maxHp(ps), 3);
});

test('Целебные ягоды: распределение X исцеления', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  const a = put(g, 0, 9, 0); a.dmg = 1;
  g.leader(0).hpNow = 20;
  const c = addHand(g, 0, 171);
  toMain(g);
  play(g, c, [3, a.uid, 2]);
  eq(a.dmg, 0); eq(g.leader(0).hpNow, 22);
});

test('Эльфийская соль: случайное Действие с кладбища бесплатно, затем из игры', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  const s = put(g, 0, 172);
  const theft = addGrave(g, 0, 142);
  toMain(g);
  const c = g.P(0).coins;
  useAbility(g, s, 0);
  ok(g.items(0).some((x) => x.id === 83)); eq(g.P(0).coins, c);
  ok(g.P(0).exile.includes(theft)); eq(s.zone, 'grave');
  // С Эльфом можно выбрать.
  const g2 = makeGame({ p0: { leader: ERIK } });
  const s2 = put(g2, 0, 172); put(g2, 0, 175, 4);
  addGrave(g2, 0, 142); const kick = addGrave(g2, 0, 134); const e = put(g2, 1, 135, 0);
  toMain(g2);
  useAbility(g2, s2, 0, [kick.uid, e.uid]);
  eq(e.dmg, 2); ok(g2.P(0).exile.includes(kick));
});

test('Святостой: 1 рана всем Союзникам, погибшие — из игры (и свои тоже)', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  const m1 = put(g, 0, 138, 0); const m2 = put(g, 0, 9, 1);
  const e1 = put(g, 1, 138, 2); const e2 = put(g, 1, 9, 3);
  const c = addHand(g, 0, 174);
  toMain(g); play(g, c);
  ok(g.P(0).exile.includes(m1)); ok(g.P(1).exile.includes(e1));
  eq(m2.dmg, 1); eq(e2.dmg, 1); ok(!m2.x.exileOnDeath);
});

test('Диана: ранив Лидера, кладёт любую карту Скрижали наверх', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  put(g, 0, 175, 0);
  const want = g.newInst(132, 0, 'deck'); g.P(0).deck.push(want);
  toMain(g); endTurn(g);
  runBattle(g, (q) => (has(q, 'Доставить товар: выберите') ? [want.uid] : defaultAnswer(q)));
  eq(g.P(0).deck[0], want);
});

done();
