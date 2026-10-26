// Leagues of the world ranking: Бронза → Серебро → Золото → Платина → Челленджер.
// Points are counted from the games already in the ranking (no extra table): everyone starts with 1000,
// a ranked online game gives +25 for a win and −20 for a loss, a game against the computer +8 / −6.
// Челленджер is not a threshold but the top ten players with at least 1600 points.
// (no UI imports: the ranking code and the tests load this file)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const START = 1000;
export const LEAGUES = [
  { key: 'bronze', name: 'Бронза', min: 0, c1: '#f3c08d', c2: '#a8622c', c3: '#5a2e10' },
  { key: 'silver', name: 'Серебро', min: 1100, c1: '#f4f6fa', c2: '#9aa4b4', c3: '#4a5260' },
  { key: 'gold', name: 'Золото', min: 1250, c1: '#fff1a8', c2: '#e2a92c', c3: '#7a4a08' },
  { key: 'platinum', name: 'Платина', min: 1450, c1: '#d9fff6', c2: '#4fc3b0', c3: '#165a52' },
  { key: 'challenger', name: 'Челленджер', min: 1600, c1: '#ffe9ff', c2: '#b04ee0', c3: '#3c0f5a' },
];
export const CHALLENGERS = 10;
const POINTS = { online: [25, -20], bot: [8, -6] };

/** Points from one player's rows of the leaderboard view ({ mode, wins, games }). */
export function pointsOf(rows) {
  let p = START;
  for (const r of rows) { const [w, l] = POINTS[r.mode] || [0, 0]; p += r.wins * w + (r.games - r.wins) * l; }
  return Math.max(0, p);
}
/** League of a player: by points, and Челленджер only for the top ten above its threshold. */
export function leagueOf(points, place = Infinity) {
  if (points >= LEAGUES[4].min && place < CHALLENGERS) return LEAGUES[4];
  for (let k = 3; k >= 0; k--) if (points >= LEAGUES[k].min) return LEAGUES[k];
  return LEAGUES[0];
}
/** The next league and how far it is (null at the top). */
export function nextLeague(points, lg) {
  const k = LEAGUES.indexOf(lg);
  if (k >= 4) return null;
  const nx = LEAGUES[k + 1], from = lg.min;
  return { league: nx, need: Math.max(0, nx.min - points), share: Math.max(0, Math.min(1, (points - from) / (nx.min - from))) };
}
/** All players with points, league and place (best first). rows: the leaderboard view (one row per player and mode). */
export function rankPlayers(rows) {
  const by = new Map();
  for (const r of rows) {
    const p = by.get(r.player_id) || { player_id: r.player_id, player_name: r.player_name, rows: [], wins: 0, games: 0, last: r.last_game };
    p.rows.push(r); p.wins += r.wins; p.games += r.games;
    if (r.last_game > p.last) { p.last = r.last_game; p.player_name = r.player_name; }
    by.set(r.player_id, p);
  }
  const list = [...by.values()].map((p) => ({ ...p, points: pointsOf(p.rows) })).sort((a, b) => b.points - a.points || b.wins - a.wins);
  list.forEach((p, k) => { p.place = k; p.league = leagueOf(p.points, k); });
  return list;
}

/** The league emblem: a shield with the league's metal; the Challenger one wears a crown. */
export function emblem(lg, size = 40) {
  const id = 'lg' + lg.key + size;
  const crown = lg.key === 'challenger'
    ? `<path d="M14 9 L18 3 L22 8 L26 1 L30 8 L34 3 L38 9 Z" fill="url(#${id}g)" stroke="${lg.c3}" stroke-width="1.2"/>`
    : '';
  const stars = { bronze: 1, silver: 2, gold: 3, platinum: 4, challenger: 5 }[lg.key];
  const dots = Array.from({ length: stars }, (_, k) => `<circle cx="${26 + (k - (stars - 1) / 2) * 5.2}" cy="45" r="1.7" fill="${lg.c1}"/>`).join('');
  return `<svg class="lg-emb" width="${size}" height="${size * 1.15}" viewBox="0 0 52 60" aria-label="${esc(lg.name)}"><defs>
    <linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lg.c1}"/><stop offset=".55" stop-color="${lg.c2}"/><stop offset="1" stop-color="${lg.c3}"/></linearGradient>
    <linearGradient id="${id}i" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${lg.c3}"/><stop offset="1" stop-color="#140a04"/></linearGradient></defs>
    ${crown}
    <path d="M26 10 L46 16 L44 36 Q40 50 26 57 Q12 50 8 36 L6 16 Z" fill="url(#${id}g)" stroke="#160c06" stroke-width="2"/>
    <path d="M26 15 L41 19.5 L39.5 35 Q36 45.5 26 51 Q16 45.5 12.5 35 L11 19.5 Z" fill="url(#${id}i)"/>
    <path d="M26 20 L29 29 L38 29 L31 34.5 L33.5 43 L26 38 L18.5 43 L21 34.5 L14 29 L23 29 Z" fill="url(#${id}g)" opacity=".95"/>
    ${dots}</svg>`;
}
/** A small «emblem + name» label. */
export function leagueTag(lg, size = 22) { return `<span class="lg-tag lg-${lg.key}">${emblem(lg, size)}<b>${esc(lg.name)}</b></span>`; }
