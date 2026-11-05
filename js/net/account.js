// Accounts: sign up with e-mail + password (Supabase Auth, free). The profile (name, decks, awards, games, daily task)
// is kept in the «profiles» table (tools/profiles.sql), so it is the same on every device.
// The ranking id (pchk_pid) is stored in the profile too: on a new device the player keeps their place in the ranking.
const BASE = 'https://fwwiwazpivgzfyqhgtsp.supabase.co';
const KEY = 'sb_publishable_Ks5sPhKPZxt9B2yB4dirsA_3T_b4ims';
const AUTH = 'pchk_auth';
const SYNC = ['pchk_name', 'pchk_pid', 'pchk_decks', 'pchk_ach', 'pchk_stats', 'pchk_daily', 'pchk_botlvl', 'pchk_avatar', 'pchk_back'];

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const json = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch { return d; } };

const OWNER = 'pchk_profile_owner', PROFILE = 'pchk_profile:', GUEST = 'guest';
let syncing = false, revision = 0, authAttempt = 0, ready = false, pushTimer = 0, refreshFlight = null, pullFlight = null;
let session = json(ls.get(AUTH), null); // { access_token, refresh_token, expires_at, user: { id, email } }
const listeners = new Set();
const notify = () => listeners.forEach(f => { try { f(session); } catch { /* a view must not break account storage */ } });
const owner = () => session?.user?.id || GUEST;
function cacheLocal() { const id=ls.get(OWNER); if (id) ls.set(PROFILE+id,JSON.stringify(localData())); }
function switchOwner(id) {
  cacheLocal();
  const data=json(ls.get(PROFILE+id),{});
  syncing=true;
  try { for(const k of SYNC) ls.set(k,data[k]??null); ls.set(OWNER,id); } finally { syncing=false; }
}
function replaceSession(next) {
  clearTimeout(pushTimer); revision++; ready=false; refreshFlight=null; pullFlight=null;
  switchOwner(next?.user?.id || GUEST);
  session=next; ls.set(AUTH,next?JSON.stringify(next):null); notify();
}
// Legacy storage is attributed to the signed-in user, never imported into a different account.
if (!ls.get(OWNER)) ls.set(OWNER,owner());
else if(ls.get(OWNER)!==owner()) switchOwner(owner());
const scope = () => ({ id:session?.user?.id, revision });
const active = c => !!c?.id && c.revision===revision && session?.user?.id===c.id && ls.get(OWNER)===c.id && json(ls.get(AUTH),null)?.user?.id===c.id;
const changed = () => new Error('Учётная запись изменилась. Повторите действие.');

export const currentUser = () => session?.user || null;
export const onAuth = (f) => { listeners.add(f); return () => listeners.delete(f); };

/** Russian text for the usual Supabase Auth errors. */
function why(e) {
  const m = String(e?.msg || e?.message || e?.error_description || e || '');
  if (/invalid login/i.test(m)) return 'Неверная почта или пароль.';
  if (/already registered|already exists/i.test(m)) return 'Эта почта уже зарегистрирована — нажмите «Войти».';
  if (/password/i.test(m) && /(6|short|least)/i.test(m)) return 'Пароль слишком короткий: нужно не меньше 6 символов.';
  if (/email.*(invalid|valid)/i.test(m)) return 'Проверьте адрес почты.';
  if (/not confirmed/i.test(m)) return 'Почта ещё не подтверждена — откройте письмо со ссылкой.';
  if (/rate|too many/i.test(m)) return 'Слишком много попыток. Подождите минуту.';
  return 'Не получилось: ' + (m || 'нет связи с сервером');
}

async function auth(path, body) {
  const res = await fetch(`${BASE}/auth/v1/${path}`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) { const e=new Error(why(d)); e.status=res.status; throw e; }
  return d;
}
const kept = d => ({ access_token:d.access_token,refresh_token:d.refresh_token,expires_at:Date.now()+(d.expires_in||3600)*1000,user:{id:d.user.id,email:d.user.email} });

/** One refresh request per session; late replies cannot revive an account after logout. */
async function token(c) {
  if(!active(c)) return null;
  if(Date.now()<session.expires_at-60000) return session.access_token;
  if(refreshFlight?.revision===c.revision) return refreshFlight.promise;
  const refresh=session.refresh_token;
  const flight={revision:c.revision};
  flight.promise=(async()=>{
    try {
      const d=await auth('token?grant_type=refresh_token',{refresh_token:refresh});
      if(!active(c)) return null;
      if(d.user?.id!==c.id) throw new Error('Неверный пользователь при обновлении сессии');
      session=kept(d);ls.set(AUTH,JSON.stringify(session));return session.access_token;
    } catch(e) {
      // Network/5xx failures keep this user's offline progress and session for a retry.
      if(active(c) && [400,401,403].includes(e.status)) { authAttempt++; replaceSession(null); }
      return null;
    } finally { if(refreshFlight===flight) refreshFlight=null; }
  })();
  refreshFlight=flight;return flight.promise;
}

