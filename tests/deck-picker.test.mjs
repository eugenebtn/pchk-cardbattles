import test from 'node:test';
import assert from 'node:assert/strict';
import { availableDecks, deckError } from '../js/ui/deck-picker.js';
import { DECKS } from '../js/data/decks.js';
import { THEME_DECKS } from '../js/data/themedecks.js';
import { BOT_DECKS } from '../js/data/botdecks.js';
import { autoReport } from '../js/ui/feedback.js';

test('Every existing ready deck is selectable, valid and keeps its exact card list', () => {
  const all = availableDecks();
  assert.equal(all.length, Object.keys(DECKS).length + THEME_DECKS.length + BOT_DECKS.length);
  assert.equal(new Set(all.map(d=>d.key)).size, all.length);
  for (const d of all) assert.equal(deckError(d), '', d.key);
  for (const d of Object.values(DECKS)) assert.deepEqual(all.find(x=>x.key==='off:'+d.key).cards,d.main);
  for (const d of BOT_DECKS) assert.deepEqual(all.find(x=>x.key==='bot:'+d.key).cards,d.cards);
  assert.equal(new Set(all.map(d=>d.leader)).size,10);
});
test('Legacy custom decks and keys survive; illegal decks cannot start a game', () => {
  const base=availableDecks()[0];
  const custom={name:'Сохранённая колода',leader:base.leader,cards:[...base.cards]};
  const d=availableDecks([custom]).find(x=>x.key==='cus:0');
  assert.equal(d.title,custom.name);assert.deepEqual(d.cards,custom.cards);
  assert.equal(deckError(d),'');assert.ok(deckError({...d,cards:d.cards.slice(0,39)}));
  assert.ok(deckError({...d,cards:[...d.cards,999999]}));
  assert.ok(deckError({...d,cards:Array(40).fill(d.cards[0])}));
  assert.ok(deckError({...d,leader:-1}));
});
test('Automatic error reports from localhost never reach production feedback', () => {
  const oldLoc=globalThis.location,oldFetch=globalThis.fetch;
  let sent=0;globalThis.location={hostname:'127.0.0.1',protocol:'http:',search:''};globalThis.fetch=()=>{sent++;return Promise.resolve();};
  try{autoReport(Error('isolated QA'));assert.equal(sent,0);}finally{globalThis.location=oldLoc;globalThis.fetch=oldFetch;}
});
