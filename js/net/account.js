// Accounts: sign up with e-mail + password (Supabase Auth, free). The profile (name, decks, awards, games, daily task)
// is kept in the «profiles» table (tools/profiles.sql), so it is the same on every device.
// The ranking id (pchk_pid) is stored in the profile too: on a new device the player keeps their place in the ranking.
const BASE = 'https://fwwiwazpivgzfyqhgtsp.supabase.co';
const KEY = 'sb_publishable_Ks5sPhKPZxt9B2yB4dirsA_3T_b4ims';
const AUTH = 'pchk_auth';
const SYNC = ['pchk_name', 'pchk_pid', 'pchk_decks', 'pchk_ach', 'pchk_stats', 'pchk_daily', 'pchk_botlvl'];

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const json = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch { return d; } };

let session = json(ls.get(AUTH), null); // { access_token, refresh_token, expires_at, user: { id, email } }
const listeners = new Set();
const saveSession = (s) => { session = s; ls.set(AUTH, s ? JSON.stringify(s) : null); listeners.forEach((f) => f(s)); };

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
  if (!res.ok) throw new Error(why(d));
  return d;
}
const keep = (d) => saveSession({ access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + (d.expires_in || 3600) * 1000, user: { id: d.user.id, email: d.user.email } });

/** A fresh access token (refreshed a minute before it runs out), or null when signed out. */
async function token() {
  if (!session) return null;
  if (Date.now() < session.expires_at - 60000) return session.access_token;
  try { keep(await auth('token?grant_type=refresh_token', { refresh_token: session.refresh_token })); return session.access_token; } catch { saveSession(null); return null; }
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
  for (const d of A('pchk_decks', [])) if (!decks.some((x) => x.name === d.name && JSON.stringify(x.cards) === JSON.stringify(d.cards))) decks.push(d);
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

async function rest(method, path, body) {
  const t = await token();
  if (!t) throw new Error('signed out');
  const res = await fetch(`${BASE}/rest/v1/${path}`, { method, headers: { apikey: KEY, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' }, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error('profile ' + res.status);
  return res.json();
}

let pushTimer = 0;
/** Send this browser's profile to the account (a few seconds after the last change). */
export function savePush() {
  if (!session) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { rest('POST', 'profiles', { user_id: session.user.id, data: localData(), updated_at: new Date().toISOString() }).catch(() => {}); }, 2500);
}

/** Bring the account's profile into this browser (merged with what is here) and save the result back. */
export async function pull() {
  if (!session) return false;
  const rows = await rest('GET', `profiles?user_id=eq.${session.user.id}&select=data`);
  const merged = merge(localData(), rows[0]?.data || {});
  for (const k of SYNC) ls.set(k, merged[k] ?? null);
  await rest('POST', 'profiles', { user_id: session.user.id, data: merged, updated_at: new Date().toISOString() });
  return true;
}

export async function signUp(email, password) {
  const d = await auth('signup', { email, password });
  if (!d.access_token) return { confirm: true }; // the project asks to confirm the e-mail first
  keep(d); await pull(); return { ok: true };
}
export async function signIn(email, password) {
  keep(await auth('token?grant_type=password', { email, password }));
  await pull(); return { ok: true };
}
export async function signOut() {
  const t = session?.access_token;
  saveSession(null);
  if (t) fetch(`${BASE}/auth/v1/logout`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${t}` } }).catch(() => {});
}

// Keep the account up to date: when the tab is hidden or closed, and whenever the game stores something we sync.
if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && session) rest('POST', 'profiles', { user_id: session.user.id, data: localData(), updated_at: new Date().toISOString() }).catch(() => {}); });
  try {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { orig.call(this, k, v); if (this === window.localStorage && SYNC.includes(k)) savePush(); };
  } catch { /* old browser */ }
  if (session) pull().catch(() => {});
}
