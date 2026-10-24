// Watchers' comments: a chat panel for watchers, short pop-up lines for players (they can turn them off).
import { esc } from './board.js';

const KEY = 'pchk_showChat';
export const chatOn = () => { try { return localStorage.getItem(KEY) !== 'false'; } catch { return true; } };
const setChatOn = (v) => { try { localStorage.setItem(KEY, String(v)); } catch { /* private mode */ } };
export const cleanChat = (name, text) => ({ name: String(name || 'Зритель').replace(/\s+/g, ' ').trim().slice(0, 24) || 'Зритель', text: String(text || '').replace(/\s+/g, ' ').trim().slice(0, 200) });

/**
 * watcher: true → full chat panel with an input; false → players: a «👁 N» badge and pop-up comments.
 * onSend(text) is called for the watcher's own messages.
 */
export function createChat({ watcher = false, onSend = null } = {}) {
  document.querySelector('.watch-chat')?.remove();
  const box = document.createElement('div');
  box.className = 'watch-chat ' + (watcher ? 'is-watcher' : 'is-player');
  box.innerHTML = watcher
    ? `<div class="wc-head"><span class="wc-eye">👁 <b class="wc-n">1</b></span><span>Комментарии зрителей</span><button class="wc-min" title="Свернуть">–</button></div>
       <div class="wc-list"><div class="wc-sys">Вы смотрите партию. Карт в руках игроков не видно никому из зрителей.</div></div>
       <form class="wc-form"><input maxlength="200" placeholder="Написать комментарий…"><button>➤</button></form>`
    : `<button class="wc-badge" title="Зрители и их комментарии"><span>👁 <b class="wc-n">0</b></span><small class="wc-state"></small></button><div class="wc-pops"></div>`;
  document.body.appendChild(box);
  const list = box.querySelector('.wc-list'), pops = box.querySelector('.wc-pops');
  let last = 0, n = 0;
  if (watcher) {
    const form = box.querySelector('.wc-form'), input = form.querySelector('input');
    form.onsubmit = (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      if (Date.now() - last < 3000) { sys('Не чаще одного сообщения в 3 секунды.'); return; }
      last = Date.now(); input.value = '';
      onSend && onSend(text);
    };
    box.querySelector('.wc-min').onclick = () => box.classList.toggle('min');
  } else {
    const st = box.querySelector('.wc-state');
    const draw = () => { st.textContent = chatOn() ? 'комментарии вкл.' : 'комментарии выкл.'; box.classList.toggle('muted', !chatOn()); };
    box.querySelector('.wc-badge').onclick = () => { setChatOn(!chatOn()); draw(); };
    draw();
  }
  const sys = (text) => { if (list) { list.insertAdjacentHTML('beforeend', `<div class="wc-sys">${esc(text)}</div>`); list.scrollTop = list.scrollHeight; } };
  const api = {
    add(name, text, mine = false) {
      const c = cleanChat(name, text);
      if (!c.text) return;
      if (list) {
        list.insertAdjacentHTML('beforeend', `<div class="wc-msg ${mine ? 'mine' : ''}"><b>${esc(c.name)}</b> ${esc(c.text)}</div>`);
        while (list.children.length > 120) list.firstElementChild.remove();
        list.scrollTop = list.scrollHeight;
      } else if (pops && chatOn()) {
        const el = document.createElement('div');
        el.className = 'wc-pop';
        el.innerHTML = `<b>${esc(c.name)}:</b> ${esc(c.text)}`;
        pops.appendChild(el);
        while (pops.children.length > 4) pops.firstElementChild.remove();
        setTimeout(() => el.classList.add('out'), 6500); setTimeout(() => el.remove(), 7200);
      }
    },
    sys,
    setCount(k) { n = k; box.querySelectorAll('.wc-n').forEach((e) => { e.textContent = String(k); }); box.classList.toggle('none', !watcher && k === 0); },
    get count() { return n; },
    destroy() { box.remove(); },
  };
  if (!watcher) api.setCount(0); // the badge shows up only when someone watches
  return api;
}
