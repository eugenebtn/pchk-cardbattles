import test from 'node:test';
import assert from 'node:assert/strict';
test('Credential transport pins host, protects loopback overrides and reports refresh outage',async()=>{
 const old={fetch:globalThis.fetch,localStorage:globalThis.localStorage,sessionStorage:globalThis.sessionStorage,WebSocket:globalThis.WebSocket,location:globalThis.location};
 const user={id:'11111111-1111-4111-8111-111111111111',email:'A@test.invalid'},auth={user,access_token:'test-user-token',refresh_token:'test-refresh',expires_at:Date.now()+3600000};
 const data=new Map([['pchk_auth',JSON.stringify(auth)]]),calls=[],sockets=[];let refreshFailure=false;
 globalThis.localStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};globalThis.sessionStorage={getItem:()=>null,setItem:()=>{}};
 globalThis.WebSocket=class{constructor(url){this.url=url;this.readyState=1;this.sent=[];sockets.push(this);}send(s){this.sent.push(JSON.parse(s));}close(){this.readyState=3;}};
 globalThis.fetch=async(url,o={})=>{calls.push({url,headers:o.headers,body:o.body});if(url.includes('grant_type=password'))return {ok:true,json:async()=>({...auth,expires_in:1})};if(url.includes('grant_type=refresh_token'))return {ok:!refreshFailure,status:refreshFailure?503:200,json:async()=>refreshFailure?{message:'Unavailable'}:{...auth,expires_in:3600}};if(url.includes('/profiles'))return {ok:true,json:async()=>[]};return {ok:true,json:async()=>({rankingId:'22222222-2222-4222-8222-222222222222',season:'verified-20261105'})};};
 try{
  const server=await import('../js/net/server.js?credential-test');
  for(const malicious of ['https://untrusted.invalid','https://pchk-cardbattles.eugenebtn.workers.dev@untrusted.invalid','http://127.0.0.1:8787']){
   globalThis.location=new URL('https://pchk-battles.ru/?server='+encodeURIComponent(malicious));data.set('pchk_server',malicious);
   await server.getVerifiedIdentity();const c=server.connectRoom('abcdef',{rated:true,playerId:'legacy-id'});await sockets.at(-1).onopen();assert.ok(sockets.at(-1).url.startsWith('wss://pchk-cardbattles.eugenebtn.workers.dev/'));assert.equal(sockets.at(-1).sent[0].playerId,undefined);c.close();
   globalThis.location=new URL('https://pchk-battles.ru/');await server.getVerifiedIdentity();
  }
  assert.ok(calls.every(c=>!c.url.startsWith('https://untrusted.invalid')&&!c.url.startsWith('http://127.0.0.1')));
  globalThis.location=new URL('http://localhost:8766/?server=http://127.0.0.1:8787');await server.getVerifiedIdentity();assert.ok(calls.at(-1).url.startsWith('http://127.0.0.1:8787/'));
  const account=await import('../js/net/account.js');refreshFailure=true;await assert.rejects(account.signIn('A@test.invalid','secret'));assert.equal(account.currentUser().id,user.id);const start=calls.length;await assert.rejects(server.getVerifiedIdentity(),e=>e.code==='AUTH_UNAVAILABLE');assert.ok(calls.slice(start).every(c=>!c.url.includes('/api/identity')));
 }finally{Object.assign(globalThis,old);}
});
