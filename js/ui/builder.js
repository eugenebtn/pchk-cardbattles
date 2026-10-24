// Deck builder: "My decks" gallery and the editor (leader + at least 40 cards, max 3 copies), saved in this browser.
import { CARDS } from '../data/cards.js';
import { DECKS } from '../data/decks.js';
import { esc } from './board.js';
import { linkTerms } from './glossary.js';
import { sfx } from './sound.js';

const TYPE_RU = { ally: 'Союзники', place: 'Места', action: 'Действия', item: 'Предметы', companion: 'Напарники' };
const TYPE_ICO = { ally: '⚔️', place: '🏰', action: '✨', item: '🎒', companion: '🤝' };
const DECK_RU = { levenheart: 'Лёвенхарт', larisa: 'Лариса', vampires: 'Вампиры', sofia_erik: 'София и Эрик', set1_other: 'Первый набор' };
const MIN = 40, MAX_COPIES = 3;

export function loadCustomDecks(store) { return store.get('decks', []); }
const costNum = (c) => (typeof c.cost === 'number' ? c.cost : 0);

/**
 * opts: { onPlay(deck) — start a game with the deck, startNew: true — open a new deck at once }
 */
export function renderBuilder(root, store, onBack, opts = {}) {
  const pool = Object.values(CARDS).filter((c) => !c.token && c.type !== 'leader');
  const leaders = Object.values(CARDS).filter((c) => c.type === 'leader');
  let decks = loadCustomDecks(store);
  const save = () => store.set('decks', decks);

  // ---------- gallery ----------
  function gallery() {
    decks = loadCustomDecks(store);
    root.innerHTML = `<div class="bld">
      <div class="bld-top"><button class="btn" data-back>← Назад</button><h2>Мои колоды</h2><span></span></div>
      <div class="bld-gal">
        <div class="bld-tile new" data-new><div class="plus">＋</div><b>Новая колода</b><small>Выберите Лидера и соберите 40+ карт</small></div>
        ${decks.map((d, k) => `<div class="bld-tile" data-edit="${k}"><div class="face" style="background-image:url('${CARDS[d.leader]?.img}')"></div>
          <b>${esc(d.name)}</b><small>${esc((CARDS[d.leader]?.name || '').split(',')[0])} · ${d.cards.length} карт ${d.cards.length >= MIN ? '✔' : '⚠'}</small></div>`).join('')}
      </div>
      <h3 class="bld-h3">Начать со стартовой скрижали</h3>
      <div class="bld-gal small">${Object.values(DECKS).map((d) => `<div class="bld-tile" data-copy="${d.key}"><div class="face" style="background-image:url('${CARDS[d.leader].img}')"></div><b>${esc(d.title)}</b><small>скопировать и изменить</small></div>`).join('')}</div>
    </div>`;
    root.querySelector('[data-back]').onclick = () => { sfx.click(); onBack(); };
    root.querySelector('[data-new]').onclick = () => { sfx.select(); pickLeader(); };
    root.querySelectorAll('[data-edit]').forEach((e) => { e.onclick = () => { sfx.select(); const k = Number(e.dataset.edit); editor({ ...decks[k], cards: [...decks[k].cards] }, k); }; });
    root.querySelectorAll('[data-copy]').forEach((e) => { e.onclick = () => { sfx.select(); const d = DECKS[e.dataset.copy]; editor({ name: d.title + ' — моя', leader: d.leader, cards: [...d.main] }, -1); }; });
  }

  // ---------- leader choice ----------
  function pickLeader() {
    root.innerHTML = `<div class="bld"><div class="bld-top"><button class="btn" data-back>← Назад</button><h2>Выберите Лидера</h2><span></span></div>
      <div class="bld-leaders">${leaders.map((l) => `<div class="bld-leader" data-id="${l.id}"><div class="face" style="background-image:url('${l.img}')"></div><b>${esc(l.name.split(',')[0])}</b><small>❤️ ${l.hp}</small></div>`).join('')}</div>
      <p class="bld-note">Карты не привязаны к Лидеру: можно смешивать любые наборы. Лидер даёт здоровье и особые свойства.</p></div>`;
    root.querySelector('[data-back]').onclick = () => { sfx.click(); gallery(); };
    root.querySelectorAll('.bld-leader').forEach((e) => { e.onclick = () => { sfx.confirm(); const L = CARDS[Number(e.dataset.id)]; editor({ name: 'Колода: ' + L.name.split(',')[0], leader: L.id, cards: [] }, -1); }; });
  }

  // ---------- editor ----------
  function editor(cur, editIndex) {
    const f = { type: '', set: '', cost: null, q: '' };
    let tab = 'cards';
    const count = (id) => cur.cards.filter((x) => x === id).length;
    const draw = () => {
      const list = pool.filter((c) => (!f.type || c.type === f.type) && (!f.set || c.deck === f.set)
        && (f.cost == null || (f.cost === 7 ? costNum(c) >= 7 : costNum(c) === f.cost))
        && (!f.q || (c.name + ' ' + c.text + ' ' + c.subtypes.join(' ')).toLowerCase().includes(f.q.toLowerCase())))
        .sort((a, b) => costNum(a) - costNum(b) || a.name.localeCompare(b.name));
      const by = {};
      for (const id of cur.cards) by[id] = (by[id] || 0) + 1;
      const rows = Object.keys(by).map((id) => CARDS[id]).sort((a, b) => costNum(a) - costNum(b) || a.name.localeCompare(b.name));
      const curve = Array(8).fill(0);
      const types = { ally: 0, place: 0, action: 0, item: 0, companion: 0 };
      for (const id of cur.cards) { const c = CARDS[id]; curve[Math.min(7, costNum(c))]++; types[c.type] = (types[c.type] || 0) + 1; }
      const maxC = Math.max(1, ...curve);
      const n = cur.cards.length, ok = n >= MIN;
      const L = CARDS[cur.leader];
      root.innerHTML = `<div class="bld editor tab-${tab}">
        <div class="bld-top">
          <button class="btn" data-back>← Мои колоды</button>
          <div class="bld-title"><div class="face" style="background-image:url('${L.img}')" data-tip="${esc(L.name)}|❤️ ${L.hp}. ${esc(L.text)}"></div><input data-name value="${esc(cur.name)}" maxlength="40"></div>
          <div class="bld-count ${ok ? 'ok' : ''}" data-tip="Размер колоды|Минимум ${MIN} карт, не больше ${MAX_COPIES} копий одной карты.">${n}<small>/ ${MIN}+</small></div>
        </div>
        <div class="bld-tabs"><button class="btn small ${tab === 'cards' ? 'primary' : ''}" data-tab="cards">Карты</button><button class="btn small ${tab === 'deck' ? 'primary' : ''}" data-tab="deck">Колода (${n})</button></div>
        <div class="bld-body">
          <div class="bld-pool">
            <div class="bld-filters">
              <input data-q value="${esc(f.q)}" placeholder="🔍 Поиск: имя, текст, тип (например «вампир»)">
              <div class="chips">${Object.entries(TYPE_RU).map(([k, v]) => `<button class="chip ${f.type === k ? 'on' : ''}" data-type="${k}">${TYPE_ICO[k]} ${v}</button>`).join('')}</div>
              <div class="chips">${[0, 1, 2, 3, 4, 5, 6, 7].map((c) => `<button class="chip cost ${f.cost === c ? 'on' : ''}" data-cost="${c}">${c === 7 ? '7+' : c}</button>`).join('')}
                <select data-set><option value="">Все наборы</option>${Object.entries(DECK_RU).map(([k, v]) => `<option value="${k}" ${f.set === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
            </div>
            <div class="bld-grid">${list.map((c) => {
              const k = count(c.id);
              return `<div class="bcard2 ${k ? 'in' : ''} ${k >= MAX_COPIES ? 'full' : ''}" data-id="${c.id}"><img src="${c.img}" loading="lazy" alt="">
                ${k ? `<div class="cnt">${k}/${MAX_COPIES}</div><button class="minus" data-minus="${c.id}" data-tip="Убрать одну копию">−</button>` : ''}</div>`;
            }).join('') || '<p class="bld-note">Ничего не найдено.</p>'}</div>
          </div>
          <div class="bld-deck">
            <div class="bld-curve" data-tip="Кривая цен|Сколько карт каждой цены. Хорошая колода — много дешёвых карт (1–3) и немного дорогих.">
              ${curve.map((v, i) => `<div class="cc"><div class="bar" style="height:${(v / maxC) * 100}%"><span>${v || ''}</span></div><i>${i === 7 ? '7+' : i}</i></div>`).join('')}
            </div>
            <div class="bld-types">${Object.entries(types).filter(([, v]) => v).map(([k, v]) => `<span>${TYPE_ICO[k]} ${v}</span>`).join('')}</div>
            <div class="bld-list">${rows.map((c) => `<div class="bld-row" data-row="${c.id}" style="--art:url('${c.img}')"><span class="cost">${c.cost ?? 0}</span><span class="nm">${esc(c.name.split(',')[0])}</span><span class="x">×${by[c.id]}</span></div>`).join('') || `<p class="bld-note">Нажимайте на карты, чтобы добавить их в колоду (до ${MAX_COPIES} копий).</p>`}</div>
            <div class="bld-actions">
              <button class="btn primary" data-save ${ok ? '' : 'disabled'} data-tip="${ok ? 'Сохранить|Колода появится в выборе героя.' : `Ещё ${MIN - n} карт|Колода должна быть не меньше ${MIN} карт.`}">💾 Сохранить</button>
              ${opts.onPlay ? `<button class="btn" data-play ${ok ? '' : 'disabled'}>⚔ Сыграть с компьютером</button>` : ''}
              <button class="btn small" data-clear>Очистить</button>
              ${editIndex >= 0 ? '<button class="btn small danger" data-del>Удалить колоду</button>' : ''}
            </div>
          </div>
        </div>
      </div>`;
      const $$ = (s) => root.querySelectorAll(s);
      root.querySelector('[data-back]').onclick = () => { sfx.click(); gallery(); };
      root.querySelector('[data-name]').oninput = (e) => { cur.name = e.target.value; };
      $$('[data-tab]').forEach((b) => { b.onclick = () => { tab = b.dataset.tab; draw(); }; });
      $$('[data-type]').forEach((b) => { b.onclick = () => { f.type = f.type === b.dataset.type ? '' : b.dataset.type; draw(); }; });
      $$('[data-cost]').forEach((b) => { b.onclick = () => { const v = Number(b.dataset.cost); f.cost = f.cost === v ? null : v; draw(); }; });
      root.querySelector('[data-set]').onchange = (e) => { f.set = e.target.value; draw(); };
      const q = root.querySelector('[data-q]');
      q.oninput = (e) => { f.q = e.target.value; clearTimeout(draw.t); draw.t = setTimeout(() => { draw(); const nq = root.querySelector('[data-q]'); nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); }, 250); };
      $$('.bcard2').forEach((e) => {
        e.onclick = (ev) => {
          if (ev.target.closest('.minus')) return;
          const id = Number(e.dataset.id);
          if (count(id) >= MAX_COPIES) { sfx.error(); return; }
          cur.cards.push(id); sfx.draw(); draw();
        };
        e.oncontextmenu = (ev) => { ev.preventDefault(); remove(Number(e.dataset.id)); };
      });
      $$('[data-minus]').forEach((b) => { b.onclick = (ev) => { ev.stopPropagation(); remove(Number(b.dataset.minus)); }; });
      $$('[data-row]').forEach((r) => { r.onclick = () => remove(Number(r.dataset.row)); });
      root.querySelector('[data-save]').onclick = () => {
        const d = { name: (cur.name || 'Моя колода').trim(), leader: cur.leader, cards: [...cur.cards] };
        if (editIndex >= 0) decks[editIndex] = d; else { decks.push(d); editIndex = decks.length - 1; }
        save(); sfx.confirm(); flash('Колода сохранена — она появится в выборе героя');
        draw();
      };
      const pl = root.querySelector('[data-play]');
      if (pl) pl.onclick = () => { sfx.confirm(); opts.onPlay({ name: cur.name, leader: cur.leader, cards: [...cur.cards] }); };
      root.querySelector('[data-clear]').onclick = () => { if (!cur.cards.length || confirm('Убрать все карты из колоды?')) { cur.cards = []; draw(); } };
      const del = root.querySelector('[data-del]');
      if (del) del.onclick = () => { if (confirm('Удалить эту колоду?')) { decks.splice(editIndex, 1); save(); gallery(); } };
    };
    const remove = (id) => { const ix = cur.cards.indexOf(id); if (ix >= 0) { cur.cards.splice(ix, 1); sfx.click(); draw(); } };
    const flash = (text) => { const t = document.createElement('div'); t.className = 'toast'; t.textContent = text; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); };
    draw();
  }

  if (opts.startNew) pickLeader(); else gallery();
}

/** Card text for tooltips in the builder grid. */
export function builderTip(c) { return `${esc(c.name)}|${linkTerms(esc(c.text))}`; }
