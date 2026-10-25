// Friends: added by a link (?friend=<code>), kept in this browser. The game server tells who is online and in which game.
// A player is known only by a public friend code: a short hash of the browser's own id (the id itself is never shown).
import { playerId } from './ranking.js';

const SERVER = 'https://pchk-cardbattles.eugenebtn.workers.dev';
const KEY = 'pchk_friends';
const base = () => { try { return localStorage.getItem('pchk_server') || SERVER; } catch { return SERVER; } };

/** My public friend code (10 hex characters): a hash of the browser id. Plain JavaScript — crypto.subtle is missing on http pages. */
export async function myFriendCode() {
  const str = 'pchk-friend:' + playerId();
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return ((h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')).slice(0, 10);
}
export function loadFriends() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
function saveFriends(list) { try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 100))); } catch { /* private mode */ } }

/** Adds a friend (and asks the server to add me to theirs). Returns false for my own code or a bad one. */
export async function addFriend(code, name, myName) {
  const me = await myFriendCode();
  if (!/^[0-9a-f]{10}$/.test(code) || code === me) return false;
  const list = loadFriends().filter((f) => f.code !== code);
  list.unshift({ code, name: String(name || 'Друг').slice(0, 24) });
  saveFriends(list);
  try { await fetch(`${base()}/api/befriend`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: me, name: myName, to: code }) }); } catch { /* they add me when they open my link */ }
  return true;
}
export function removeFriend(code) { saveFriends(loadFriends().filter((f) => f.code !== code)); }

let room = null, timer = 0, nameFn = () => '', inviteFn = null;
/** Call a friend into my new room: they see «… зовёт вас в партию» within a minute. */
export async function sendInvite(to, roomCode, myName) {
  try { const r = await fetch(`${base()}/api/invite`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: await myFriendCode(), to, room: roomCode, name: myName }) }); return r.ok; } catch { return false; }
}
/** Tell the server I am here (and in which online game, so friends can watch). Repeats every 20 s and when the tab comes back. */
export function startPresence(getName, onInvite) {
  nameFn = getName; inviteFn = onInvite;
  clearInterval(timer);
  beat(); timer = setInterval(beat, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) beat(); });
}
export function setPresenceRoom(code) { room = code || null; beat(); }
async function beat() {
  if (document.hidden) return;
  try {
    const r = await fetch(`${base()}/api/presence`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: await myFriendCode(), name: nameFn(), room }) });
    const { adds = [], invites = [] } = await r.json();
    for (const i of invites) inviteFn?.(i.room, i.name);
    if (adds.length) { const list = loadFriends(); for (const a of adds) if (!list.some((f) => f.code === a.code)) list.unshift({ code: a.code, name: a.name || 'Друг' }); saveFriends(list); }
  } catch { /* offline */ }
}
/** { code: { online, name, room } } for my friends. */
export async function friendsStatus() {
  const list = loadFriends(); if (!list.length) return {};
  try {
    const r = await fetch(`${base()}/api/presence?codes=${list.map((f) => f.code).join(',')}`);
    const st = r.ok ? await r.json() : {};
    // Keep the friend's real name (one added by a code starts as «Друг»).
    let changed = false;
    for (const f of list) { const n = st[f.code]?.name; if (n && n !== f.name) { f.name = n; changed = true; } }
    if (changed) saveFriends(list);
    return st;
  } catch { return {}; }
}
