import test from 'node:test';
import assert from 'node:assert/strict';
import { isExperimentalDeck as exp, EXPERIMENTAL_DECKS as decks } from '../js/data/experimental.js';
import { CARDS } from '../js/data/cards.js';
import { encodeDeck, decodeDeck } from '../js/net/deckcode.js';
test('experimental detection accepts names, missing fields, arrays and string IDs', () => {
 for (const d of [null,undefined,{}, {deck:'София'}, {cards:'broken'}, {leader:20,cards:[9]}, {deck:{name:'София'}}]) assert.equal(exp(d),false);
 for (const d of [{leader:1001},{leader:'1002'},{leaderId:'1003'},{leader:{id:1004}},{leader:20,cards:[1011]},{deck:['1031']},{main:[1051]},{cards:[],main:[1071]}]) assert.equal(exp(d),true);
});
test('four experimental decks have 40 known cards and share code roundtrips', () => {
 for(const d of Object.values(decks)) {
  assert.equal(d.main.length,40);assert.ok(d.main.every(id=>CARDS[id]&&!CARDS[id].token));
  for(const id of d.main) assert.ok(d.main.filter(x=>x===id).length<=3);
  const decoded=decodeDeck(encodeDeck({leader:d.leader,cards:d.main}));
  assert.equal(decoded.leader,d.leader);assert.deepEqual([...decoded.cards].sort((a,b)=>a-b),[...d.main].sort((a,b)=>a-b));
 }
 assert.ok(CARDS[1091].kw.includes('ward'));
});
