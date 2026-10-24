// Replays: a finished game is kept as its seed, set-up and answers (the engine is deterministic),
// so it can be watched again move by move, or shared as a link.
const KEY = 'pchk_replays';
const MAX = 12;

export function saveReplay(game, meta = {}) {
  try {
    const list = loadReplays();
    list.push({ at: Date.now(), seed: game.seedUsed, cfg: { players: game.cfg.players, options: { ...game.cfg.options, previews: false } }, history: game.history, ...meta });
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch { /* storage full or private mode */ }
}
export function loadReplays() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }

// Links: deflate + base64url of the replay data.
const b64 = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
async function pipe(data, stream) { return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(stream)).arrayBuffer()); }
export async function replayLink(r) {
  const data = JSON.stringify({ s: r.seed, c: r.cfg, h: r.history, t: r.title || '' });
  const z = await pipe(new TextEncoder().encode(data), new CompressionStream('deflate-raw'));
  return `${location.origin}${location.pathname}?replay=${b64(z)}`;
}
export async function readReplayParam(param) {
  const raw = await pipe(unb64(param), new DecompressionStream('deflate-raw'));
  const o = JSON.parse(new TextDecoder().decode(raw));
  return { seed: o.s, cfg: o.c, history: o.h, title: o.t };
}
