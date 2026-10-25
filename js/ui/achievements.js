// Награды: kept in this browser. Checked after every finished game (not bot vs bot, not hot-seat).
import { loadGames } from './stats.js';
import { CARDS } from '../data/cards.js';

const KEY = 'pchk_ach';
const LEADERS = [20, 41, 62, 63, 117, 118];

/** id → { icon, title, text, test(ctx) }. ctx = { won, mode, level, myLeader, myHp, round, best, oppKills, games } */
export const ACH = {
  first:    { ico: 'trophy', icon: '🏆', title: 'Первая кровь', text: 'Выиграйте первую партию', test: (c) => c.won },
  wins10:   { ico: 'laurel-crown', icon: '🎖️', title: 'Ветеран', text: '10 побед', test: (c) => c.wins >= 10 },
  wins50:   { ico: 'crown', icon: '👑', title: 'Легенда Подземелий', text: '50 побед', test: (c) => c.wins >= 50 },
  games25:  { ico: 'beer-stein', icon: '🍺', title: 'Завсегдатай таверны', text: 'Сыграйте 25 партий', test: (c) => c.games.length >= 25 },
  streak3:  { ico: 'flame', icon: '🔥', title: 'В ударе', text: '3 победы подряд', test: (c) => c.streak >= 3 },
  strong:   { ico: 'brain', icon: '🧠', title: 'Умнее машины', text: 'Победите Сильного компьютера', test: (c) => c.won && c.mode === 'bot' && c.level === 'strong' },
  strong5:  { ico: 'robot', icon: '🤖', title: 'Гроза роботов', text: '5 побед над Сильным компьютером', test: (c) => c.strongWins >= 5 },
  online:   { ico: 'shaking-hands', icon: '🤝', title: 'Дружеский поединок', text: 'Выиграйте у друга онлайн', test: (c) => c.won && c.mode === 'online' },
  allLeaders: { ico: 'card-play', icon: '🃏', title: 'Мастер всех скрижалей', text: 'Победите каждым из шести Лидеров', test: (c) => c.leadersWon >= LEADERS.length },
  blitz:    { ico: 'stopwatch', icon: '⚡', title: 'Блицкриг', text: 'Победа в 3-м раунде или раньше', test: (c) => c.won && c.round <= 3 },
  edge:     { ico: 'broken-heart', icon: '🩹', title: 'На волоске', text: 'Победа, когда у вашего Лидера 3 здоровья или меньше', test: (c) => c.won && c.myHp <= 3 },
  crusher:  { ico: 'hammer-drop', icon: '💥', title: 'Сокрушитель', text: 'Нанесите 8 или больше ран одним ударом', test: (c) => c.best >= 8 },
  wall:     { ico: 'checked-shield', icon: '🛡️', title: 'Ни шагу назад', text: 'Победа, в которой соперник не уничтожил ни одного вашего союзника', test: (c) => c.won && c.oppKills === 0 },
  // --- 2026-10-25: more awards ---
  win20:    { ico: 'broadsword', icon: '🦁', title: 'Во славу Лёвенхартов', text: 'Победите Сфинктерионом Лёвенхартом', test: (c) => c.won && c.myLeader === 20 },
  win41:    { ico: 'sprint', icon: '🐀', title: 'Хвост трубой', text: 'Победите Крысой Ларисой', test: (c) => c.won && c.myLeader === 41 },
  win62:    { ico: 'drop', icon: '🩸', title: 'Кровь клана', text: 'Победите Даном Баланом', test: (c) => c.won && c.myLeader === 62 },
  win63:    { ico: 'skull-crossed-bones', icon: '🧛', title: 'Хозяин замка', text: 'Победите Графом Владом', test: (c) => c.won && c.myLeader === 63 },
  win117:   { ico: 'magic-swirl', icon: '🧪', title: 'Непонятый гений', text: 'Победите Эриком Пэнисовым', test: (c) => c.won && c.myLeader === 117 },
  win118:   { ico: 'sparkles', icon: '🕶️', title: 'Мама на войне', text: 'Победите Софией', test: (c) => c.won && c.myLeader === 118 },
  hunter:   { ico: 'spider-web', icon: '🎯', title: 'Охотник на Лидеров', text: 'Победите каждого из шести Лидеров-соперников', test: (c) => c.oppBeaten >= LEADERS.length },
  games10:  { ico: 'open-book', icon: '📖', title: 'Ученик', text: 'Сыграйте 10 партий', test: (c) => c.games.length >= 10 },
  games100: { ico: 'tavern-sign', icon: '🏚️', title: 'Свой человек в таверне', text: 'Сыграйте 100 партий', test: (c) => c.games.length >= 100 },
  wins25:   { ico: 'swords-emblem', icon: '⚔️', title: 'Полководец', text: '25 побед', test: (c) => c.wins >= 25 },
  wins100:  { ico: 'laurel-crown', icon: '🏛️', title: 'Бессмертный', text: '100 побед', test: (c) => c.wins >= 100 },
  streak5:  { ico: 'star-swirl', icon: '🌟', title: 'Неудержимый', text: '5 побед подряд', test: (c) => c.streak >= 5 },
  streak10: { ico: 'flame', icon: '☄️', title: 'Легенда таверны', text: '10 побед подряд', test: (c) => c.streak >= 10 },
  normal:   { ico: 'card-draw', icon: '🎓', title: 'Разминка окончена', text: 'Победите Обычного компьютера', test: (c) => c.won && c.mode === 'bot' && c.level === 'normal' },
  online5:  { ico: 'chat-bubble', icon: '🗣️', title: 'Душа компании', text: '5 побед над друзьями онлайн', test: (c) => c.onlineWins >= 5 },
  flawless: { ico: 'hearts', icon: '💖', title: 'Ни царапины', text: 'Победа, когда у вашего Лидера 25 здоровья или больше', test: (c) => c.won && c.myHp >= 25 },
  siege:    { ico: 'hourglass', icon: '⏳', title: 'Долгая осада', text: 'Победа в 8-м раунде или позже', test: (c) => c.won && c.round >= 8 },
  comeback: { ico: 'stone-block', icon: '🪨', title: 'Камень преткновения', text: 'Победа в 6-м раунде или позже, когда у вашего Лидера 8 здоровья или меньше', test: (c) => c.won && c.round >= 6 && c.myHp <= 8 },
  grinder:  { ico: 'crossed-swords', icon: '🗡️', title: 'Мясорубка', text: 'Уничтожьте 6 вражеских союзников за партию', test: (c) => c.kills >= 6 },
  heart:    { ico: 'targeted', icon: '🎯', title: 'В самое сердце', text: 'Нанесите вражескому Лидеру 20 ран за партию', test: (c) => c.face >= 20 },
  storm:    { ico: 'bolt-shield', icon: '🌩️', title: 'Шквал', text: 'Нанесите 35 ран за партию', test: (c) => c.dmg >= 35 },
  parade:   { ico: 'swap-bag', icon: '🎭', title: 'Парад легенд', text: 'Сыграйте 3 Легенды за партию', test: (c) => c.legends >= 3 },
  noBrakes: { ico: 'wooden-crate', icon: '📦', title: 'Без тормозов', text: 'Сыграйте 15 карт за партию', test: (c) => c.playedN >= 15 },
  mirror:   { ico: 'two-coins', icon: '🪞', title: 'Зеркало', text: 'Победите Лидером против того же Лидера', test: (c) => c.won && c.myLeader === c.oppLeader },
  dice:     { ico: 'dice-twenty-faces-twenty', icon: '🎲', title: 'Кости не врут', text: 'Проиграйте 10 партий — без поражений нет опыта', test: (c) => c.losses >= 10 },
  tavern:   { ico: 'music-spell', icon: '🎶', title: 'Бард таверны', text: 'Сыграйте партию каждым из шести Лидеров', test: (c) => c.leadersPlayed >= LEADERS.length },
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
    leadersPlayed: new Set(games.map((g) => g.myLeader).filter((id) => LEADERS.includes(id))).size,
    oppBeaten: new Set(wins.map((g) => g.oppLeader).filter((id) => LEADERS.includes(id))).size,
    onlineWins: wins.filter((g) => g.mode === 'online').length,
    losses: games.filter((g) => g.result === 'loss').length,
    playedN: (ctx.played || []).length,
    legends: new Set((ctx.played || []).filter((id) => CARDS[id]?.legend)).size,
  };
  const have = unlocked(), fresh = [];
  for (const [id, a] of Object.entries(ACH)) {
    if (have[id]) continue;
    let ok = false; try { ok = a.test(full); } catch { ok = false; }
    if (ok) { have[id] = Date.now(); fresh.push({ id, icon: a.icon, ico: a.ico, title: a.title, text: a.text }); }
  }
  try { localStorage.setItem(KEY, JSON.stringify(have)); } catch { /* private mode */ }
  return fresh;
}

