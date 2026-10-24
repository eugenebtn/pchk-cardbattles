// Online play over WebRTC (PeerJS). The host runs the engine; the guest only renders and answers.
const PREFIX = 'pchk-cb-';

function randomId() {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}
function newPeer(id) {
  // eslint-disable-next-line no-undef
  return new Peer(id, { debug: 1, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }] } });
}

/**
 * Host side: one guest player plus any number of watchers (up to MAX_WATCHERS).
 * Callbacks: onGuest(conn, hello), onMessage(msg), onClose(), onWatcher(conn, hello), onWatcherMessage(conn, msg), onWatchersChange(n).
 */
const MAX_WATCHERS = 12;
export function hostRoom({ onOpen, onGuest, onMessage, onClose, onError, onWatcher, onWatcherMessage, onWatchersChange }) {
  const code = randomId();
  const peer = newPeer(PREFIX + code);
  let conn = null;
  const watchers = new Set();
  const changed = () => onWatchersChange && onWatchersChange(watchers.size);
  peer.on('open', () => onOpen && onOpen(code));
  peer.on('error', (e) => onError && onError(e));
  peer.on('connection', (c) => {
    let role = null;
    c.on('data', (msg) => {
      if (!role) {
        if (msg?.t !== 'hello') return;
        if (msg.watch) {
          if (watchers.size >= MAX_WATCHERS) { c.send({ t: 'error', text: 'Слишком много зрителей — попробуйте позже.' }); setTimeout(() => c.close(), 300); return; }
          role = 'watch'; watchers.add(c); changed(); onWatcher && onWatcher(c, msg); return;
        }
        if (conn && conn.open && conn !== c) { c.send({ t: 'busy' }); setTimeout(() => c.close(), 300); return; }
        role = 'player'; conn = c; onGuest && onGuest(c, msg); return;
      }
      if (role === 'watch') onWatcherMessage && onWatcherMessage(c, msg);
      else onMessage && onMessage(msg);
    });
    c.on('close', () => {
      if (role === 'watch') { watchers.delete(c); changed(); }
      if (role === 'player' && conn === c) { conn = null; onClose && onClose(); }
    });
  });
  return {
    code,
    send(msg) { if (conn && conn.open) conn.send(msg); },
    sendWatchers(msg, except = null) { for (const w of watchers) if (w !== except && w.open) w.send(msg); },
    get watcherCount() { return watchers.size; },
    get connected() { return !!(conn && conn.open); },
    close() { try { peer.destroy(); } catch (e) { /* ignore */ } },
  };
}

/** Guest side. */
export function joinRoom(code, hello, { onOpen, onMessage, onClose, onError }) {
  const peer = newPeer();
  let conn = null;
  peer.on('error', (e) => onError && onError(e));
  peer.on('open', () => {
    conn = peer.connect(PREFIX + code, { reliable: true });
    conn.on('open', () => { conn.send({ t: 'hello', ...hello }); onOpen && onOpen(); });
    conn.on('data', (msg) => onMessage && onMessage(msg));
    conn.on('close', () => onClose && onClose());
    conn.on('error', (e) => onError && onError(e));
  });
  return {
    send(msg) { if (conn && conn.open) conn.send(msg); },
    close() { try { peer.destroy(); } catch (e) { /* ignore */ } },
  };
}
