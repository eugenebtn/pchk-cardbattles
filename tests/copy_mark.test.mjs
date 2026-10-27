// node tests/copy_mark.test.mjs
// A player saw Лариса put out 5 «Сельская местность» and thought the 3-copy limit was broken: the extra ones were
// Ворон Барон's «Хлеб» copies, but the log only said «… появляется на поле». The log names the copier, the view flags copies.
import { makeGame, put, runUntil, defaultAnswer, test, eq, ok, done } from './helpers.mjs';

const LAR = () => ({ leader: 41, deck: Array(20).fill(9) });

test('Ворон Барон: в истории видно, кто создал копию; карта помечена как копия', () => {
  const g = makeGame({ p0: LAR(), p1: LAR() });
  put(g, 0, 43);
  const farm = put(g, 0, 38, 0);
  const from = g.events.length;
  runUntil(g, (q) => q.type === 'main', (q) => (q.prompt?.startsWith('Хлебный') ? farm.uid : defaultAnswer(q)));
  const copy = g.placeAt(0, 1);
  ok(copy && copy.id === 38, 'копия Сельской местности');
  const ev = g.events.slice(from).find((e) => e.type === 'enter' && e.uid === copy.uid);
  eq(ev.log, '«Ворон Барон, мастер хлебных крошек» создаёт копию «Сельская местность» (тип Хлеб).');
  const v = g.view(0).players[0].regions[1].place;
  eq(v.copy, true, 'view.copy');
  eq(g.view(0).players[0].regions[0].place.copy, false, 'оригинал не копия');
});

test('обычный выход на поле — прежняя строка', () => {
  const g = makeGame({ p0: LAR(), p1: LAR() });
  const c = g.newInst(38, 0, 'limbo');
  const from = g.events.length;
  const it = g.putOnField(c, 0, 0); while (!it.next().done);
  eq(g.events.slice(from).find((e) => e.type === 'enter').log, '«Сельская местность» появляется на поле.');
});

done();