/** A gold medal with the award's game-icons sign (grey while not earned). */
export function medalHtml(id, { on = true, size = 64, tip = true } = {}) {
  const a = ACH[id] || { ico: 'scroll-unfurled', title: 'Задание дня', text: '' };
  return `<span class="medal ${on ? 'on' : ''}" style="--m:${size}px" ${tip ? `data-tip="${a.title}|${a.text}"` : ''}><i style="-webkit-mask-image:url(assets/icons/${a.ico}.svg);mask-image:url(assets/icons/${a.ico}.svg)"></i></span>`;
}
/** Trophy room: every award as a medal, earned ones in gold with the date. */
export function achievementsHtml() {
  const have = unlocked(), n = Object.keys(have).filter((k) => ACH[k]).length;
  return `<div class="ach-head">Кабинет наград: ${n} из ${Object.keys(ACH).length}</div><div class="ach-room">${Object.entries(ACH).map(([id, a]) => `<div class="ach-cell ${have[id] ? 'on' : ''}">${medalHtml(id, { on: !!have[id], size: 78, tip: false })}<b>${a.title}</b><small>${a.text}</small>${have[id] ? `<em>${new Date(have[id]).toLocaleDateString('ru-RU')}</em>` : ''}</div>`).join('')}</div>`;
}
