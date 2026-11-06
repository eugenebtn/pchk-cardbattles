import test from 'node:test';
import assert from 'node:assert/strict';
import {saveCustomDeck} from '../js/ui/custom-decks.js';
import {availableDecks,deckError} from '../js/ui/deck-picker.js';
import {CARDS} from '../js/data/cards.js';
const base=availableDecks()[0];
const extra=Object.values(CARDS).find(c=>c.type!=='leader'&&!c.token&&!base.cards.includes(c.id)).id;
const custom={name:'Своя 41',leader:base.leader,cards:[...base.cards,extra]};
function storage(){const db={decks:[]};return {get:(k,d)=>structuredClone(db[k]??d),set:(k,v)=>{db[k]=structuredClone(v)}};}
test('Save/read-back preserves a non-starter composition and repeated Play does not duplicate it',()=>{
 const store=storage(),a=saveCustomDeck(store,custom);assert.equal(a.ok,true);assert.deepEqual(a.deck.cards,custom.cards);
 const b=saveCustomDeck(store,custom,a.index,a.deck),c=saveCustomDeck(store,custom);
 assert.equal(b.ok,true);assert.equal(c.ok,true);assert.equal(store.get('decks').length,1);
 assert.deepEqual(availableDecks(store.get('decks')).find(d=>d.key==='cus:0').cards,custom.cards);
});
test('Editing a saved composition updates its existing slot',()=>{
 const store=storage(),a=saveCustomDeck(store,custom),edited={...custom,name:'Изменена',cards:[...custom.cards,extra]};
 const b=saveCustomDeck(store,edited,a.index,a.deck);assert.equal(b.ok,true);assert.equal(store.get('decks').length,1);assert.deepEqual(store.get('decks')[0],edited);
});
test('A same-profile cloud reorder cannot make editing B overwrite A',()=>{
 const store=storage(),B=structuredClone(custom),A={name:'A',leader:base.leader,cards:[...base.cards]};
 store.set('decks',[B]);const original=store.get('decks')[0];
 store.set('decks',[A,B]);const edited={...B,name:'B изменена'};
 assert.equal(saveCustomDeck(store,edited,0,original).ok,true);
 assert.deepEqual(store.get('decks'),[A,edited]);
 store.set('decks',[A]);assert.equal(saveCustomDeck(store,edited,0,original).ok,false);assert.deepEqual(store.get('decks'),[A]);
});
test('Silent denied storage, quota errors and read errors cannot report success',()=>{
 for(const store of [{get:()=>[],set:()=>{}},{get:()=>[],set:()=>{throw Error('quota')}},{get:()=>{throw Error('denied')},set:()=>{}}]){
   const r=saveCustomDeck(store,custom);assert.equal(r.ok,false);assert.match(r.error,/сохранить/);
 }
});
test('80-card limit agrees with the server and invalid existing drafts are preserved',()=>{
 const pool=Object.values(CARDS).filter(c=>!c.token&&c.type!=='leader');
 const cards=pool.slice(0,27).flatMap(c=>[c.id,c.id,c.id]);const store=storage();
 const d80={name:'80',leader:base.leader,cards:cards.slice(0,80)};assert.equal(deckError(d80),'');assert.equal(saveCustomDeck(store,d80).ok,true);
 const old={name:'81 старый черновик',leader:base.leader,cards};store.set('decks',[old]);
 assert.match(deckError(old),/80/);assert.equal(saveCustomDeck(store,old,0).ok,false);assert.deepEqual(store.get('decks'),[old]);
});
