// Turns the decks found by tools/deck-search.mjs (tools/out/decks/*.json) into js/data/botdecks.js.
// Only decks that win at least as often as the Leader's starter deck are kept.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { CARDS } from '../js/data/cards.js';

const dir = new URL('./out/decks/', import.meta.url);
const STYLE_RU = { aggro: 'Натиск', value: 'Выгода', combo: 'Стая' };
const STYLE_DESC = {
  aggro: 'Быстрый натиск: много дешёвых союзников, давит с первых ходов.',
  value: 'Выгода: Места, Предметы и Напарники — медленнее, но каждая карта приносит больше.',
  combo: 'Стая: карты одного рода, которые усиливают друг друга.',
};
const out = [];
for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
  const d = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
  if (d.cards.length < 40 || d.cards.some((id) => !CARDS[id])) continue;
  const L = CARDS[d.leader].name.split(',')[0];
  out.push({ key: `bot_${d.leader}_${d.style}`, title: `${L} · ${STYLE_RU[d.style]}`, leader: d.leader, style: d.style, desc: STYLE_DESC[d.style], win: d.win, cards: d.cards });
}
writeFileSync(new URL('../js/data/botdecks.js', import.meta.url), `// Decks found by tools/deck-search.mjs and packed by tools/build-botdecks.mjs (${new Date().toISOString().slice(0, 10)}).\n// The computer takes one of these when the player brings their own deck; players can copy them in the deck builder.\nexport const BOT_DECKS = ${JSON.stringify(out)};\n`);
console.log(out.map((d) => `${d.title}: ${(d.win * 100).toFixed(0)}%`).join('\n'));
