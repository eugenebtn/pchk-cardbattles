// Themed ready-made decks (hand-picked around one idea) → js/data/themedecks.js.
// Each deck is measured like tools/deck-search.mjs does: normal bot vs the six starter decks.
// Usage: node tools/theme-decks.mjs [deals=40] [key]   (key = only measure that deck, nothing is written)
import { writeFileSync } from 'node:fs';
import { Game } from '../js/engine/game.js';
import { levelAnswer } from '../js/engine/botlevels.js';
import { DECKS } from '../js/data/decks.js';
import { CARDS } from '../js/data/cards.js';

// [card id, copies]
export const THEMES = [
  { key: 'theme_circus', title: 'Бродячий цирк', leader: 41,
    desc: 'Шуты и мелкие союзники во всех трёх регионах. Когда союзник стоит в каждом регионе, Лариса даёт +1/+1, а Марш-бросок бросает всю толпу в бой.',
    list: [[369, 3], [371, 3], [375, 3], [30, 1], [80, 3], [35, 3], [23, 3], [22, 3], [32, 3], [100, 3], [138, 2], [113, 1], [170, 3], [26, 2], [38, 2], [99, 2]] },
  { key: 'theme_hell', title: 'Сделка с преисподней', leader: 118,
    desc: 'Демоны, которые бьют по своему же Лидеру. София лечит себя каждый ход, а Закусочная, Пламя и ягоды закрывают раны.',
    list: [[378, 3], [374, 1], [71, 3], [370, 3], [377, 3], [368, 2], [30, 1], [166, 1], [24, 2], [159, 1], [81, 3], [7, 3], [171, 1], [156, 1], [160, 1], [134, 3], [157, 1], [124, 2], [79, 2], [36, 3]] },
  { key: 'theme_sun', title: 'Орден Солнца', leader: 20,
    desc: 'Паладины, жрецы и инквизиция. Каждое Благословение бьёт врага и лечит своих, Кряхтун растёт от каждого, Муштра делает героя огромным.',
    list: [[15, 1], [7, 3], [21, 3], [18, 2], [131, 3], [174, 1], [156, 1], [72, 2], [110, 3], [103, 3], [105, 2], [9, 3], [10, 2], [16, 1], [8, 1], [11, 3], [6, 2], [4, 1], [19, 3]] },
  { key: 'theme_gnomes', title: 'Гномья засада', leader: 117,
    desc: 'Гномы и плуты, которые выходят в чужой ход. Засада речных гномов посреди Сражения, а каждый удар по Лидеру делает союзника сильнее.',
    list: [[372, 3], [376, 3], [170, 3], [10, 3], [139, 1], [136, 3], [30, 1], [33, 2], [168, 3], [138, 3], [146, 1], [125, 3], [145, 2], [165, 2], [131, 2], [23, 2], [377, 2], [121, 1]] },
  { key: 'theme_giants', title: 'Лесные великаны', leader: 41,
    desc: 'Дешёвые звери держат регионы, потом выходят великаны: Медведь-шатун дешевеет от каждого животного, Кеша и Папа-ёлка ломают поле, Шаманизм возвращает павших.',
    list: [[28, 3], [167, 1], [154, 2], [40, 1], [34, 3], [22, 3], [159, 2], [98, 1], [32, 3], [39, 2], [38, 3], [36, 2], [43, 1], [42, 1], [29, 1], [24, 2], [33, 2], [153, 1], [370, 2], [81, 2], [134, 2]] },
  { key: 'theme_hunters', title: 'Охотники на нечисть', leader: 63,
    desc: 'Граф Влад ведёт инквизицию: люди с Обороной держат регионы, Агент смотрит руку врага, Влад добивает раненых. Вампир в колоде один — Блэт, охотник на своих.',
    list: [[103, 3], [104, 3], [105, 3], [110, 1], [111, 1], [9, 1], [81, 3], [95, 3], [89, 2], [91, 2], [1, 1], [2, 1], [21, 1], [22, 1], [23, 1], [30, 1], [38, 1], [43, 1], [70, 1], [72, 1], [74, 1], [82, 1], [99, 1], [129, 1], [135, 1], [143, 1], [154, 1], [378, 1]] },
];
export const cardsOf = (t) => t.list.flatMap(([id, n]) => Array(n).fill(id)).sort((a, b) => a - b);

function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const GAUNTLET = Object.values(DECKS).map((d) => ({ leader: d.leader, deck: d.main }));
function play(decks, seed) {
  const g = new Game({ seed, players: decks.map((d, i) => ({ name: 'P' + i, leader: d.leader, deck: d.deck })), options: { mulliganBonus: true } });
  const rand = mulberry(seed);
  for (let k = 0; k < 6000 && g.pending && !g.s.over; k++) {
    const q = g.pending; let a;
    try { a = levelAnswer(g, q, 'normal', rand); } catch { a = undefined; }
    if (!g.respond(q.player, a) && !g.respond(q.player, q.type === 'main' ? 'end' : q.type === 'priority' ? 'pass' : q.options?.[0]?.id ?? null)) return null;
  }
  return g.s.over ? g.s.winner : null;
}
export function measure(leader, cards, deals = 40) {
  let w = 0, n = 0, err = 0;
  for (let s = 0; s < deals; s++) for (const [gi, opp] of GAUNTLET.entries()) {
    const seat = (s + gi) % 2, me = { leader, deck: cards };
    const r = play(seat ? [opp, me] : [me, opp], (900000 + s) * 13 + gi);
    if (r == null) { err++; continue; }
    if (r === 'draw') continue;
    n++; if (r === seat) w++;
  }
  return { win: n ? w / n : 0, games: n, err };
}

if (process.argv[1]?.endsWith('theme-decks.mjs')) {
  const deals = Number(process.argv[2] || 40), only = process.argv[3];
  const out = [];
  for (const t of THEMES) {
    if (only && t.key !== only) continue;
    const cards = cardsOf(t);
    const bad = t.list.filter(([id, n]) => !CARDS[id] || CARDS[id].token || CARDS[id].type === 'leader' || n > 3);
    if (cards.length < 40 || bad.length) throw new Error(`${t.title}: ${cards.length} cards, bad ${JSON.stringify(bad)}`);
    const t0 = Date.now(), m = measure(t.leader, cards, deals);
    console.log(`${t.title}: ${(m.win * 100).toFixed(1)}% из ${m.games} (ошибок ${m.err}, ${((Date.now() - t0) / 1000).toFixed(0)} с)`);
    out.push({ key: t.key, title: t.title, leader: t.leader, style: 'theme', desc: t.desc, win: +m.win.toFixed(3), cards });
  }
  if (!only) writeFileSync(new URL('../js/data/themedecks.js', import.meta.url), `// Themed ready-made decks from tools/theme-decks.mjs (${new Date().toISOString().slice(0, 10)}): hand-picked around one idea (a few filler slots tuned by bot games).\n// Shown in the deck builder under «Готовые сборки»; the computer does not pick them.\nexport const THEME_DECKS = ${JSON.stringify(out)};\n`);
}
