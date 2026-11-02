import test from 'node:test';
import assert from 'node:assert/strict';
import {submitResult} from '../js/net/ranking.js';
test('Experimental decks on either side never submit to ranking, ordinary decks still submit',async()=>{
 let calls=0;const orig=globalThis.fetch;globalThis.fetch=async()=>{calls++;return {ok:true};};
 try {
  for(const r of [{leader:1001},{leader:20,cards:[1011]},{leader:20,oppLeader:1002},{leader:20,oppCards:[1051]},{leader:20,opponent:{leader:20,cards:[1011]}},{leader:20,oppDeck:{leader:1004}}]) assert.equal(await submitResult(r),false);
  assert.equal(calls,0);assert.equal(await submitResult({leader:20,cards:[9],oppLeader:117}),true);assert.equal(calls,1);
 } finally {globalThis.fetch=orig;}
});
