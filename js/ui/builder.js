// Deck builder: pick a leader and at least 40 cards (max 3 copies), saved in this browser.
import { CARDS } from '../data/cards.js';
import { DECKS } from '../data/decks.js';
import { esc } from './board.js';

const TYPE_RU = { ally: 'Союзники', place: 'Места', action: 'Действия', item: 'Предметы', companion: 'Напарники' };
const DECK_RU = { levenheart: 'Лёвенхарт', larisa: 'Лариса', vampires: 'Вампиры', sofia_erik: 'София и Эрик', set1_other: 'Первый набор' };

export function loadCustomDecks(store) { return store.get('decks', []); }

export function renderBuilder(root, store, onBack) {
  const pool = Object.values(CARDS).filter((c) => !c.token && c.type !== 'leader');
  const leaders = Object.values(CARDS).filter((c) => c.type === 'leader');
  let decks = loadCustomDecks(store);
  let cur = { name: 'Моя колода', leader: leaders[0].id, cards: [] };
  let editIndex = -1;
  const f = { type: '', deck: '', q: '' };

  function save() { store.set('decks', decks); }
  function count(id) { return cur.cards.filter((x) => x === id).length; }
  function draw() {
    const list = pool.filter((c) => (!f.type || c.type === f.type) && (!f.deck || c.deck === f.deck) && (!f.q || (c.name + ' ' + c.text).toLowerCase().includes(f.q.toLowerCase())))
      .sort((a, b) => (typeof a.cost === 'number' ? a.cost : 99) - (typeof b.cost === 'number' ? b.cost : 99) || a.name.localeCompare(b.name));
    const byId = {};
    for (const id of cur.cards) byId[id] = (byId[id] || 0) + 1;
    const rows = Object.entries(byId).map(([id, n]) => CARDS[id]).sort((a, b) => (a.cost ?? 0) - (b.cost ?? 0))
      .map((c) => `<div class="row" data-id="${c.id}"><span>${c.cost ?? 'X'} · ${esc(c.name)}</span><b>×${byId[c.id]}</b></div>`).join('');
    const ok = cur.cards.length >= 40;
    root.innerHTML = `<div class="builder-wrap">
      <div class="builder-head">
        <button class="btn small" data-back>← Назад</button>
        <h2 style="margin:0">Конструктор колод</h2>
        <div>
          <select data-load><option value="">Загрузить…</option>
            ${Object.values(DECKS).map((d) => `<option value="off:${d.key}">Стартовая: ${esc(d.title)}</option>`).join('')}
            ${decks.map((d, k) => `<option value="cus:${k}">Моя: ${esc(d.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="filters">
        <input data-name value="${esc(cur.name)}" placeholder="Название колоды">
        <select data-leader>${leaders.map((l) => `<option value="${l.id}" ${l.id === cur.leader ? 'selected' : ''}>Лидер: ${esc(l.name)}</option>`).join('')}</select>
        <select data-type><option value="">Все типы</option>${Object.entries(TYPE_RU).map(([k, v]) => `<option value="${k}" ${f.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <select data-deck><option value="">Все наборы</option>${Object.entries(DECK_RU).map(([k, v]) => `<option value="${k}" ${f.deck === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <input data-q value="${esc(f.q)}" placeholder="Поиск по тексту">
      </div>
      <div class="builder-cols">
        <div class="builder-grid">${list.map((c) => `<div class="bcard" data-id="${c.id}" title="${esc(c.name)}"><img src="${c.img}" loading="lazy" alt="">${count(c.id) ? `<div class="cnt">${count(c.id)}</div>` : ''}</div>`).join('')}</div>
        <div class="blist">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><b style="font-size:18px;color:${ok ? 'var(--green)' : 'var(--gold)'}">${cur.cards.length} / 40+</b>
          <span style="font-size:13px;color:var(--ink-dim)">нажмите — убрать</span></div>
          ${rows || '<p style="color:var(--ink-dim)">Нажимайте на карты слева, чтобы добавить (до 3 копий).</p>'}
          <div style="display:grid;gap:6px;margin-top:10px">
            <button class="btn primary small" data-save ${ok ? '' : 'disabled'}>Сохранить колоду</button>
            ${editIndex >= 0 ? '<button class="btn danger small" data-del>Удалить колоду</button>' : ''}
            <button class="btn small" data-clear>Очистить</button>
          </div>
        </div>
      </div></div>`;
    root.querySelector('[data-back]').onclick = onBack;
    root.querySelectorAll('.bcard').forEach((e) => e.addEventListener('click', () => { const id = Number(e.dataset.id); if (count(id) < 3) { cur.cards.push(id); draw(); } }));
    root.querySelectorAll('.blist .row').forEach((e) => e.addEventListener('click', () => { const id = Number(e.dataset.id); const ix = cur.cards.indexOf(id); if (ix >= 0) cur.cards.splice(ix, 1); draw(); }));
    root.querySelector('[data-name]').oninput = (e) => { cur.name = e.target.value; };
    root.querySelector('[data-leader]').onchange = (e) => { cur.leader = Number(e.target.value); };
    root.querySelector('[data-type]').onchange = (e) => { f.type = e.target.value; draw(); };
    root.querySelector('[data-deck]').onchange = (e) => { f.deck = e.target.value; draw(); };
    root.querySelector('[data-q]').onchange = (e) => { f.q = e.target.value; draw(); };
    root.querySelector('[data-load]').onchange = (e) => {
      const v = e.target.value;
      if (v.startsWith('off:')) { const d = DECKS[v.slice(4)]; cur = { name: d.title + ' (копия)', leader: d.leader, cards: [...d.main] }; editIndex = -1; }
      if (v.startsWith('cus:')) { editIndex = Number(v.slice(4)); const d = decks[editIndex]; cur = { name: d.name, leader: d.leader, cards: [...d.cards] }; }
      draw();
    };
    root.querySelector('[data-save]').onclick = () => {
      const d = { name: cur.name || 'Моя колода', leader: cur.leader, cards: [...cur.cards] };
      if (editIndex >= 0) decks[editIndex] = d; else { decks.push(d); editIndex = decks.length - 1; }
      save(); draw();
    };
    const del = root.querySelector('[data-del]');
    if (del) del.onclick = () => { if (confirm('Удалить колоду?')) { decks.splice(editIndex, 1); editIndex = -1; save(); cur = { name: 'Моя колода', leader: leaders[0].id, cards: [] }; draw(); } };
    root.querySelector('[data-clear]').onclick = () => { cur.cards = []; draw(); };
  }
  draw();
}
