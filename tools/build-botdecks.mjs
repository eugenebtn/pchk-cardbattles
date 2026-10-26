// Turns the decks found by tools/deck-search.mjs (tools/out/decks/*.json) into js/data/botdecks.js.
// Only decks that win at least as often as the Leader's starter deck are kept.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { CARDS } from '../js/data/cards.js';

const dir = new URL('./out/decks/', import.meta.url);
const STYLE_RU = { aggro: 'Натиск', value: 'Выгода' };
const SHORT = { 20: 'Сфинктерион', 41: 'Лариса', 62: 'Дан Балан', 63: 'Влад', 117: 'Эрик', 118: 'София' };
// «combo» decks are named after the family they gather (see TRIBE in tools/deck-search.mjs).
const FAMILY = { 20: ['Дружина', 'Воины'], 41: ['Стая', 'Животные'], 62: ['Клан', 'Вампиры'], 63: ['Клан', 'Вампиры'], 117: ['Шайка', 'Плуты'], 118: ['Таверна', 'Таверны и Торговцы'] };
const STYLE_DESC = {
  aggro: 'Быстрый натиск: много дешёвых союзников, давит с первых ходов.',
  value: 'Выгода: Места, Предметы и Напарники — медленнее, но каждая карта приносит больше.',
  combo: 'карты одного рода и «Разговор с…»: они усиливают и удешевляют друг друга.',
};
const base = JSON.parse(readFileSync(new URL('baseline.json', dir), 'utf8'));
const out = [];
for (const f of readdirSync(dir).filter((x) => /^\d+_[a-z]+\.json$/.test(x)).sort()) {
  const d = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
  if (d.win < 0.5 && d.win < (base[d.leader] ?? 0)) { console.log('skip', f, d.win, 'starter', base[d.leader]); continue; }
  if (d.cards.length < 40 || d.cards.some((id) => !CARDS[id])) continue;
  const L = SHORT[d.leader] || CARDS[d.leader].name.split(',')[0];
  const fam = FAMILY[d.leader] || ['Стая', 'союзники'];
  const title = `${L} · ${d.style === 'combo' ? fam[0] : STYLE_RU[d.style]}`;
  const desc = d.style === 'combo' ? `${fam[0]}: ${fam[1].toLowerCase()} — ${STYLE_DESC.combo}` : STYLE_DESC[d.style];
  out.push({ key: `bot_${d.leader}_${d.style}`, title, leader: d.leader, style: d.style, desc, win: d.win, cards: d.cards });
}
// Leaders in the order of the starter decks, then Натиск · род · Выгода.
const LORDER = [20, 41, 62, 63, 117, 118], SORDER = ['aggro', 'combo', 'value'];
out.sort((x, y) => LORDER.indexOf(x.leader) - LORDER.indexOf(y.leader) || SORDER.indexOf(x.style) - SORDER.indexOf(y.style));
writeFileSync(new URL('../js/data/botdecks.js', import.meta.url), `// Decks found by tools/deck-search.mjs and packed by tools/build-botdecks.mjs (${new Date().toISOString().slice(0, 10)}).\n// The computer takes one of these when the player brings their own deck; players can copy them in the deck builder.\nexport const BOT_DECKS = ${JSON.stringify(out)};\n`);
console.log(out.map((d) => `${d.title}: ${(d.win * 100).toFixed(0)}%`).join('\n'));
