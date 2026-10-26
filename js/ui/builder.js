// Deck builder: "My decks" gallery and the editor (leader + at least 40 cards, max 3 copies), saved in this browser.
import { CARDS } from '../data/cards.js';
import { DECKS } from '../data/decks.js';
import { esc, cardZoom } from './board.js';
cardZoom(); // pointing at a card shows it big
import { linkTerms } from './glossary.js';
import { sfx } from './sound.js';
import { loadCardStats, loadDecks, loadCommunityDecks, publishDeck } from '../net/ranking.js';
import { FEATURES } from '../features.js';
import { encodeDeck, decodeDeck, deckLink } from '../net/deckcode.js';
import { BOT_DECKS } from '../data/botdecks.js';
import { THEME_DECKS } from '../data/themedecks.js';
// «Готовые сборки»: themed decks (built around one idea) first, then the strong decks the computer uses.
const READY = [...THEME_DECKS, ...BOT_DECKS];
import { loadGames } from './stats.js';

const TYPE_RU = { ally: 'Союзники', place: 'Места', action: 'Действия', item: 'Предметы', companion: 'Напарники' };
const TYPE_ICO = { ally: '⚔️', place: '🏰', action: '✨', item: '🎒', companion: '🤝' };
const DECK_RU = { levenheart: 'Лёвенхарт', larisa: 'Лариса', vampires: 'Вампиры', sofia_erik: 'София и Эрик', set1_other: 'Первый набор' };
const MIN = 40, MAX_COPIES = 3;

export function loadCustomDecks(store) { return store.get('decks', []); }
// The six Leaders have new paintings (square face crops); other cards keep their card picture.
const LEADER_FACES = new Set([20, 41, 62, 63, 117, 118]);
const leaderPic = (id) => (LEADER_FACES.has(Number(id)) ? `background-image:url('assets/leaders/face/${id}.webp');background-size:cover;background-position:50% 40%` : `background-image:url('${CARDS[id]?.img}')`);
const costNum = (c) => (typeof c.cost === 'number' ? c.cost : 0);

