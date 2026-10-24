// node tests/audit_cards_b.test.mjs — independent audit of vampires.js (62–116) and sofia_erik.js (117–175).
import { makeGame, put, addHand, addGrave, ans, toMain, endTurn, runUntil, runBattle, defaultAnswer, test, eq, ok, done, passPriority } from './helpers.mjs';

const DAN = 62, SFINK = 20, ERIK = 117;
const mk = (opts = {}) => {
  const g = makeGame({ p0: { leader: opts.l0 ?? DAN, deck: opts.d0 }, p1: { leader: opts.l1 ?? SFINK, deck: opts.d1 }, first: opts.first ?? 0 });
  g.cfg.options.autoPass = [true, true];
  return g;
};
/** Drive an engine generator, answering its requests in order (then default answers). */
function drive(g, gen, answers = []) {
  let r = gen.next();
  let k = 0;
  while (!r.done) {
    const q = r.value;
    q.player = q.player ?? 0;
    const a = k < answers.length ? answers[k++] : defaultAnswer(q);
    r = gen.next(typeof a === 'function' ? a(q) : (a?.uid ?? a));
  }
  return r.value;
}
const fxNames = (g, from) => g.events.filter((e) => e.seq > from && e.type === 'fx').map((e) => e.fx);

// ---------- Посох паутины: «оглушить вражеского Союзника» — выбор цели, Оберег защищает ----------
test('Посох паутины: Паутина не действует на вражеского Союзника с Оберегом', () => {
  const g = mk();
  const st = put(g, 0, 109);
  const a = put(g, 0, 85, 2), e = put(g, 1, 10, 2);
  st.equip = a.uid; st.tok.web = 2;
  e.kws.push({ kw: 'ward', until: null });
  ans(g, 'go'); passPriority(g);
  ans(g, 0); // не класть паутину
  toMain(g);
  ok(!g.canUseAbility(0, st, 1, { main: true }), 'цель с Оберегом выбрать нельзя');
  e.kws = [];
  ok(g.canUseAbility(0, st, 1, { main: true }), 'без Оберега — можно');
});

// ---------- Гнездо кукушки: «свойство, которое требует снять 🩸» — и у срабатывающих свойств ----------
test('Гнездо кукушки + Лука: Подростковая ярость срабатывает дважды (+4/+0) за одни 2 🩸', () => {
  const g = mk();
  put(g, 0, 94, 0);
  const l = put(g, 0, 84, 0); l.tok.blood = 2;
  drive(g, g.script(l).on.battleStart(g, l, { player: 0 }), [1]);
  eq(g.tokens(l, 'blood'), 0, 'оплачено один раз');
  eq(g.atk(l), 2 + 4);
  ok(g.has(l, 'breakthrough'));
});

test('Гнездо кукушки + Вампирбек: «Самое главное — это семья» даёт +2/+2 дважды', () => {
  const g = mk();
  put(g, 0, 94, 1);
  const vb = put(g, 0, 77, 1); vb.tok.blood = 2;
  const v = put(g, 0, 85, 3);
  drive(g, g.script(vb).on.enter(g, vb, { inst: v, player: 0 }), [1]);
  eq(g.tokens(vb, 'blood'), 0);
  eq(g.atk(v), 1 + 4); eq(g.maxHp(v), 2 + 4);
  // Вне региона Гнезда — один раз.
  const g2 = mk();
  put(g2, 0, 94, 0);
  const vb2 = put(g2, 0, 77, 1); vb2.tok.blood = 2;
  const v2 = put(g2, 0, 85, 3);
  drive(g2, g2.script(vb2).on.enter(g2, vb2, { inst: v2, player: 0 }), [1]);
  eq(g2.atk(v2), 1 + 2);
});

test('Гнездо кукушки + Флореан: Призвать приспешников ищет Вампира дважды', () => {
  const g = mk({ d0: [9, 85, 9, 84, 9, 9] });
  put(g, 0, 94, 2);
  const f = put(g, 0, 97, 2); f.tok.blood = 2;
  drive(g, g.script(f).on.turnStart(g, f, { player: 0 }), [
    1,
    (q) => [q.options[0].id], 1,
    (q) => [q.options[0].id], 3,
  ]);
  eq(g.tokens(f, 'blood'), 0);
  const ids = [g.allyAt(0, 1)?.id, g.allyAt(0, 3)?.id].sort();
  eq(JSON.stringify(ids), JSON.stringify([84, 85]), 'два Вампира в соседних регионах');
});

// ---------- Королевский экипаж: один доход (2 + 1), а не два отдельных ----------
test('Королевский экипаж + Золотой доспех Януса: +1 к одному доходу, а не к каждому из двух', () => {
  const g = mk();
  put(g, 0, 95, 0); put(g, 0, 96, 0); // Отпрыск — Вельможа
  put(g, 0, 149);
  ans(g, 'go'); passPriority(g);
  toMain(g);
  eq(g.P(0).coins, 5 + 3 + 1 + 2, '2 + 1 (Вельможа) + 1 (Доспех) + две монеты');
});

// ---------- Лёша: реинкарнация уходит из игры, даже если Лёша покинул поле ----------
test('Лёша: союзник-реинкарнация не остаётся на поле, если Лёша ушёл до конца Сражения', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  const l = put(g, 0, 164);
  const dead = addGrave(g, 0, 9);
  // A fast card in hand + all windows: the battle stops at a priority window after the reincarnation.
  addHand(g, 0, 131); g.cfg.options.allWindows = true;
  ans(g, 'go'); passPriority(g); ans(g, []);
  toMain(g); endTurn(g);
  // Ход противника → Сражение: вернуть Союзника реинкарнацией в регион 2.
  runUntil(g, (q) => q.type === 'region' && g.s.inBattle, (q) => (q.prompt?.includes('Реинкарнации') ? dead.uid : defaultAnswer(q)));
  ans(g, 2);
  eq(g.allyAt(0, 2), dead);
  eq(g.pending?.type, 'priority');
  // Лёша покидает поле посреди Сражения.
  drive(g, g.toHand(l));
  runBattle(g);
  ok(!g.onField(dead), 'реинкарнация не должна остаться на поле');
  ok(g.P(0).exile.includes(dead));
});

// ---------- UI: у свойств есть эффект с понятным именем ----------
test('fx: доход Мест и «Полезная находка» показывают анимацию', () => {
  const g = makeGame({ p0: { leader: ERIK } });
  put(g, 0, 124, 0); put(g, 0, 130, 1); put(g, 0, 160, 2);
  const box = put(g, 0, 144);
  const from = g.seq;
  ans(g, 'go'); passPriority(g);
  if (g.pending?.type === 'target') ans(g, null); // Ящик: Снабжение — пропустить
  toMain(g);
  eq(fxNames(g, from).filter((n) => n === 'coins').length, 3, 'три Места с доходом');
  const f2 = g.seq;
  ans(g, `ab:${box.uid}:0`); passPriority(g);
  ok(fxNames(g, f2).includes('coins'), 'Полезная находка');
});

done();
