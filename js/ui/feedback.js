// «Сообщить об ошибке / идея / отзыв»: a window for players; the report goes to the shared Supabase table.
// For a bug from a game, a snapshot of the game (leaders, round, last moves, device) is attached automatically.
import { CARDS } from '../data/cards.js';
import { playerId } from '../net/ranking.js';

const URL = 'https://fwwiwazpivgzfyqhgtsp.supabase.co/rest/v1/feedback';
const KEY = 'sb_publishable_Ks5sPhKPZxt9B2yB4dirsA_3T_b4ims';
const KINDS = [['bug', 'Ошибка', 'Что-то сработало не так, как написано на карте или в правилах'], ['idea', 'Идея', 'Что добавить или сделать удобнее'], ['review', 'Отзыв', 'Что понравилось, что нет'], ['rights', 'Правообладателю', 'Если вы автор или представитель и хотите, чтобы материал убрали']];
// Icons and short titles for the four kinds (canvas «Написать разработчику»).
const KIND_ICON = { bug: '<path d="M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>', idea: '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>', review: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>', rights: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>' };
const KIND_SHORT = { rights: 'Авторам' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** What was going on in the game, for a bug report. */
function gameSnapshot(ui) {
  const v = ui?.view;
  if (!v) return null;
  const pl = (p) => ({ name: p.name, leader: CARDS[p.leader?.id]?.name, hp: p.leader?.hp, coins: p.coins,
    field: p.regions.map((r) => [r.ally && `${CARDS[r.ally.id]?.name} ${r.ally.atk ?? ''}/${r.ally.hp ?? ''}`, r.place && CARDS[r.place.id]?.name].filter(Boolean).join(' + ') || '—'),
    support: p.support.map((c) => CARDS[c.id]?.name) });
  return { round: v.round, phase: v.phase, me: ui.me, players: v.players.map(pl), log: (v.log || []).slice(-30), pending: ui.q ? { type: ui.q.type, prompt: ui.q.prompt } : null };
}

// A picture of the screen for a bug report (html2canvas is loaded only when needed).
let h2c = null;
function loadH2C() {
  if (window.html2canvas) return Promise.resolve(window.html2canvas);
  return h2c || (h2c = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    s.onload = () => res(window.html2canvas); s.onerror = rej;
    document.head.appendChild(s);
  }));
}
async function screenshot() {
  try {
    const h = await loadH2C();
    const canvas = await h(document.body, { backgroundColor: '#120c08', logging: false, useCORS: true, scale: 1 });
    const k = Math.min(1, 1280 / canvas.width);
    const c2 = document.createElement('canvas');
    c2.width = Math.round(canvas.width * k); c2.height = Math.round(canvas.height * k);
    c2.getContext('2d').drawImage(canvas, 0, 0, c2.width, c2.height);
    return c2.toDataURL('image/jpeg', 0.72);
  } catch { return null; }
}

/** A crash inside the game: send it on its own (once per message, at most 3 per page load), with the game snapshot. */
const sentAuto = new Set();
export function autoReport(err, ui) {
  try {
    const msg = String(err?.stack || err?.message || err || '').slice(0, 1500);
    const key = msg.split('\n').slice(0, 2).join('|');
    if (!msg || sentAuto.has(key) || sentAuto.size >= 3 || /ResizeObserver|Script error|extension:\/\//.test(msg)) return;
    sentAuto.add(key);
    const context = { url: location.href.split('#')[0].split('?')[0], ua: navigator.userAgent, screen: `${innerWidth}x${innerHeight}`, auto: true, game: gameSnapshot(ui) };
    fetch(URL, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ kind: 'bug', text: `[авто] Ошибка в игре: ${msg}`.slice(0, 4000), author: 'автоотчёт', player_id: playerId(), context }) }).catch(() => {});
  } catch { /* never break the game */ }
}

