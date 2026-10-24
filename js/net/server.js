// Online play through the game server (Cloudflare). The server runs the game; this page only shows it and answers.
// Until SERVER is set (after the server is published) the site keeps using direct browser-to-browser play (online.js).
// For testing: ?server=http://127.0.0.1:8787 (remembered in this browser; ?server=off forgets it).
const SERVER = '';

function base() {
  try {
    const q = new URLSearchParams(location.search).get('server');
    if (q === 'off') localStorage.removeItem('pchk_server');
    else if (q && /^https?:\/\/[\w.:-]+$/.test(q)) localStorage.setItem('pchk_server', q);
    return localStorage.getItem('pchk_server') || SERVER;
  } catch { return SERVER; }
}
export const serverOn = () => !!base();
const wsUrl = (path) => base().replace(/^http/, 'ws') + path;

export async function newRoomCode() {
  const r = await fetch(base() + '/api/new');
  return (await r.json()).code;
}

/**
 * A room connection that comes back by itself after a drop (the seat is kept with a token stored in this browser).
 * handlers: onMessage(msg), onState(text) — «Соединение потеряно, переподключаемся…» and so on.
 */
export function connectRoom(code, hello, { onMessage, onState } = {}) {
  const key = 'pchk_tok_' + code;
  let ws = null, closed = false, tries = 0;
  const open = () => {
    ws = new WebSocket(wsUrl('/ws/room/' + code));
    ws.onopen = () => {
      tries = 0;
      // This tab's seat key first; a key from another tab of this browser only counts if that tab is gone.
      let token = null, maybe = false;
      try { token = sessionStorage.getItem(key); if (!token) { token = localStorage.getItem(key); maybe = !!token; } } catch { /* private mode */ }
      ws.send(JSON.stringify({ t: 'hello', ...hello, token, maybe }));
      onState && onState(null);
    };
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'seat') { try { sessionStorage.setItem(key, m.token); localStorage.setItem(key, m.token); } catch { /* private mode */ } }
      if (m.t === 'busy' || m.t === 'error') closed = true; // no point in retrying
      onMessage && onMessage(m);
    };
    ws.onclose = () => {
      if (closed) return;
      tries++;
      onState && onState(tries > 6 ? 'Нет связи с сервером. Проверьте интернет.' : 'Связь потеряна — переподключаемся…');
      setTimeout(open, Math.min(8000, 600 * tries));
    };
  };
  open();
  return {
    code,
    send(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); },
    close() { closed = true; try { ws.close(); } catch { /* ignore */ } },
  };
}

/** «Найти соперника»: waits in the queue; onMatch(code, opponentName), onQueue(n). */
export function findMatch(name, { onMatch, onQueue, onError } = {}) {
  const ws = new WebSocket(wsUrl('/ws/lobby'));
  let done = false;
  ws.onopen = () => ws.send(JSON.stringify({ t: 'find', name }));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'queue') onQueue && onQueue(m.n);
    if (m.t === 'match') { done = true; onMatch && onMatch(m.code, m.vs); }
  };
  ws.onerror = () => onError && onError();
  return { cancel() { done = true; try { ws.close(); } catch { /* ignore */ } }, get matched() { return done; } };
}
