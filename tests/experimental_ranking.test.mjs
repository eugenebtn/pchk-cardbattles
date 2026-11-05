import test from 'node:test';
import assert from 'node:assert/strict';
import {submitResult,publishDeck} from '../js/net/ranking.js';
import {EXPERIMENTAL_DECKS} from '../js/data/experimental.js';
const decks=Object.values(EXPERIMENTAL_DECKS);
function locationFor(url){const u=new URL(url);return {protocol:u.protocol,hostname:u.hostname,search:u.search};}
async function offline(f){const oldFetch=globalThis.fetch,oldLocation=Object.getOwnPropertyDescriptor(globalThis,'location'),calls=[];globalThis.fetch=async(url,o)=>{calls.push({url,body:JSON.parse(o.body)});return {ok:true};};Object.defineProperty(globalThis,'location',{value:locationFor('https://pchk-battles.ru/'),configurable:true});try{await f(calls);}finally{globalThis.fetch=oldFetch;if(oldLocation)Object.defineProperty(globalThis,'location',oldLocation);else delete globalThis.location;}}
for(const d of decks)test(`New Leader ${d.leader}: results and community deck publishing use normal paths`,async()=>offline(async calls=>{
 const r={name:'Mock',deck:d.title,leader:d.leader,cards:d.main,oppLeader:20,mode:'online',won:true};assert.equal(await submitResult(r),true);assert.equal(calls[0].body.leader,d.leader);assert.deepEqual(calls[0].body.cards,d.main);
 assert.equal(await submitResult({name:'Mock',deck:'Обычная',leader:20,cards:[9],oppLeader:d.leader,oppCards:d.main}),true);
 assert.equal(await publishDeck({name:'Сборка',leader:d.leader,cards:d.main},'Mock'),true);assert.deepEqual(calls[2].body.cards,d.main);
}));
test('Mixed deck and result with a title but no cards are recorded',async()=>offline(async calls=>{assert.equal(await submitResult({deck:'Смешанная',leader:20,cards:[1011,9]}),true);assert.equal(await submitResult({deck:'София',leader:118,oppDeck:'Лариса'}),true);assert.equal(calls.length,2);}));
test('Local QA still writes nothing, including all new Leaders',async()=>offline(async calls=>{for(const url of ['http://localhost:8766/','http://127.0.0.1/','file:///game/index.html']){Object.defineProperty(globalThis,'location',{value:locationFor(url),configurable:true});for(const d of decks)assert.equal(await submitResult({leader:d.leader,cards:d.main}),false);}assert.equal(calls.length,0);}));
