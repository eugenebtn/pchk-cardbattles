// «Сообщить об ошибке / идея / отзыв»: a window for players; the report goes to the shared Supabase table.
// For a bug from a game, a snapshot of the game (leaders, round, last moves, device) is attached automatically.
import { CARDS } from '../data/cards.js';
import { playerId } from '../net/ranking.js';

const URL = 'https://fwwiwazpivgzfyqhgtsp.supabase.co/rest/v1/feedback';
const KEY = 'sb_publishable_Ks5sPhKPZxt9B2yB4dirsA_3T_b4ims';
const KINDS = [['bug', 'Ошибка', 'Что-то сработало не так, как написано на карте или в правилах'], ['idea', 'Идея', 'Что добавить или сделать удобнее'], ['review', 'Отзыв', 'Что понравилось, что нет'], ['rights', 'Правообладателю', 'Если вы автор или представитель и хотите, чтобы материал убрали']];
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

export function openFeedback({ ui = null, name = '', kind = null } = {}) {
  document.querySelector('.fb-back')?.remove();
  const inGame = !!ui?.view;
  const back = document.createElement('div');
  back.className = 'fb-back';
  back.innerHTML = `<div class="fb-win">
    <h3>Написать разработчику</h3>
    <div class="fb-kinds">${KINDS.map(([k, t, hint], i) => `<label class="fb-kind"><input type="radio" name="fbk" value="${k}" ${k === (kind || (inGame ? 'bug' : 'review')) ? 'checked' : ''}><b>${t}</b><small>${hint}</small></label>`).join('')}</div>
    <textarea maxlength="4000" placeholder="Опишите, что случилось или что хотите предложить. Для ошибки: какая карта, что вы сделали и что ожидали."></textarea>
    <input class="fb-author" type="text" maxlength="60" value="${esc(name)}" placeholder="Ваше имя или контакт (необязательно)">
    ${inGame ? '<label class="fb-ctx"><input type="checkbox" checked> Приложить ход текущей партии (Лидеры, поле, последние действия) — так ошибку проще найти</label>' : ''}
    <div class="fb-msg"></div>
    <div class="fb-btns"><button class="fb-btn quiet" data-close>Отмена</button><button class="fb-btn" data-send>Отправить</button></div>
  </div>`;
  document.body.appendChild(back);
  const ta = back.querySelector('textarea');
  setTimeout(() => ta.focus(), 50);
  const close = () => back.remove();
  back.querySelector('[data-close]').onclick = close;
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  back.querySelector('[data-send]').onclick = async () => {
    const text = ta.value.trim();
    const msg = back.querySelector('.fb-msg');
    if (text.length < 3) { msg.textContent = 'Напишите хотя бы пару слов.'; return; }
    const kind = back.querySelector('input[name=fbk]:checked')?.value || 'review';
    const withCtx = back.querySelector('.fb-ctx input')?.checked;
    const context = { url: location.href.split('#')[0], ua: navigator.userAgent, screen: `${innerWidth}x${innerHeight}`, game: withCtx ? gameSnapshot(ui) : null };
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
