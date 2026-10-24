// Задание дня: one task per day (the same for everyone on that date), kept in this browser.
import { CARDS } from '../data/cards.js';

const KEY = 'pchk_daily';
const LEADERS = [20, 41, 62, 63, 117, 118];
const short = (id) => (CARDS[id]?.name || '').split(',')[0];

/** Task makers: given the day number, return { id, text, test(ctx) }. ctx as in achievements (won, mode, level, myLeader, round, best, oppKills). */
const MAKERS = [
  (d) => { const L = LEADERS[d % 6]; return { id: `leader${L}`, text: `Победите, играя за ${short(L)}`, test: (c) => c.won && c.myLeader === L }; },
  () => ({ id: 'strong', text: 'Победите Сильного компьютера', test: (c) => c.won && c.mode === 'bot' && c.level === 'strong' }),
  () => ({ id: 'blitz5', text: 'Выиграйте партию за 5 раундов или быстрее', test: (c) => c.won && c.round <= 5 }),
  () => ({ id: 'online', text: 'Сыграйте партию с другом онлайн', test: (c) => c.mode === 'online' }),
  () => ({ id: 'hit5', text: 'Нанесите 5 или больше ран одним ударом', test: (c) => c.best >= 5 }),
  () => ({ id: 'wall', text: 'Победите, не потеряв ни одного союзника', test: (c) => c.won && c.oppKills === 0 }),
  (d) => { const L = LEADERS[(d + 3) % 6]; return { id: `vs${L}`, text: `Победите соперника, играющего за ${short(L)}`, test: (c) => c.won && c.oppLeader === L }; },
];
const dayNo = (t = Date.now()) => Math.floor((t + 3 * 3600e3) / 86400e3); // Moscow day
export function todayTask() {
  const d = dayNo();
  const t = MAKERS[(d * 5 + 3) % MAKERS.length](d);
  return { ...t, day: d };
}
function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } }
function save(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* private mode */ } }
/** { task, done, streak, total } */
export function dailyState() {
  const t = todayTask(), o = load();
  const done = o.lastDone === t.day;
  // A streak counts days in a row ending today or yesterday.
  const streak = o.lastDone === t.day || o.lastDone === t.day - 1 ? o.streak || 0 : 0;
  return { task: t, done, streak, total: o.total || 0 };
}
/** After a game: true if this game completed today's task (just now). */
export function checkDaily(ctx) {
  const t = todayTask(), o = load();
  if (o.lastDone === t.day) return false;
  let ok = false; try { ok = t.test(ctx); } catch { ok = false; }
  if (!ok) return false;
  o.streak = o.lastDone === t.day - 1 ? (o.streak || 0) + 1 : 1;
  o.lastDone = t.day; o.total = (o.total || 0) + 1;
  save(o);
  return true;
}
