// Personal statistics (kept in this browser) and the deck balance table from bot-vs-bot games.
import { CARDS } from '../data/cards.js';
import { DECKS } from '../data/decks.js';
import { BALANCE } from '../data/balance.js';
import { esc } from './board.js';

const KEY = 'pchk_stats';
const MODE_RU = { bot: 'с компьютером', online: 'с другом онлайн', hotseat: 'за одним экраном' };

export function loadGames() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
function saveGames(list) { try { localStorage.setItem(KEY, JSON.stringify(list.slice(-500))); } catch { /* private mode */ } }

/** g: { mode, myLeader, oppLeader, deck, oppName, result: 'win'|'loss'|'draw', rounds, played: [ids], at } */
export function recordGame(g) {
  const list = loadGames();
  list.push({ ...g, at: g.at || Date.now() });
  saveGames(list);
}
export function clearGames() { saveGames([]); }

const pct = (w, n) => (n ? Math.round((w / n) * 100) : 0);
const leaderName = (id) => (CARDS[id]?.name || '?').split(',')[0];
function bar(w, n, cls = '') {
  const p = pct(w, n);
  return `<div class="st-bar ${cls}" data-tip="${w} побед из ${n}|Процент побед ${p}%"><div style="width:${p}%"></div><span>${n ? p + '%' : '—'}</span></div>`;
}
function group(list, keyFn) {
  const m = new Map();
  for (const g of list) {
    const k = keyFn(g);
    if (k == null) continue;
    const r = m.get(k) || { n: 0, w: 0, l: 0, d: 0 };
    r.n++; if (g.result === 'win') r.w++; else if (g.result === 'loss') r.l++; else r.d++;
    m.set(k, r);
  }
  return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
}

