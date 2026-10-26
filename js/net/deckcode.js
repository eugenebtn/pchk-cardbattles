// A deck as a short code for a link or a message: no server needed.
// Bytes: version 1, Leader id (2 bytes), then for every card id (2 bytes) its count (1 byte); written as base64url.
import { CARDS } from '../data/cards.js';

const b64 = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => { const t = s.replace(/-/g, '+').replace(/_/g, '/'); return Uint8Array.from(atob(t + '='.repeat((4 - (t.length % 4)) % 4)), (c) => c.charCodeAt(0)); };

/** { leader, cards: [ids] } → «KAQAU…» */
export function encodeDeck(d) {
  const by = new Map();
  for (const id of d.cards) by.set(id, (by.get(id) || 0) + 1);
  const bytes = [1, d.leader >> 8, d.leader & 255];
  for (const [id, n] of [...by].sort((a, b) => a[0] - b[0])) bytes.push(id >> 8, id & 255, n);
  return 'K' + b64(bytes);
}
/** The code back to { leader, cards }, or null when it is broken or has unknown cards. */
export function decodeDeck(code) {
  try {
    const s = String(code || '').trim().replace(/^.*[?&]deck=/, '').replace(/&.*$/, '');
    if (s[0] !== 'K') return null;
    const b = unb64(s.slice(1));
    if (b[0] !== 1 || (b.length - 3) % 3) return null;
    const leader = (b[1] << 8) | b[2];
    if (CARDS[leader]?.type !== 'leader') return null;
    const cards = [];
    for (let k = 3; k < b.length; k += 3) {
      const id = (b[k] << 8) | b[k + 1], n = b[k + 2];
      if (!CARDS[id] || CARDS[id].type === 'leader' || n < 1 || n > 3) return null;
      for (let j = 0; j < n; j++) cards.push(id);
    }
    return cards.length ? { leader, cards } : null;
  } catch { return null; }
}
/** The link that opens this deck in the game: …?deck=<code>&dn=<name> */
export function deckLink(d) {
  return `${location.origin}${location.pathname}?deck=${encodeDeck(d)}&dn=${encodeURIComponent((d.name || '').slice(0, 40))}`;
}
