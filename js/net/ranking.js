// World ranking: finished games go to a shared Supabase table (free project made by Eugene).
// The publishable key is public by design; the table only allows adding and reading rows (see tools/ranking.sql).
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

/** Send one finished game. Never throws: the ranking must not break the game. */
export async function submitResult(r) {
  // Test runs on this computer (local copy of the site, headless screenshots) must not land in the world ranking.
  if (isLocal()) return false;
  try {
    const row = {
      player_id: playerId(), player_name: String(r.name || 'Игрок').slice(0, 24), deck: String(r.deck || '').slice(0, 40), leader: r.leader ?? null,
      opponent_name: r.oppName ? String(r.oppName).slice(0, 24) : null, opponent_deck: r.oppDeck ? String(r.oppDeck).slice(0, 40) : null,
      mode: r.mode, won: !!r.won, rounds: Math.max(0, Math.min(200, r.rounds | 0)),
    };
    const cards = Array.isArray(r.cards) ? r.cards.filter(Number.isInteger).slice(0, 80) : null;
    const send = (body) => fetch(URL + 'results', { method: 'POST', headers: { ...HEAD, Prefer: 'return=minimal' }, body: JSON.stringify(body) });
    let res = await send(cards?.length ? { ...row, cards } : row);
    // Before tools/cards_stats.sql is run the table has no «cards» column: send without it.
    if (!res.ok && cards?.length && res.status === 400) res = await send(row);
    return res.ok;
  } catch { return false; }
}

async function get(path) {
  const res = await fetch(URL + path, { headers: HEAD });
  if (!res.ok) throw new Error('ranking ' + res.status);
  return res.json();
}
/** Players of one mode ('online', 'bot' or 'all' = both added together), best first. */
export async function loadPlayers(mode) {
  let rows;
  if (mode === 'all') {
    const both = await get('leaderboard?select=*&order=wins.desc&limit=600');
    const m = new Map();
    for (const r of both) {
      const p = m.get(r.player_id);
      if (!p) { m.set(r.player_id, { ...r, favGames: r.games }); continue; }
      p.wins += r.wins; p.games += r.games;
      if (r.last_game > p.last_game) { p.last_game = r.last_game; p.player_name = r.player_name; }
      if (r.games > p.favGames) { p.fav_deck = r.fav_deck; p.favGames = r.games; }
    }
    rows = [...m.values()].map((p) => ({ ...p, winrate: p.games ? Math.round((p.wins / p.games) * 100) : 0 }));
  } else rows = await get(`leaderboard?select=*&mode=eq.${encodeURIComponent(mode)}&order=wins.desc,winrate.desc&limit=300`);
  // Games played without a name (the default «Игрок», «Игрок 1»…) are not shown in the world ranking.
  rows = rows.filter((r) => r.player_name && !/^Игрок( \d)?$/.test(String(r.player_name).trim()));
  return rows.sort((a, b) => b.wins - a.wins || b.winrate - a.winrate || a.games - b.games);
}
/** Everyone with league points and league (see js/ui/leagues.js), best first. */
export async function loadLeagues() {
  const { rankPlayers } = await import('../ui/leagues.js');
  const rows = (await get('leaderboard?select=*&limit=3000')).filter((r) => r.player_name && !/^Игрок( \d)?$/.test(String(r.player_name).trim()));
  return rankPlayers(rows);
}
/** Decks of one mode: games, wins and leader, counted from the latest results. */
export async function loadDecks(mode) {
  const rows = await get(`results?select=deck,leader,won${mode === 'all' ? '' : `&mode=eq.${encodeURIComponent(mode)}`}&order=created_at.desc&limit=1000`);
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
  const rows = await get('card_winrate?select=card,games,wins&limit=1000');
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
