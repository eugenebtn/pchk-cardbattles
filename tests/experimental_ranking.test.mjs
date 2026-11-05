import test from 'node:test';
import assert from 'node:assert/strict';
import {submitResult} from '../js/net/ranking.js';
import {DECKS} from '../js/data/decks.js';
test('All ten Leaders and mixed decks keep client bot/online result submissions local',async()=>{const old=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return {ok:true};};try{for(const d of Object.values(DECKS))for(const mode of ['bot','online'])assert.equal(await submitResult({leader:d.leader,cards:d.main,mode,won:true}),false);assert.equal(await submitResult({leader:20,cards:[1011],mode:'bot'}),false);assert.equal(calls,0);}finally{globalThis.fetch=old;}});
