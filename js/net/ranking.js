// Verified season is read-only here: only the authoritative game server records scores.
// Legacy records are available through explicitly requested archive reads; no identity is claimed from them.
const URL = 'https://fwwiwazpivgzfyqhgtsp.supabase.co/rest/v1/';
const KEY = 'sb_publishable_Ks5sPhKPZxt9B2yB4dirsA_3T_b4ims';
const HEAD = { apikey: KEY, 'Content-Type': 'application/json' };

/** A random id for this browser, so one player's games are counted together even with a common name. */
export function playerId() {
  try {
    let id = localStorage.getItem('pchk_pid');
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16));
      localStorage.setItem('pchk_pid', id);
    }
    return id;
  } catch { return '00000000-0000-4000-8000-000000000000'; }
}

/** A local copy of the site: localhost, 127.0.0.1, a *.localhost name or a file opened from disk. `?rank=1` sends anyway. */
export function isLocal(loc = globalThis.location) {
  if (!loc) return false;
  if (/[?&]rank=1\b/.test(loc.search || '')) return false;
  return loc.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\])$|\.localhost$/.test(loc.hostname || '');
}

// Client simulations and bot results are local only. Verified scores are written by Room.
export async function submitResult() { return false; }
export const VERIFIED_SEASON = 'verified-20261105';
export const VERIFIED_SEASON_TITLE = 'Подтверждённый сезон · 5 ноября 2026';
export function rankingErrorText(error) {
  const code = error?.code || error?.message || error;
  return ({AUTH_REQUIRED:'Для рейтинговой игры войдите в профиль.', AUTH_INVALID:'Сессия входа истекла. Войдите в профиль снова.', AUTH_UNAVAILABLE:'Сервис проверки входа недоступен. Повторите позже: рейтинговая игра пока не начата.', IDENTITY_MISMATCH:'Профиль изменился. Вернитесь в меню и начните подключение заново.', RANKING_DISABLED:'Подтверждённый рейтинг пока недоступен. Можно сыграть обычную партию.'})[code] || 'Подтверждённый рейтинг сейчас недоступен. Проверьте связь и повторите.';
}
/** The private mapping comes from authenticated server verification, never browser pchk_pid. */
export async function loadMyRankingId() {
  const { currentUser } = await import('./account.js');
  const owner = currentUser()?.id;
  if (!owner) return null;
  const { getVerifiedIdentity } = await import('./server.js');
  const verified = await getVerifiedIdentity();
  if (currentUser()?.id !== owner) throw Object.assign(new Error('IDENTITY_MISMATCH'), {code:'IDENTITY_MISMATCH'});
  if (verified.season !== VERIFIED_SEASON || typeof verified.rankingId !== 'string' || !/^[a-f0-9-]{36}$/i.test(verified.rankingId)) throw Object.assign(new Error('AUTH_UNAVAILABLE'),{code:'AUTH_UNAVAILABLE'});
  return verified.rankingId;
}

async function get(path) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(URL + path, { headers: HEAD, signal: controller.signal });
    if (!res.ok) throw new Error('ranking ' + res.status);
    return await res.json();
  } finally { clearTimeout(timer); }
}
/** Players of one mode ('online', 'bot' or 'all' = both added together), best first. */
export async function loadPlayers(mode = 'online', { archive = false } = {}) {
  if (!archive && mode === 'bot') return [];
  const table = archive ? 'leaderboard' : 'verified_leaderboard';
  const season = archive ? '' : `&season=eq.${VERIFIED_SEASON}`;
  let rows;
  if (mode === 'all') {
    const both = await get(`${table}?select=*${season}&order=wins.desc&limit=600`);
    const m = new Map();
    for (const r of both) {
      const p = m.get(r.player_id);
      if (!p) { m.set(r.player_id, { ...r, favGames: r.games }); continue; }
      p.wins += r.wins; p.games += r.games;
      if (r.last_game > p.last_game) { p.last_game = r.last_game; p.player_name = r.player_name; }
      if (r.games > p.favGames) { p.fav_deck = r.fav_deck; p.favGames = r.games; }
    }
    rows = [...m.values()].map((p) => ({ ...p, winrate: p.games ? Math.round((p.wins / p.games) * 100) : 0 }));
  } else rows = await get(`${table}?select=*${season}&mode=eq.${encodeURIComponent(mode)}&order=wins.desc,winrate.desc&limit=300`);
  // Games played without a name (the default «Игрок», «Игрок 1»…) are not shown in the world ranking.
  rows = rows.filter((r) => r.player_name && !/^Игрок( \d)?$/.test(String(r.player_name).trim()));
  return rows.sort((a, b) => b.wins - a.wins || b.winrate - a.winrate || a.games - b.games);
}
/** Everyone with league points and league (see js/ui/leagues.js), best first. */
export async function loadLeagues({ archive = false } = {}) {
  const { rankPlayers } = await import('../ui/leagues.js');
  const rows = (await get(`${archive ? 'leaderboard' : 'verified_leaderboard'}?select=*${archive ? '' : `&season=eq.${VERIFIED_SEASON}`}&limit=3000`)).filter((r) => r.player_name && !/^Игрок( \d)?$/.test(String(r.player_name).trim()));
  return rankPlayers(rows);
}
/** Decks of one mode: games, wins and leader, counted from the latest results. */
export async function loadDecks(mode = 'online', { archive = false } = {}) {
  if (!archive && mode === 'bot') return [];
  const rows = await get(`${archive ? 'results' : 'verified_results_public'}?select=deck,leader,won${archive ? '' : `&season=eq.${VERIFIED_SEASON}`}${mode === 'all' ? '' : `&mode=eq.${encodeURIComponent(mode)}`}&order=created_at.desc&limit=1000`);
  const m = new Map();
  for (const r of rows) {
    const d = m.get(r.deck) || { deck: r.deck, leader: r.leader, games: 0, wins: 0 };
    d.games++; if (r.won) d.wins++;
    m.set(r.deck, d);
  }
  return [...m.values()].sort((a, b) => b.wins / b.games - a.wins / a.games || b.games - a.games);
}
/** Every card: in how many finished games it was in the deck and how many of them were won (needs tools/cards_stats.sql). */
export async function loadCardStats() {
  const rows = await get(`verified_card_winrate?select=card,games,wins&season=eq.${VERIFIED_SEASON}&limit=1000`);
  return new Map(rows.map((r) => [r.card, { games: r.games, wins: r.wins }]));
}
/** Колоды сообщества (needs tools/community_decks.sql). */
export async function loadCommunityDecks() {
  return get('community_decks?select=id,created_at,author,name,leader,cards&order=created_at.desc&limit=200');
}
export async function publishDeck(d, author) {
  const res = await fetch(URL + 'community_decks', { method: 'POST', headers: { ...HEAD, Prefer: 'return=minimal' },
    body: JSON.stringify({ player_id: playerId(), author: String(author || 'Игрок').slice(0, 24), name: String(d.name || 'Колода').slice(0, 40), leader: d.leader, cards: d.cards.slice(0, 80) }) });
  return res.ok;
}



