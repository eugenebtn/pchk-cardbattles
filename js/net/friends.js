// Friends: added by a link (?friend=<code>), kept in this browser. The game server tells who is online and in which game.
// A player is known only by a public friend code: a short hash of the browser's own id (the id itself is never shown).
import { playerId } from './ranking.js';

const SERVER = 'https://pchk-cardbattles.eugenebtn.workers.dev';
const KEY = 'pchk_friends';
const base = () => { try { return localStorage.getItem('pchk_server') || SERVER; } catch { return SERVER; } };

let codeP = null;
/** My public friend code (10 hex characters). */
export function myFriendCode() {
  codeP ||= (async () => {
    const data = new TextEncoder().encode('pchk-friend:' + playerId());
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
    return [...h.slice(0, 5)].map((b) => b.toString(16).padStart(2, '0')).join('');
  })();
  return codeP;
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
  try { await fetch(`${base()}/api/invite`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: await myFriendCode(), to, room: roomCode, name: myName }) }); return true; } catch { return false; }
}
/** Tell the server I am here (and in which online game, so friends can watch). Repeats every 45 s. */
export function startPresence(getName, onInvite) {
  nameFn = getName; inviteFn = onInvite;
  clearInterval(timer);
  beat(); timer = setInterval(beat, 45000);
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
  try { const r = await fetch(`${base()}/api/presence?codes=${list.map((f) => f.code).join(',')}`); return r.ok ? await r.json() : {}; } catch { return {}; }
}
