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

/** Send one finished game. Never throws: the ranking must not break the game. */
export async function submitResult(r) {
  try {
    const row = {
      player_id: playerId(), player_name: String(r.name || 'Игрок').slice(0, 24), deck: String(r.deck || '').slice(0, 40), leader: r.leader ?? null,
      opponent_name: r.oppName ? String(r.oppName).slice(0, 24) : null, opponent_deck: r.oppDeck ? String(r.oppDeck).slice(0, 40) : null,
      mode: r.mode, won: !!r.won, rounds: Math.max(0, Math.min(200, r.rounds | 0)),
    };
    const res = await fetch(URL + 'results', { method: 'POST', headers: { ...HEAD, Prefer: 'return=minimal' }, body: JSON.stringify(row) });
    return res.ok;
  } catch { return false; }
}

async function get(path) {
  const res = await fetch(URL + path, { headers: HEAD });
  if (!res.ok) throw new Error('ranking ' + res.status);
  return res.json();
}
/** Players of one mode, best first. */
export async function loadPlayers(mode) {
  const rows = await get(`leaderboard?select=*&mode=eq.${encodeURIComponent(mode)}&limit=500`);
  return rows.sort((a, b) => b.wins - a.wins || b.winrate - a.winrate || a.games - b.games);
}
/** Decks of one mode: games, wins and leader, counted from the latest results. */
export async function loadDecks(mode) {
  const rows = await get(`results?select=deck,leader,won&mode=eq.${encodeURIComponent(mode)}&order=created_at.desc&limit=5000`);
  const m = new Map();
  for (const r of rows) {
    const d = m.get(r.deck) || { deck: r.deck, leader: r.leader, games: 0, wins: 0 };
    d.games++; if (r.won) d.wins++;
    m.set(r.deck, d);
  }
  return [...m.values()].sort((a, b) => b.wins / b.games - a.wins / a.games || b.games - a.games);
}