export function renderStats(root, onBack) {
  let tab = 'mine';
  const draw = () => {
    const games = loadGames();
    const human = games;
    const tot = group(human, () => 'all')[0]?.[1] || { n: 0, w: 0, l: 0, d: 0 };
    let streak = 0;
    for (let i = human.length - 1; i >= 0; i--) { if (human[i].result === 'win') streak++; else break; }
    const byLeader = group(human, (g) => g.myLeader);
    const byOpp = group(human, (g) => g.oppLeader);
    const byMode = group(human, (g) => g.mode);
    // Cards: how often played and win rate when played.
    const cardStat = new Map();
    for (const g of human) for (const id of new Set(g.played || [])) {
      const r = cardStat.get(id) || { n: 0, w: 0 };
      r.n++; if (g.result === 'win') r.w++;
      cardStat.set(id, r);
    }
    const cards = [...cardStat.entries()].filter(([id]) => CARDS[id]).sort((a, b) => b[1].n - a[1].n).slice(0, 16);
    const avgRounds = human.length ? (human.reduce((a, g) => a + (g.rounds || 0), 0) / human.length).toFixed(1) : '—';
    const mine = `
      <div class="st-kpis">
        <div class="kpi"><b>${tot.n}</b><span>партий</span></div>
        <div class="kpi win"><b>${tot.w}</b><span>побед</span></div>
        <div class="kpi loss"><b>${tot.l}</b><span>поражений</span></div>
        <div class="kpi"><b>${pct(tot.w, tot.n)}%</b><span>процент побед</span></div>
        <div class="kpi"><b>${streak}</b><span>побед подряд</span></div>
        <div class="kpi"><b>${avgRounds}</b><span>раундов в партии</span></div>
      </div>
      ${tot.n ? '' : '<p class="st-empty">Сыграйте партию — здесь появится ваша статистика. Она хранится в этом браузере.</p>'}
      ${byLeader.length ? `<h3>Мои Лидеры</h3><table class="st-table"><tr><th>Лидер</th><th>Партий</th><th>Побед</th><th>Процент побед</th></tr>
        ${byLeader.map(([id, r]) => `<tr><td><span class="st-face" style="background-image:url('${CARDS[id]?.img}')"></span>${esc(leaderName(id))}</td><td>${r.n}</td><td>${r.w}</td><td>${bar(r.w, r.n)}</td></tr>`).join('')}</table>` : ''}
      ${byOpp.length ? `<h3>Против Лидеров</h3><table class="st-table"><tr><th>Соперник</th><th>Партий</th><th>Побед</th><th>Процент побед</th></tr>
        ${byOpp.map(([id, r]) => `<tr><td><span class="st-face" style="background-image:url('${CARDS[id]?.img}')"></span>${esc(leaderName(id))}</td><td>${r.n}</td><td>${r.w}</td><td>${bar(r.w, r.n)}</td></tr>`).join('')}</table>` : ''}
      ${byMode.length ? `<h3>По режимам</h3><table class="st-table"><tr><th>Режим</th><th>Партий</th><th>Побед</th><th>Процент побед</th></tr>
        ${byMode.map(([m, r]) => `<tr><td>${MODE_RU[m] || m}</td><td>${r.n}</td><td>${r.w}</td><td>${bar(r.w, r.n)}</td></tr>`).join('')}</table>` : ''}
      ${cards.length ? `<h3>Мои карты</h3><p class="st-note">Сколько партий вы разыгрывали карту и как часто в таких партиях побеждали.</p>
        <div class="st-cards">${cards.map(([id, r]) => `<div class="st-card" data-tip="${esc(CARDS[id].name)}|Сыграна в ${r.n} партиях, из них побед ${r.w} (${pct(r.w, r.n)}%)"><div class="st-cimg" style="background-image:url('${CARDS[id].img || ''}')"></div><div>${esc(CARDS[id].name.split(',')[0])}</div>${bar(r.w, r.n, 'small')}</div>`).join('')}</div>` : ''}
      ${human.length ? `<h3>Последние партии</h3><table class="st-table"><tr><th>Когда</th><th>Режим</th><th>Я</th><th>Соперник</th><th>Итог</th><th>Раунды</th></tr>
        ${[...human].reverse().slice(0, 20).map((g) => `<tr><td>${new Date(g.at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} ${new Date(g.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</td><td>${MODE_RU[g.mode] || g.mode}</td><td>${esc(leaderName(g.myLeader))}</td><td>${esc(leaderName(g.oppLeader))}${g.oppName ? ` <small>(${esc(g.oppName)})</small>` : ''}</td><td class="res ${g.result}">${g.result === 'win' ? 'Победа' : g.result === 'loss' ? 'Поражение' : 'Ничья'}</td><td>${g.rounds || '—'}</td></tr>`).join('')}</table>
        <p><button class="btn small danger" data-clear>Очистить мою статистику</button></p>` : ''}`;
    // Balance matrix.
    const keys = Object.keys(DECKS);
    const cell = (a, b) => {
      const r1 = BALANCE.res[`${a}|${b}`], r2 = BALANCE.res[`${b}|${a}`];
      const n = (r1?.games || 0) + (r2?.games || 0), w = (r1?.aWins || 0) + (r2?.bWins || 0);
      const p = pct(w, n);
      const hue = Math.round((p / 100) * 120);
      return `<td class="bal" style="background:hsla(${hue},55%,32%,.85)" data-tip="${esc(DECKS[a].title)} против ${esc(DECKS[b].title)}|${w} побед из ${n} партий (${p}%)">${a === b ? '—' : p + '%'}</td>`;
    };
    const overall = keys.map((a) => {
      let n = 0, w = 0;
      for (const b of keys) { if (a === b) continue; const r1 = BALANCE.res[`${a}|${b}`], r2 = BALANCE.res[`${b}|${a}`]; n += (r1?.games || 0) + (r2?.games || 0); w += (r1?.aWins || 0) + (r2?.bWins || 0); }
      return [a, w, n];
    }).sort((x, y) => y[1] / y[2] - x[1] / x[2]);
    const firstWins = Object.values(BALANCE.res).reduce((a, r) => a + r.aWins, 0);
    const balance = `
      <p class="st-note">Компьютер сыграл сам с собой ${BALANCE.total} партий: каждая пара стартовых колод по ${BALANCE.perPair * 2} раз. Это показывает силу колод в руках простого бота, а не живого игрока. В среднем партия длится ${BALANCE.avgRounds} раунда.</p>
      <h3>Сила колод</h3>
      <table class="st-table">${overall.map(([a, w, n]) => `<tr><td><span class="st-face" style="background-image:url('${CARDS[DECKS[a].leader].img}')"></span>${esc(DECKS[a].title)}</td><td>${bar(w, n)}</td></tr>`).join('')}</table>
      <h3>Кто кого (процент побед колоды в строке)</h3>
      <div class="bal-wrap"><table class="st-table bal-table"><tr><th></th>${keys.map((b) => `<th>${esc(DECKS[b].title.split(' ')[0])}</th>`).join('')}</tr>
        ${keys.map((a) => `<tr><th>${esc(DECKS[a].title)}</th>${keys.map((b) => cell(a, b)).join('')}</tr>`).join('')}</table></div>
      <p class="st-note">Кто ходит первым в первом раунде, побеждает в ${pct(firstWins, BALANCE.total)}% партий.</p>`;
    root.innerHTML = `<div class="stats-box">
      <button class="btn small" data-back>← Назад</button>
      <h2>Статистика</h2>
      <div class="st-tabs"><button class="btn small ${tab === 'mine' ? 'primary' : ''}" data-tab="mine">Мои партии</button><button class="btn small ${tab === 'bal' ? 'primary' : ''}" data-tab="bal">Баланс колод</button></div>
      ${tab === 'mine' ? mine : balance}
    </div>`;
    root.querySelector('[data-back]').onclick = onBack;
    root.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { tab = b.dataset.tab; draw(); }; });
    const clr = root.querySelector('[data-clear]');
    if (clr) clr.onclick = () => { if (confirm('Удалить всю вашу статистику в этом браузере?')) { clearGames(); draw(); } };
  };
  draw();
}
