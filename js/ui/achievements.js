// Награды: kept in this browser. Checked after every finished game (not bot vs bot, not hot-seat).
import { loadGames } from './stats.js';

const KEY = 'pchk_ach';
const LEADERS = [20, 41, 62, 63, 117, 118];

/** id → { icon, title, text, test(ctx) }. ctx = { won, mode, level, myLeader, myHp, round, best, oppKills, games } */
export const ACH = {
  first:    { icon: '🏆', title: 'Первая кровь', text: 'Выиграйте первую партию', test: (c) => c.won },
  wins10:   { icon: '🎖️', title: 'Ветеран', text: '10 побед', test: (c) => c.wins >= 10 },
  wins50:   { icon: '👑', title: 'Легенда Подземелий', text: '50 побед', test: (c) => c.wins >= 50 },
  games25:  { icon: '🍺', title: 'Завсегдатай таверны', text: 'Сыграйте 25 партий', test: (c) => c.games.length >= 25 },
  streak3:  { icon: '🔥', title: 'В ударе', text: '3 победы подряд', test: (c) => c.streak >= 3 },
  strong:   { icon: '🧠', title: 'Умнее машины', text: 'Победите Сильного компьютера', test: (c) => c.won && c.mode === 'bot' && c.level === 'strong' },
  strong5:  { icon: '🤖', title: 'Гроза роботов', text: '5 побед над Сильным компьютером', test: (c) => c.strongWins >= 5 },
  online:   { icon: '🤝', title: 'Дружеский поединок', text: 'Выиграйте у друга онлайн', test: (c) => c.won && c.mode === 'online' },
  allLeaders: { icon: '🃏', title: 'Мастер всех скрижалей', text: 'Победите каждым из шести Лидеров', test: (c) => c.leadersWon >= LEADERS.length },
  blitz:    { icon: '⚡', title: 'Блицкриг', text: 'Победа в 3-м раунде или раньше', test: (c) => c.won && c.round <= 3 },
  edge:     { icon: '🩹', title: 'На волоске', text: 'Победа, когда у вашего Лидера 3 здоровья или меньше', test: (c) => c.won && c.myHp <= 3 },
  crusher:  { icon: '💥', title: 'Сокрушитель', text: 'Нанесите 8 или больше ран одним ударом', test: (c) => c.best >= 8 },
  wall:     { icon: '🛡️', title: 'Ни шагу назад', text: 'Победа, в которой соперник не уничтожил ни одного вашего союзника', test: (c) => c.won && c.oppKills === 0 },
};

export function unlocked() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } }

/** After a game: returns the newly earned awards [{id, icon, title, text}]. */
export function checkAchievements(ctx) {
  const games = loadGames().filter((g) => g.mode !== 'hotseat');
  const wins = games.filter((g) => g.result === 'win');
  let streak = 0; for (let k = games.length - 1; k >= 0 && games[k].result === 'win'; k--) streak++;
  const full = {
    ...ctx, games, wins: wins.length, streak,
    strongWins: wins.filter((g) => g.mode === 'bot' && g.level === 'strong').length,
    leadersWon: new Set(wins.map((g) => g.myLeader).filter((id) => LEADERS.includes(id))).size,
  };
  const have = unlocked(), fresh = [];
  for (const [id, a] of Object.entries(ACH)) {
    if (have[id]) continue;
    let ok = false; try { ok = a.test(full); } catch { ok = false; }
    if (ok) { have[id] = Date.now(); fresh.push({ id, icon: a.icon, title: a.title, text: a.text }); }
  }
  try { localStorage.setItem(KEY, JSON.stringify(have)); } catch { /* private mode */ }
  return fresh;
}

/** All awards as a grid (earned ones bright, with the date). */
export function achievementsHtml() {
  const have = unlocked(), n = Object.keys(have).filter((k) => ACH[k]).length;
  return `<div class="ach-head">Награды: ${n} из ${Object.keys(ACH).length}</div><div class="ach-grid">${Object.entries(ACH).map(([id, a]) => `<div class="ach ${have[id] ? 'on' : ''}"><span class="ach-ico">${a.icon}</span><div><b>${a.title}</b><small>${a.text}${have[id] ? ` · ${new Date(have[id]).toLocaleDateString('ru-RU')}` : ''}</small></div></div>`).join('')}</div>`;
}