// Win rates for the builder: world numbers from the shared ranking (players' games), else your own games.
const MIN_GAMES = 5;
let WR = null; // { cards: Map(id → {games, wins}), decks: Map(title → {games, wins}), world: bool }
async function loadWinRates() {
  if (WR) return WR;
  let cards = null, decks = new Map();
  try { cards = await loadCardStats(); } catch { cards = null; }
  try { for (const d of await loadDecks('all')) decks.set(d.deck, { games: d.games, wins: d.wins }); } catch { /* offline */ }
  const world = !!(cards && cards.size);
  if (!world) {
    cards = new Map();
    for (const g of loadGames()) for (const id of new Set(g.played || [])) { const r = cards.get(id) || { games: 0, wins: 0 }; r.games++; if (g.result === 'win') r.wins++; cards.set(id, r); }
  }
  WR = { cards, decks, world };
  return WR;
}
const wrBadge = (r) => {
  if (!r || r.games < MIN_GAMES) return '';
  const p = Math.round((r.wins / r.games) * 100);
  return `<div class="wr ${p >= 55 ? 'hi' : p <= 45 ? 'lo' : ''}" data-tip="Процент побед|${p}%: колоды с этой картой выиграли ${r.wins} из ${r.games} партий.">${p}%</div>`;
};

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
    if (!WR) loadWinRates().then(() => { if (root.querySelector('.bld-gal')) gallery(); });
    root.innerHTML = `<div class="bld">
      <div class="bld-top"><button class="btn" data-back>← Назад</button><h2>Мои колоды</h2><span></span></div>
      <div class="bld-gal">
        <div class="bld-tile new" data-new><div class="plus">＋</div><b>Новая колода</b><small>Выберите Лидера и соберите 40+ карт</small></div>
        <div class="bld-tile new" data-paste><div class="plus">🔗</div><b>Колода по коду</b><small>Вставьте код или ссылку, которую вам прислали</small></div>
        ${decks.map((d, k) => `<div class="bld-tile" data-edit="${k}"><div class="face" style="${leaderPic(d.leader)}"></div>
          <b>${esc(d.name)}</b><small>${esc((CARDS[d.leader]?.name || '').split(',')[0])} · ${d.cards.length} карт ${d.cards.length >= MIN ? '✔' : '⚠'}</small></div>`).join('')}
      </div>
      ${FEATURES.community ? '<h3 class="bld-h3">Колоды сообщества</h3><div class="bld-gal small bld-comm"><p class="bld-note">Загружаем…</p></div>' : ''}
      ${READY.length ? `<h3 class="bld-h3">Готовые сборки</h3><div class="bld-gal small">${READY.map((d, k) => `<div class="bld-tile" data-build="${k}" data-tip="${esc(d.title)}|${esc(d.desc)}"><div class="face" style="${leaderPic(d.leader)}"></div><b>${esc(d.title)}</b><small>${d.style === 'theme' ? `${esc((CARDS[d.leader]?.name || '').split(',')[0])} · своя тема` : 'сильная сборка'} · скопировать</small></div>`).join('')}</div>` : ''}
      <h3 class="bld-h3">Начать со стартовой скрижали</h3>
      <div class="bld-gal small">${Object.values(DECKS).map((d) => `<div class="bld-tile" data-copy="${d.key}"><div class="face" style="${leaderPic(d.leader)}"></div><b>${esc(d.title)}</b><small>скопировать и изменить${(() => { const r = WR?.decks.get(d.title); return r && r.games >= MIN_GAMES ? ` · побед ${Math.round((r.wins / r.games) * 100)}% из ${r.games}` : ''; })()}</small></div>`).join('')}</div>
    </div>`;
    root.querySelector('[data-back]').onclick = () => { sfx.click(); onBack(); };
    root.querySelector('[data-new]').onclick = () => { sfx.select(); pickLeader(); };
    root.querySelector('[data-paste]').onclick = () => {
      sfx.select();
      const v = prompt('Вставьте код колоды или ссылку на неё');
      if (v == null) return;
      const d = decodeDeck(v);
      if (!d) { flashMsg('Код не подошёл — проверьте, что он скопирован целиком'); return; }
      const nm = (() => { try { return decodeURIComponent((v.match(/[?&]dn=([^&]*)/) || [])[1] || ''); } catch { return ''; } })();
      editor({ name: nm || 'Колода от друга', leader: d.leader, cards: d.cards }, -1);
    };
    root.querySelectorAll('[data-edit]').forEach((e) => { e.onclick = () => { sfx.select(); const k = Number(e.dataset.edit); editor({ ...decks[k], cards: [...decks[k].cards] }, k); }; });
    if (FEATURES.community) {
      loadCommunityDecks().then((list) => {
        const box = root.querySelector('.bld-comm'); if (!box) return;
        const wr = (t) => { const r = WR?.decks.get(t); return r && r.games >= MIN_GAMES ? ` · побед ${Math.round((r.wins / r.games) * 100)}%` : ''; };
        box.innerHTML = list.length ? list.map((d, k) => `<div class="bld-tile" data-comm="${k}"><div class="face" style="${leaderPic(d.leader)}"></div><b>${esc(d.name)}</b><small>${esc(d.author || 'Игрок')} · ${d.cards.length} карт${wr(d.name)} · скопировать</small></div>`).join('') : '<p class="bld-note">Пока никто не опубликовал колоду. Соберите свою и нажмите «Опубликовать».</p>';
        box.querySelectorAll('[data-comm]').forEach((e) => { e.onclick = () => { sfx.select(); const d = list[Number(e.dataset.comm)]; editor({ name: d.name + ' — копия', leader: d.leader, cards: [...d.cards].filter((id) => CARDS[id]) }, -1); }; });
      }).catch(() => { const box = root.querySelector('.bld-comm'); if (box) box.innerHTML = '<p class="bld-note">Колоды сообщества сейчас недоступны.</p>'; });
    }
    root.querySelectorAll('[data-build]').forEach((e) => { e.onclick = () => { sfx.select(); const d = READY[Number(e.dataset.build)]; editor({ name: d.title, leader: d.leader, cards: [...d.cards] }, -1); }; });
    root.querySelectorAll('[data-copy]').forEach((e) => { e.onclick = () => { sfx.select(); const d = DECKS[e.dataset.copy]; editor({ name: d.title + ' — моя', leader: d.leader, cards: [...d.main] }, -1); }; });
  }

  // ---------- leader choice ----------
  function pickLeader() {
    root.innerHTML = `<div class="bld"><div class="bld-top"><button class="btn" data-back>← Назад</button><h2>Выберите Лидера</h2><span></span></div>
      <div class="bld-leaders">${leaders.map((l) => `<div class="bld-leader" data-id="${l.id}"><div class="face" style="${leaderPic(l.id)}"></div><b>${esc(l.name.split(',')[0])}</b><small>❤️ ${l.hp}</small></div>`).join('')}</div>
      <p class="bld-note">Карты не привязаны к Лидеру: можно смешивать любые наборы. Лидер даёт здоровье и особые свойства.</p></div>`;
    root.querySelector('[data-back]').onclick = () => { sfx.click(); gallery(); };
    root.querySelectorAll('.bld-leader').forEach((e) => { e.onclick = () => { sfx.confirm(); const L = CARDS[Number(e.dataset.id)]; editor({ name: 'Колода: ' + L.name.split(',')[0], leader: L.id, cards: [] }, -1); }; });
  }

  // ---------- editor ----------
  function editor(cur, editIndex) {
    const f = { type: '', set: '', cost: null, q: '', sort: 'cost' };
    if (!WR) loadWinRates().then(() => draw());
    let tab = 'cards';
    const count = (id) => cur.cards.filter((x) => x === id).length;
    const draw = () => {
      const list = pool.filter((c) => (!f.type || c.type === f.type) && (!f.set || c.deck === f.set)
        && (f.cost == null || (f.cost === 7 ? costNum(c) >= 7 : costNum(c) === f.cost))
        && (!f.q || (c.name + ' ' + c.text + ' ' + c.subtypes.join(' ')).toLowerCase().includes(f.q.toLowerCase())))
        .sort((a, b) => {
          if (f.sort === 'wr') { const r = (c) => { const x = WR?.cards.get(c.id); return x && x.games >= MIN_GAMES ? x.wins / x.games : -1; }; return r(b) - r(a) || costNum(a) - costNum(b); }
          return costNum(a) - costNum(b) || a.name.localeCompare(b.name);
        });
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
                <select data-set><option value="">Все наборы</option>${Object.entries(DECK_RU).map(([k, v]) => `<option value="${k}" ${f.set === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
                <select data-sort><option value="cost" ${f.sort === 'cost' ? 'selected' : ''}>По цене</option><option value="wr" ${f.sort === 'wr' ? 'selected' : ''}>Сначала самые победные</option></select></div>
              <div class="bld-wrnote">${!WR ? 'Загружаем проценты побед…' : WR.world ? `Процент на карте — как часто выигрывали колоды с ней (мировой рейтинг, от ${MIN_GAMES} партий).` : `Процент на карте — по вашим партиям (от ${MIN_GAMES}). Мировые цифры появятся, когда наберётся статистика.`}</div>
            </div>
            <div class="bld-grid">${list.map((c) => {
              const k = count(c.id);
              return `<div class="bcard2 ${k ? 'in' : ''} ${k >= MAX_COPIES ? 'full' : ''}" data-id="${c.id}"><img src="${c.img}" loading="lazy" alt="">${wrBadge(WR?.cards.get(c.id))}
                ${k ? `<div class="cnt">${k}/${MAX_COPIES}</div><button class="minus" data-minus="${c.id}" data-tip="Убрать одну копию">−</button>` : ''}</div>`;
            }).join('') || '<p class="bld-note">Ничего не найдено.</p>'}</div>
          </div>
          <div class="bld-deck">
            <div class="bld-curve" data-tip="Кривая цен|Сколько карт каждой цены. Хорошая колода — много дешёвых карт (1–3) и немного дорогих.">
              ${curve.map((v, i) => `<div class="cc"><div class="bar" style="height:${(v / maxC) * 100}%"><span>${v || ''}</span></div><i>${i === 7 ? '7+' : i}</i></div>`).join('')}
            </div>
            <div class="bld-types">${Object.entries(types).filter(([, v]) => v).map(([k, v]) => `<span>${TYPE_ICO[k]} ${v}</span>`).join('')}</div>
            <div class="bld-list">${rows.map((c) => `<div class="bld-row" data-row="${c.id}" style="${c.img ? `--art:url('${new URL(c.img, location.href).href}')` : ''}"><span class="cost">${c.cost ?? 0}</span><span class="nm">${esc(c.name.split(',')[0])}</span><span class="x">×${by[c.id]}</span></div>`).join('') || `<p class="bld-note">Нажимайте на карты, чтобы добавить их в колоду (до ${MAX_COPIES} копий).</p>`}</div>
            <div class="bld-actions">
              <button class="btn primary" data-save ${ok ? '' : 'disabled'} data-tip="${ok ? 'Сохранить|Колода появится в выборе героя.' : `Ещё ${MIN - n} карт|Колода должна быть не меньше ${MIN} карт.`}">💾 Сохранить</button>
              ${opts.onPlay ? `<button class="btn" data-play ${ok ? '' : 'disabled'}>⚔ Сыграть с компьютером</button>` : ''}
              ${FEATURES.community ? `<button class="btn small" data-publish ${ok ? '' : 'disabled'} data-tip="Опубликовать|Колода появится в «Колодах сообщества», и её смогут скопировать другие игроки.">🌐 Опубликовать</button>` : ''}
              <button class="btn small" data-share ${n ? '' : 'disabled'} data-tip="Поделиться|Ссылка и код колоды: отправьте их другу, он откроет колоду у себя и сохранит.">🔗 Поделиться</button>
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
      root.querySelector('[data-sort]').onchange = (e) => { f.sort = e.target.value; draw(); };
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
      const pub = root.querySelector('[data-publish]');
      if (pub) pub.onclick = async () => { pub.disabled = true; const okp = await publishDeck({ name: cur.name, leader: cur.leader, cards: cur.cards }, opts.author?.() || ''); flash(okp ? 'Колода опубликована в «Колодах сообщества»' : 'Не получилось опубликовать — попробуйте позже'); pub.disabled = false; };
      const sh = root.querySelector('[data-share]');
      if (sh) sh.onclick = () => { sfx.click(); shareBox({ name: cur.name, leader: cur.leader, cards: [...cur.cards] }); };
      root.querySelector('[data-clear]').onclick = () => { if (!cur.cards.length || confirm('Убрать все карты из колоды?')) { cur.cards = []; draw(); } };
      const del = root.querySelector('[data-del]');
      if (del) del.onclick = () => { if (confirm('Удалить эту колоду?')) { decks.splice(editIndex, 1); save(); gallery(); } };
    };
    const remove = (id) => { const ix = cur.cards.indexOf(id); if (ix >= 0) { cur.cards.splice(ix, 1); sfx.click(); draw(); } };
    const flash = (text) => { const t = document.createElement('div'); t.className = 'toast'; t.textContent = text; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); };
    draw();
  }

  if (opts.importDeck) editor({ name: opts.importDeck.name || 'Колода от друга', leader: opts.importDeck.leader, cards: [...opts.importDeck.cards] }, -1);
  else if (opts.startNew) pickLeader(); else gallery();
}

function flashMsg(text) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = text; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }
async function copy(text, msg) {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); flashMsg(msg); return; } } catch { /* fall through */ }
  const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); flashMsg(msg); } catch { flashMsg('Скопируйте вручную'); } ta.remove();
}
/** «Поделиться колодой»: a link and a short code to send to a friend. */
function shareBox(d) {
  const link = deckLink(d), code = encodeDeck(d);
  const b = document.createElement('div');
  b.className = 'modal-back'; b.style.cssText = 'position:fixed;inset:0;z-index:400';
  b.innerHTML = `<div class="modal share-deck" style="max-width:560px;width:94vw"><h3>Поделиться колодой</h3>
    <p style="margin:0 0 10px">Отправьте другу ссылку — колода «${esc(d.name || 'Моя колода')}» откроется у него в редакторе, и он сможет её сохранить. Или продиктуйте код: его вставляют в «Мои колоды» → «Колода по коду».</p>
    <div class="link"><input readonly value="${esc(link)}"><button class="btn small primary" data-cl>Копировать ссылку</button></div>
    <div class="link" style="margin-top:8px"><input readonly value="${esc(code)}"><button class="btn small" data-cc>Копировать код</button></div>
    <div class="row-btns"><button class="btn" data-x>Закрыть</button></div></div>`;
  document.body.appendChild(b);
  b.querySelector('[data-cl]').onclick = () => copy(link, 'Ссылка на колоду скопирована');
  b.querySelector('[data-cc]').onclick = () => copy(code, 'Код колоды скопирован');
  b.querySelector('[data-x]').onclick = () => b.remove();
  b.onclick = (e) => { if (e.target === b) b.remove(); };
}

/** Card text for tooltips in the builder grid. */
export function builderTip(c) { return `${esc(c.name)}|${linkTerms(esc(c.text))}`; }
