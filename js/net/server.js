// WSS credentials are confined to handshake/authenticate messages, never URLs or saved room state.
import {getAccessToken,currentUser,onAuth} from './account.js';
const SERVER='https://pchk-cardbattles.eugenebtn.workers.dev';
const loopback=host=>['localhost','127.0.0.1','[::1]','::1'].includes(host);
function base(){
 try{
  const q=new URLSearchParams(location.search).get('server');if(q==='off')localStorage.removeItem('pchk_server');
  const candidate=q&&q!=='off'?q:localStorage.getItem('pchk_server');
  if(candidate){const u=new URL(candidate),pinned=new URL(SERVER);
   if(!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/'){
    if(u.origin===pinned.origin)return pinned.origin;
    if(loopback(location.hostname)&&loopback(u.hostname)&&['http:','https:'].includes(u.protocol)){localStorage.setItem('pchk_server',u.origin);return u.origin;}
   }
  }
 }catch{}
 return SERVER;
}
export const serverOn=()=>!!base();
const wsUrl=path=>base().replace(/^http/,'ws')+path;
const userId=()=>currentUser()?.id||null;
const authFailure=(code='AUTH_REQUIRED')=>({t:'authError',code,retryable:code==='AUTH_UNAVAILABLE'});
export async function newRoomCode(){const r=await fetch(base()+'/api/new');return(await r.json()).code;}
export async function getVerifiedIdentity(){
 const owner=userId(),accessToken=await getAccessToken();
 if(!owner||!accessToken||userId()!==owner){const code=userId()!==owner?'IDENTITY_MISMATCH':currentUser()?'AUTH_UNAVAILABLE':'AUTH_REQUIRED';const e=new Error(code);e.code=code;e.retryable=code==='AUTH_UNAVAILABLE';throw e;}
 const r=await fetch(base()+'/api/identity',{headers:{Authorization:`Bearer ${accessToken}`},signal:AbortSignal.timeout(10000)});
 const data=await r.json();if(userId()!==owner){const e=new Error('IDENTITY_MISMATCH');e.code='IDENTITY_MISMATCH';throw e;}
 if(!r.ok){const e=new Error(data.code||'AUTH_UNAVAILABLE');e.code=data.code||'AUTH_UNAVAILABLE';e.retryable=!!data.retryable;throw e;}
 return {rankingId:data.rankingId,season:data.season};
}
function connection(path,key,hello,{onMessage,onState,onAuthError}={}){
 const owner=userId();let ws=null,closed=false,retry=0,tries=0,sends=Promise.resolve(),lastAccessToken=null;
 const stop=()=>{closed=true;clearTimeout(retry);unsubscribe();if(typeof document!=='undefined')document.removeEventListener('visibilitychange',back);try{ws?.close();}catch{}};
 const fail=m=>{onAuthError?.(m);onMessage?.(m);stop();};
 const unsubscribe=onAuth(()=>{if(userId()!==owner)fail(authFailure('IDENTITY_MISMATCH'));});
 const credentials=async()=>{const accessToken=await getAccessToken();if(closed)return null;if(userId()!==owner){fail(authFailure('IDENTITY_MISMATCH'));return null;}if(owner&&!accessToken){fail(authFailure(currentUser()?'AUTH_UNAVAILABLE':'AUTH_REQUIRED'));return null;}return {accessToken};};
 const open=()=>{
  clearTimeout(retry);const socket=new WebSocket(wsUrl(path));ws=socket;
  socket.onopen=async()=>{
   const proof=await credentials();if(!proof||ws!==socket)return;tries=0;
   let token=null,maybe=false;try{token=sessionStorage.getItem(key);if(!token){token=localStorage.getItem(key);maybe=!!token;}}catch{}
   const {playerId:legacy,accessToken:stale,...safeHello}=hello;
   socket.send(JSON.stringify({t:'hello',...safeHello,...proof,token,maybe}));lastAccessToken=proof.accessToken;onState?.(null);
  };
  socket.onmessage=e=>{
   if(ws!==socket||closed)return;let m;try{m=JSON.parse(e.data);}catch{return;}
   if(!m||typeof m!=='object')return;
   if(m.t==='authError'){fail(m);return;}
   if((m.t==='seat'||m.t==='you')&&m.token)try{sessionStorage.setItem(key,m.token);localStorage.setItem(key,m.token);}catch{}
   if(m.t==='busy'||m.t==='error'){onMessage?.(m);stop();return;}
   onMessage?.(m);
  };
  socket.onclose=()=>{if(closed||ws!==socket)return;tries++;onState?.('Связь потеряна — переподключаемся…');retry=setTimeout(open,Math.min(8000,600*tries));};
 };
 const back=()=>{if(!document.hidden&&!closed&&ws?.readyState>1)open();};
 if(typeof document!=='undefined')document.addEventListener('visibilitychange',back);open();
 return {send(m){sends=sends.then(async()=>{
   const socket=ws;if(closed||socket?.readyState!==1)return false;
   const proof=await credentials();if(!proof||socket!==ws)return false;
   if(proof.accessToken&&proof.accessToken!==lastAccessToken&&['answer','rematch','autopass','start'].includes(m.t)){socket.send(JSON.stringify({t:'authenticate',...proof}));lastAccessToken=proof.accessToken;}
   socket.send(JSON.stringify(m));return true;
  }).catch(()=>{fail(authFailure('AUTH_UNAVAILABLE'));return false;});return sends;},close:stop};
}
export function connectRoom(code,hello,handlers={}){return {code,...connection('/ws/room/'+code,'pchk_tok_'+code,hello,handlers)};}
export function connectTour(code,hello,onMessage,handlers={}){return {code,...connection('/ws/tour/'+code,'pchk_tour_'+code,hello,{...handlers,onMessage})};}
export function findMatch(name,{onMatch,onQueue,onError,onAuthError,rated=true,deck}={}){
 const owner=userId(),ws=new WebSocket(wsUrl('/ws/lobby'));let done=false,closed=false;
 const cancel=()=>{closed=true;unsubscribe();try{ws.close();}catch{}};
 const failed=m=>{onAuthError?.(m);onError?.(m.code);cancel();};
 const unsubscribe=onAuth(()=>{if(userId()!==owner)failed(authFailure('IDENTITY_MISMATCH'));});
 ws.onopen=async()=>{const accessToken=await getAccessToken();if(closed)return;if(userId()!==owner){failed(authFailure('IDENTITY_MISMATCH'));return;}if(rated&&!accessToken){failed(authFailure(currentUser()?'AUTH_UNAVAILABLE':'AUTH_REQUIRED'));return;}ws.send(JSON.stringify({t:'find',name,rated,deck,accessToken}));};
 ws.onmessage=e=>{if(closed)return;let m;try{m=JSON.parse(e.data);}catch{return;}if(m?.t==='authError'){failed(m);return;}if(m?.t==='error'){onError?.(m.text);cancel();}if(m?.t==='queue')onQueue?.(m.n);if(m?.t==='match'){done=true;onMatch?.(m.code,m.vs);cancel();}};
 ws.onerror=()=>onError?.();return {cancel,get matched(){return done;}};
}
export async function roomStatus(code){try{const r=await fetch(`${base()}/api/room/${code}`);return r.ok?(await r.json()).state:null;}catch{return null;}}
export function hasSeat(code){try{return !!sessionStorage.getItem('pchk_tok_'+code)||!!localStorage.getItem('pchk_tok_'+code);}catch{return false;}}