// ---------- profile sync ----------
function localData() { const o = {}; for (const k of SYNC) { const v = ls.get(k); if (v != null) o[k] = v; } return o; }
/** Join what this browser has with what the account has: nothing played on either side is lost. */
function merge(mine, theirs) {
  const out = { ...mine, ...theirs };
  const A = (k, d) => json(mine[k], d), B = (k, d) => json(theirs[k], d);
  if (theirs.pchk_pid) out.pchk_pid = theirs.pchk_pid; else if (mine.pchk_pid) out.pchk_pid = mine.pchk_pid;
  out.pchk_name = theirs.pchk_name && json(theirs.pchk_name, '') ? theirs.pchk_name : mine.pchk_name ?? theirs.pchk_name;
  const decks = [...B('pchk_decks', [])];
  for (const d of A('pchk_decks', [])) if (!decks.some((x) => x.name === d.name && x.leader === d.leader && JSON.stringify(x.cards) === JSON.stringify(d.cards))) decks.push(d);
  out.pchk_decks = JSON.stringify(decks);
  const ach = { ...A('pchk_ach', {}) };
  for (const [k, t] of Object.entries(B('pchk_ach', {}))) ach[k] = ach[k] ? Math.min(ach[k], t) : t;
  out.pchk_ach = JSON.stringify(ach);
  const games = new Map();
  for (const g of [...B('pchk_stats', []), ...A('pchk_stats', [])]) games.set(`${g.at}|${g.myLeader}|${g.oppLeader}`, g);
  out.pchk_stats = JSON.stringify([...games.values()].sort((a, b) => a.at - b.at).slice(-500));
  const da = A('pchk_daily', {}), db = B('pchk_daily', {});
  out.pchk_daily = JSON.stringify((db.total || 0) >= (da.total || 0) ? db : da);
  for (const k of Object.keys(out)) if (out[k] == null) delete out[k];
  return out;
}

async function rest(method,path,body,c=scope()) {
  const t=await token(c);
  if(!t || !active(c)) throw changed();
  const res=await fetch(`${BASE}/rest/v1/${path}`,{method,headers:{apikey:KEY,Authorization:`Bearer ${t}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},body:body?JSON.stringify(body):undefined});
  if(!active(c)) throw changed();
  if(!res.ok) throw new Error('profile '+res.status);
  return res.json();
}
function upload(c) {
  if(!active(c) || !ready) return Promise.resolve(false);
  cacheLocal();
  return rest('POST','profiles',{user_id:c.id,data:localData(),updated_at:new Date().toISOString()},c);
}
/** Cache locally immediately; bind delayed writes to this exact login. */
export function savePush() {
  if(syncing || ls.get(OWNER)!==owner()) return;
  cacheLocal();clearTimeout(pushTimer);
  if(!session) return;
  const c=scope();pushTimer=setTimeout(()=>{ if(active(c)) (ready ? upload(c) : pull()).catch(()=>{}); },2500);
}
/** Merge only this account's cached profile with its cloud profile. Guest progress stays separate. */
export async function pull() {
  if(!session) return false;
  const c=scope();if(!active(c)) return false;
  if(pullFlight?.revision===c.revision) return pullFlight.promise;
  const flight={revision:c.revision};
  flight.promise=(async()=>{
    try {
      const rows=await rest('GET',`profiles?user_id=eq.${c.id}&select=data`,undefined,c);
      if(!active(c)) throw changed();
      const merged=merge(localData(),rows[0]?.data||{});
      syncing=true;try{for(const k of SYNC)ls.set(k,merged[k]??null);}finally{syncing=false;}
      cacheLocal();
      await rest('POST','profiles',{user_id:c.id,data:merged,updated_at:new Date().toISOString()},c);
      if(!active(c)) throw changed();
      ready=true;if(JSON.stringify(localData())!==JSON.stringify(merged))savePush();
      return true;
    } finally {if(pullFlight===flight)pullFlight=null;}
  })();pullFlight=flight;return flight.promise;
}
async function login(path,email,password) {
  const attempt=++authAttempt,d=await auth(path,{email,password});
  if(attempt!==authAttempt)throw changed();
  if(!d.access_token)return {confirm:true};
  replaceSession(kept(d));await pull();return {ok:true};
}
export const signUp=(email,password)=>login('signup',email,password);
export const signIn=(email,password)=>login('token?grant_type=password',email,password);
export async function signOut() {
  const t=session?.access_token;authAttempt++;replaceSession(null);
  if(t)fetch(`${BASE}/auth/v1/logout`,{method:'POST',headers:{apikey:KEY,Authorization:`Bearer ${t}`}}).catch(()=>{});
}

if(typeof window!=='undefined') {
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden' && session)(ready ? upload(scope()) : pull()).catch(()=>{});});
  try {
    const orig=Storage.prototype.setItem;
    Storage.prototype.setItem=function(k,v){orig.call(this,k,v);if(this===window.localStorage && SYNC.includes(k))savePush();};
  }catch{/* old browser */}
  // Other tabs share localStorage: invalidate their old operations before observing the new login.
  window.addEventListener('storage',e=>{if(e.key===AUTH){clearTimeout(pushTimer);authAttempt++;revision++;ready=false;session=json(ls.get(AUTH),null);refreshFlight=null;pullFlight=null;notify();if(session)pull().catch(()=>{});}});
  if(session)pull().catch(()=>{});
}
