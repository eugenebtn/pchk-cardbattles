// House rule «усталость» (2026-10-26): an empty deck at the start of your turn costs your Leader 1, then 2, 3…
// Run: node tests/rules_fatigue.test.mjs  (from the game folder)
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { makeGame, toMain, endTurn, runUntil, test, eq, ok, done } from './helpers.mjs';

const fatigueLines = (g) => g.s.log.filter((l) => l.startsWith('Колода пуста'));
// Play on until player `pl` is asked to draw in a later round.
const nextTurnOf = (g, pl) => { const r = g.s.round; runUntil(g, (q) => g.s.over || (q.type === 'draw' && q.player === pl && g.s.round > r)); };

test('Усталость: пустая колода в начале хода — Лидер теряет 1', () => {
  const g = makeGame({ p0: { leader: 117, deck: [] }, p1: { leader: 117 } }); // Эрик: без дохода в начале хода
  const hp = g.P(0).leader.hpNow;
  toMain(g);
  eq(g.P(0).leader.hpNow, hp - 1);
  eq(g.P(0).fatigue, 1);
  eq(fatigueLines(g).length, 1);
  ok(fatigueLines(g)[0].includes('теряет 1 здоровья'), fatigueLines(g)[0]);
  eq(g.view(0).players[0].fatigue, 1, 'счётчик виден в view');
});

test('Усталость: урон растёт 1, 2, 3, у соперника с колодой — ничего', () => {
  const g = makeGame({ p0: { leader: 117, deck: [] }, p1: { leader: 117 } });
  toMain(g);
  endTurn(g);
  nextTurnOf(g, 0);
  if (g.pending?.type === 'draw') toMain(g);
  nextTurnOf(g, 0);
  eq(g.P(0).fatigue, 3);
  eq(g.P(1).fatigue, 0);
  const lines = fatigueLines(g);
  eq(lines.length, 3);
  ['1', '2', '3'].forEach((n, k) => ok(lines[k].includes(`теряет ${n} здоровья`), lines[k]));
});

test('Усталость: у каждого игрока свой счёт', () => {
  const g = makeGame({ p0: { leader: 117, deck: [] }, p1: { leader: 117, deck: [] } });
  toMain(g);
  endTurn(g);
  runUntil(g, (q) => q.type === 'draw' && q.player === 1);
  eq(g.P(0).fatigue, 1);
  eq(g.P(1).fatigue, 1);
});

test('Усталость: колода не пуста — урона нет', () => {
  const g = makeGame({ p0: { leader: 117, deck: [9] }, p1: { leader: 117 } });
  const hp = g.P(0).leader.hpNow;
  toMain(g);
  eq(g.P(0).leader.hpNow, hp);
  eq(g.P(0).fatigue, 0);
  eq(fatigueLines(g).length, 0);
});

test('Усталость: Лидер на 1 здоровье — партия заканчивается', () => {
  const g = makeGame({ p0: { leader: 117, deck: [] }, p1: { leader: 117 } });
  g.P(0).leader.hpNow = 1;
  runUntil(g, () => g.s.over);
  ok(g.s.over);
  eq(g.s.winner, 1);
});

test('Усталость: в журнале реальный урон, а не запрошенный', () => {
  const g = makeGame({ p0: { leader: 117, deck: [] }, p1: { leader: 117 } });
  g.P(0).fatigue = 2; g.P(0).leader.hpNow = 2;
  runUntil(g, () => g.s.over);
  ok(fatigueLines(g)[0].includes('теряет 2 здоровья'), fatigueLines(g)[0]);
});

test('Усталость: бесконечная партия seed 97856 (зеркало theme_hell) теперь заканчивается', () => {
  if (!existsSync('tools/qa/invariants.mjs')) { console.log('       (нет tools/qa/invariants.mjs — пропуск)'); return; }
  const out = execFileSync(process.execPath, ['tools/qa/invariants.mjs', '3', 'novice,normal,fuzz', '95000'], {
    env: { ...process.env, ONLY: '97856', MAXR: '300' }, encoding: 'utf8',
  });
  const m = out.match(/errors (\d+), hangs (\d+), rule violations (\d+), wins P0 (\d+) P1 (\d+) draw (\d+)/);
  ok(m, out);
  eq(+m[1] + +m[2] + +m[3], 0, 'без ошибок, зависаний и нарушений');
  eq(+m[4] + +m[5] + +m[6], 1, 'партия доиграна');
});

done();
