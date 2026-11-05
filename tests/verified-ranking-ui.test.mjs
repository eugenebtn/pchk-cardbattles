import test from 'node:test';
import assert from 'node:assert/strict';
import {submitResult,loadPlayers,loadDecks,loadLeagues,loadCardStats,loadMyRankingId,VERIFIED_SEASON,rankingErrorText} from '../js/net/ranking.js';

test('Client bot/online simulations cannot write any public score, even outside localhost', async()=>{
  const oldFetch=globalThis.fetch, oldLocation=globalThis.location;let calls=0;
  globalThis.fetch=()=>{calls++;throw Error('write forbidden');};globalThis.location={hostname:'pchk-battles.ru',search:'?rank=1'};
  try{for(const mode of ['bot','online','hotseat'])assert.equal(await submitResult({mode,won:true}),false);assert.equal(calls,0);}finally{globalThis.fetch=oldFetch;globalThis.location=oldLocation;}
});
test('New season reads only verified views with a fixed season; bot results remain local',async()=>{
  const oldFetch=globalThis.fetch,calls=[];globalThis.fetch=async(url,options)=>{calls.push({url:String(url),options});return {ok:true,json:async()=>[]};};
  try{
    await loadPlayers('all');await loadDecks('all');await loadLeagues();await loadCardStats();
    assert.equal(calls.length,4);for(const c of calls){assert.match(c.url,/\/verified_/);assert.ok(c.url.includes('season=eq.'+VERIFIED_SEASON));assert.notEqual(c.options?.method,'POST');}
    calls.length=0;assert.deepEqual(await loadPlayers('bot'),[]);assert.deepEqual(await loadDecks('bot'),[]);assert.equal(calls.length,0);
  }finally{globalThis.fetch=oldFetch;}
});
test('Legacy archive is explicit; verified service failure never falls back to legacy claims',async()=>{
  const oldFetch=globalThis.fetch,calls=[];globalThis.fetch=async url=>{calls.push(String(url));return {ok:true,json:async()=>[]};};
  try{
    await loadPlayers('all',{archive:true});await loadDecks('bot',{archive:true});await loadLeagues({archive:true});
    assert.ok(calls[0].includes('/leaderboard?'));assert.ok(calls[1].includes('/results?'));assert.ok(calls.every(u=>!u.includes('verified_')));
    calls.length=0;globalThis.fetch=async url=>{calls.push(String(url));return {ok:false,status:503};};
    await assert.rejects(loadPlayers('all'));assert.equal(calls.length,1);assert.match(calls[0],/verified_leaderboard/);
  }finally{globalThis.fetch=oldFetch;}
});
test('Guest local ranking UUID is never treated as verified ownership',async()=>{
  const oldStorage=globalThis.localStorage,oldFetch=globalThis.fetch;let calls=0;
  const storage=new Map([['pchk_pid','aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa']]);globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
  globalThis.fetch=()=>{calls++;throw Error('guest must not verify');};
  try{assert.equal(await loadMyRankingId(),null);assert.equal(calls,0);}finally{globalThis.localStorage=oldStorage;globalThis.fetch=oldFetch;}
});
test('Auth failure messages distinguish login, account mismatch and service outage',()=>{
  for(const code of ['AUTH_REQUIRED','AUTH_INVALID','AUTH_UNAVAILABLE','IDENTITY_MISMATCH','RANKING_DISABLED']) assert.ok(rankingErrorText({code}).length>20);
  assert.notEqual(rankingErrorText({code:'AUTH_REQUIRED'}),rankingErrorText({code:'AUTH_UNAVAILABLE'}));
});