export async function openFeedback({ ui = null, name = '', kind = null } = {}) {
  document.querySelector('.fb-back')?.remove();
  const inGame = !!ui?.view;
  // The picture is taken before the window opens, so it shows the game as it is.
  const shot = inGame ? await screenshot() : null;
  const back = document.createElement('div');
  back.className = 'fb-back';
  back.innerHTML = `<div class="fb-win">
    <div class="win-head"><h3>Написать разработчику</h3><button class="win-x" data-close aria-label="Закрыть"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <div class="fb-kinds">${KINDS.map(([k, t, hint], i) => `<label class="fb-kind" title="${esc(hint)}"><input type="radio" name="fbk" value="${k}" data-hint="${esc(hint)}" ${k === (kind || (inGame ? 'bug' : 'review')) ? 'checked' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${KIND_ICON[k] || ''}</svg><b>${KIND_SHORT[k] || t}</b></label>`).join('')}</div>
    <p class="fb-hint"></p>
    <textarea maxlength="4000" placeholder="Опишите, что случилось или что хотите предложить. Для ошибки: какая карта, что вы сделали и что ожидали."></textarea>
    <input class="fb-author" type="text" maxlength="60" value="${esc(name)}" placeholder="Ваше имя или контакт (необязательно)">
    ${shot ? `<label class="fb-shot"><input type="checkbox" checked> Приложить снимок экрана<img src="${shot}" alt="Снимок экрана"></label>` : ''}
    ${inGame ? '<label class="fb-ctx"><input type="checkbox" checked> Приложить ход текущей партии (Лидеры, поле, последние действия) — так ошибку проще найти</label>' : ''}
    <div class="fb-msg"></div>
    <div class="fb-btns"><button class="fb-btn quiet" data-cancel>Отмена</button><button class="fb-btn" data-send>Отправить</button></div>
  </div>`;
  document.body.appendChild(back);
  const ta = back.querySelector('textarea');
  setTimeout(() => ta.focus(), 50);
  const close = () => back.remove();
  back.querySelectorAll('[data-close], [data-cancel]').forEach((x) => { x.onclick = close; });
  const hint = () => { back.querySelector('.fb-hint').textContent = back.querySelector('input[name=fbk]:checked')?.dataset.hint || ''; };
  back.querySelectorAll('input[name=fbk]').forEach((r) => r.addEventListener('change', hint)); hint();
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  back.querySelector('[data-send]').onclick = async () => {
    const text = ta.value.trim();
    const msg = back.querySelector('.fb-msg');
    if (text.length < 3) { msg.textContent = 'Напишите хотя бы пару слов.'; return; }
    const kind = back.querySelector('input[name=fbk]:checked')?.value || 'review';
    const withCtx = back.querySelector('.fb-ctx input')?.checked;
    const context = { url: location.href.split('#')[0], ua: navigator.userAgent, screen: `${innerWidth}x${innerHeight}`, game: withCtx ? gameSnapshot(ui) : null,
      shot: shot && back.querySelector('.fb-shot input')?.checked ? shot : null };
    const btn = back.querySelector('[data-send]');
    btn.disabled = true; btn.textContent = 'Отправляем…';
    try {
      const res = await fetch(URL, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ kind, text, author: back.querySelector('.fb-author').value.trim().slice(0, 60) || null, player_id: playerId(), context }) });
      if (!res.ok) throw new Error(String(res.status));
      back.querySelector('.fb-win').innerHTML = '<h3>Спасибо!</h3><p class="fb-done">Сообщение отправлено. Разработчик увидит его и решит, что с ним делать.</p><div class="fb-btns"><button class="fb-btn" data-close>Закрыть</button></div>';
      back.querySelector('[data-close]').onclick = close;
    } catch {
      btn.disabled = false; btn.textContent = 'Отправить';
      msg.textContent = 'Не получилось отправить — нет связи с сервером. Попробуйте ещё раз.';
    }
  };
}
