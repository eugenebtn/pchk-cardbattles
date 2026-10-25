// Board renderer: draws a view from one player's perspective, animates events, collects answers.
import { CARDS } from '../data/cards.js';
import * as FX from './fx.js';
import { sfx, playMusic, playAmbient, stopAmbient } from './sound.js';
import { resultPicture, sharePicture, toggleRecording } from './share.js';
import { medalHtml } from './achievements.js';
import { pickLayout } from './layouts.js';
import { linkTerms } from './glossary.js';
import { ICON, KW_SVG, TOK_SVG } from './icons.js';

const KW_ICON = { breakthrough: '💥', defense: '🛡️', maneuver: '🏃', ward: '✨', fast: '⚡', deathtouch: '☠️', bloodsucker: '🩸', indestructible: '🪨', advantage: '🎯' };
const KW_NAME = { breakthrough: 'Прорыв', defense: 'Оборона', maneuver: 'Манёвр', ward: 'Оберег', fast: 'Опережение', deathtouch: 'Смертельный удар', bloodsucker: 'Кровопийца', indestructible: 'Нерушимость', created: 'Созданная', advantage: 'Преимущество' };
const KW_HELP = {
  breakthrough: 'избыточные раны в бою идут Лидеру или Напарнику', defense: 'может принять на себя боевые раны Лидера или Напарника',
  maneuver: 'в начале Сражения может перейти в свободный регион', ward: 'нельзя выбрать целью карт и свойств противника',
  fast: 'можно играть почти в любой момент, в ответ на действия', deathtouch: 'уничтожает любую не-Лидера, которой наносит раны',
  bloodsucker: 'получает 🩸 за боевые раны (+1, если цель погибла)', indestructible: 'не может быть уничтожена свойствами «уничтожить»',
  advantage: 'наносит раны в бою первой', created: 'при уходе с поля убирается из игры',
};
const TOK_ICON = { blood: '🩸', goods: '📦', star: '✨', web: '🕸️', coins: '💰' };
const TYPE_RU = { ally: 'Союзник', place: 'Место', action: 'Действие', item: 'Предмет', companion: 'Напарник', leader: 'Лидер', token: 'Токен' };
const GEN_EMOJI = { 901: '🤡', 902: '🧌' };
const TOK_TIP = { blood: 'Кровь 🩸', goods: 'Товары 📦', star: 'Тайная магия ✨', web: 'Паутина 🕸️', coins: 'Монеты 💰' };

export const cardDef = (id) => CARDS[id];
const plural = (n, one, few, many) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many);
// Old board themes now map to Place cards whose painting fills the battlefield.
const PLACE_THEME = { tavern: 160, castle: 8, dungeon: 33 };
// Short Leader names for the ribbon on the board.
const LEADER_SHORT = { 20: 'Лёвенхарт', 41: 'Крыса Лариса', 62: 'Дан Балан', 63: 'Граф Влад', 117: 'Эрик Пэнисов', 118: 'София' };
const LEADER_ACC = { 20: 'Лёвенхарта', 41: 'Крысу Ларису', 62: 'Дана Балана', 63: 'Графа Влада', 117: 'Эрика Пэнисова', 118: 'Софию' };
/** Background CSS that fits the painted part of a card scan (x 6–94%, y 12–50% — above the name ribbon on every card type) into a w×h box. */
export function artCover(img, w, h, fy = 0.2) {
  const s = Math.max(w / 0.88, h / 0.53);
  const x = -(s * 0.06) - (s * 0.88 - w) * 0.5, y = -(s * 0.167) - (s * 0.53 - h) * fy;
  return `background-image:url('${img}');background-size:${s}px auto;background-position:${x}px ${y}px;background-repeat:no-repeat`;
}

export class BoardUI {
  constructor(stage, { me, onAnswer, onMenu, hotseat = false, theme = 'tavern' }) {
    this.theme = theme;
    this.stage = stage;
    this.board = stage.querySelector('#board');
    this.bindZoom();
    this.ui = stage.querySelector('#ui-layer');
    this.me = me;
    this.onAnswer = onAnswer;
    this.onMenu = onMenu;
    this.els = new Map();
    this.view = null;
    this.q = null;
    this.chosen = new Set();
    this.L = pickLayout();
    FX.initFx(stage);
    this.buildStatic();
    this.previewEl = document.getElementById('preview');
    this.fit();
    this._fit = () => this.fit();
    window.addEventListener('resize', this._fit);
    this._ro = new ResizeObserver(this._fit); this._ro.observe(document.documentElement);
  }
  destroy() { stopAmbient(); window.removeEventListener('resize', this._fit); if (this._keys) window.removeEventListener('keydown', this._keys); this._ro?.disconnect(); this.board.innerHTML = ''; this.ui.innerHTML = ''; this.closeModal(); this.closePriority(); document.querySelectorAll('#game > .tip-card, #game > .over-screen, #game > .pass-screen').forEach((e) => e.remove()); }

  fit() {
    const want = pickLayout();
    if (want !== this.L) {
      // Orientation changed: rebuild the board for the other layout.
      this.L = want;
      this.buildStatic();
      for (const el of this.els.values()) el.remove();
      this.els.clear();
      if (this.view) this.render(this.view);
      this.setPending(this.q);
    }
    const { W, H } = this.L;
    this.stage.style.width = W + 'px'; this.stage.style.height = H + 'px';
    this.stage.classList.toggle('port', this.L.name === 'port');
    this.stage.classList.toggle('land', this.L.name === 'land');
    if (this.L.name === 'port') { this.stage.style.setProperty('--hand-w', this.L.hand.cardW + 'px'); this.stage.style.setProperty('--hand-h', this.L.hand.cardH + 'px'); }
    const s = Math.min(window.innerWidth / W, window.innerHeight / H);
    this.scale = s;
    this.stage.style.transform = `scale(${s})`;
    this.stage.style.left = `${(window.innerWidth - W * s) / 2}px`;
    this.stage.style.top = `${(window.innerHeight - H * s) / 2}px`;
    FX.setSize(W, H);
  }
  regionCol(r) { return this.me === 0 ? r : 4 - r; }

  buildStatic() {
    const L = this.L;
    const b = this.board;
    b.innerHTML = '';
    // The battlefield is one big Place card: black frame, the place's painting inside, a blue name ribbon.
    const [fx, fy, fw, fh] = L.field;
    b.insertAdjacentHTML('beforeend', `<div class="field" style="left:${fx}px;top:${fy}px;width:${fw}px;height:${fh}px"><div class="field-art"></div><div class="field-shade"></div></div>
      <div class="field-ribbon rib place" style="left:${fx + fw / 2 - 210}px;top:${fy - 22}px"></div>`);
    this.cols = [];
    this.slots = { ally: [[], []], place: [[], []] };
    const colTop = L.y.oppPlace - 6, colH = L.y.myPlace + L.place.h + 6 - colTop;
    for (let r = 0; r < 5; r++) {
      const k = this.regionCol(r);
      const col = document.createElement('div');
      col.className = 'region-col'; col.style.left = L.colX(k) + 'px'; col.style.width = L.colW + 'px';
      col.style.top = colTop + 'px'; col.style.height = colH + 'px';
      b.appendChild(col); this.cols[r] = col;
      if (L.regionLabel) {
        const lbl = document.createElement('div');
        lbl.className = 'region-label'; lbl.style.left = L.colX(k) + 'px'; lbl.style.width = L.colW + 'px'; lbl.style.top = (L.midY - 26) + 'px';
        lbl.textContent = `Регион ${k + 1}`;
        b.appendChild(lbl);
      }
      for (const side of [0, 1]) {
        const mine = side === this.me;
        for (const row of ['ally', 'place']) {
          const s = document.createElement('div');
          s.className = `slot ${row}`;
          const sz = L[row];
          s.style.left = (L.colX(k) + sz.dx) + 'px';
          s.style.top = (row === 'ally' ? (mine ? L.y.myAlly : L.y.oppAlly) : (mine ? L.y.myPlace : L.y.oppPlace)) + 'px';
          s.style.width = sz.w + 'px'; s.style.height = sz.h + 'px';
          s.dataset.region = r; s.dataset.row = row; s.dataset.side = side;
          s.addEventListener('click', () => this.clickSlot(s));
          b.appendChild(s);
          this.slots[row][side][r] = s;
        }
      }
    }
    // Piles, names, coins.
    const mk = (cls, pos, html = '') => { const e = document.createElement('div'); e.className = cls; e.style.left = pos.x + 'px'; e.style.top = pos.y + 'px'; e.innerHTML = html; b.appendChild(e); return e; };
    this.piles = {
      myDeck: mk('pile deck', L.piles.myDeck, '<div class="lbl">Скрижаль</div><div class="card-back" style="left:0;top:0"></div><div class="count">0</div>'),
      oppDeck: mk('pile deck', L.piles.oppDeck, '<div class="lbl">Скрижаль</div><div class="card-back" style="left:0;top:0"></div><div class="count">0</div>'),
      myGrave: mk('pile grave', L.piles.myGrave, '<div class="lbl">Кладбище</div><div class="empty">🪦</div><div class="count">0</div>'),
      oppGrave: mk('pile grave', L.piles.oppGrave, '<div class="lbl">Кладбище</div><div class="empty">🪦</div><div class="count">0</div>'),
    };
    for (const [k, t] of Object.entries({ myDeck: 'Ваша Скрижаль (колода)|Сколько карт осталось. Карты берутся сверху.', oppDeck: 'Скрижаль соперника|Сколько карт у него осталось.', myGrave: 'Ваше кладбище|Сыгранные, сброшенные и погибшие карты. Нажмите, чтобы посмотреть.', oppGrave: 'Кладбище соперника|Нажмите, чтобы посмотреть его карты.' })) this.piles[k].setAttribute('data-tip', t);
    this.piles.myGrave.addEventListener('click', () => this.showGrave(this.me));
    this.piles.oppGrave.addEventListener('click', () => this.showGrave(1 - this.me));
    this.names = { me: mk('pname', L.names.me), opp: mk('pname', L.names.opp) };
    this.coinsEl = {
      me: mk('coins', L.coins.me, `<div class="coin-ico">${ICON.coin}</div><span>0</span>`),
      opp: mk('coins', L.coins.opp, `<div class="coin-ico">${ICON.coin}</div><span>0</span>`),
    };
    this.coinsEl.me.setAttribute('data-tip', 'Ваши монеты 💰|Ими платят за карты и свойства. Монеты не сгорают между ходами.');
    this.coinsEl.opp.setAttribute('data-tip', 'Монеты соперника 💰|Сколько он может потратить.');
    this.oppHandCount = L.name === 'port' ? mk('opp-hand-count', { x: 700, y: 24 }, '') : null;
    this.roundBox = mk('round-box', L.round);
    this.roundBox.setAttribute('data-tip', 'Раунд|Ход первого игрока → ход второго → Сражение. Каждый раунд очерёдность меняется.');
    // UI layer: end turn, hint, log, stack, top buttons, prompt.
    const u = this.ui;
    u.innerHTML = `
      <button class="end-turn wait" id="end-turn" data-tip="Кнопка хода|Когда закончите разыгрывать карты — завершите ход. Во время ответа на Опережение — это «Пас»." style="left:${L.end.x}px;top:${L.end.y}px">Ход соперника</button>
      <div class="hint-bar" id="hint" style="left:${L.hint.x}px;top:${L.hint.y}px;width:${L.hint.w}px"></div>
      ${L.log ? `<div class="log-panel" id="log" style="left:${L.log.x}px;top:${L.log.y}px;width:${L.log.w}px;height:${L.log.h}px"></div>` : '<div class="log-panel hidden" id="log"></div>'}
      <div class="stack-panel" id="stack"></div>
      <div class="top-btns">
        <button class="icon-btn hidden" id="btn-undo" data-tip="Отменить ход|Вернуть вашу последнюю карту или действие (только против компьютера). Клавиша Z.">↶</button>
        <button class="icon-btn" id="btn-report" data-tip="Ошибка или отзыв|Сообщить разработчику: снимок экрана и ход партии приложатся сами.">${ICON.report}</button>
        <button class="icon-btn" id="btn-help" data-tip="Как играть|Правила, значки и подсказки.">${ICON.help}</button>
        <button class="icon-btn" id="btn-fast" data-tip="Опережение ⚡|Включить или выключить вопросы «ответить картой с Опережением?».">${ICON.bolt}</button>
        <button class="icon-btn" id="btn-opts" data-tip="Меню|Журнал, скорость, музыка, звук, выход.">${ICON.menu}</button>
      </div>
      <div class="opts-pop hidden" id="opts-pop">
        <button class="btn" id="btn-log">📜 Журнал</button>
        <button class="btn hidden" id="btn-watch">👁 Позвать зрителей</button>
        <button class="btn" id="btn-rec">⏺ Записать видео</button>
        <button class="btn" id="btn-bug">✉ Сообщить об ошибке</button>
        <button class="btn" id="btn-speed">⏩ Скорость</button>
        <button class="btn" id="btn-music">🎵 Музыка</button>
        <button class="btn" id="btn-sound">🔊 Звук</button>
        <button class="btn danger" id="btn-menu">🚪 Выйти в меню</button>
      </div>
      ${L.name === 'land'
    // Wide screens: the prompt sits in the right column (over the hint), so it never covers cards and their health.
    ? `<div class="prompt side" id="prompt" style="left:${L.hint.x + L.hint.w / 2}px;top:${L.hint.y - 8}px"></div>`
    : `<div class="prompt" id="prompt" style="top:${L.midY + 6}px"></div>`}
      <div class="hero-powers" id="powers" style="left:${L.powers.x}px;top:${L.powers.y}px;width:${L.powers.w}px"></div>
      <button class="emote-btn" id="btn-emote" style="left:${L.powers.emote.x}px;top:${L.powers.emote.y}px" data-tip="Реплики|Сказать что-нибудь сопернику.">💬</button>`;
    this.endBtn = u.querySelector('#end-turn');
    this.endBtn.addEventListener('click', () => this.clickEnd());
    this.logEl = u.querySelector('#log');
    this.hintEl = u.querySelector('#hint');
    this.stackEl = u.querySelector('#stack');
    this.promptEl = u.querySelector('#prompt');
    this._promptLeft = this.promptEl.style.left; this._promptTop = this.promptEl.style.top;
    u.querySelector('#btn-menu').addEventListener('click', () => this.onMenu && this.onMenu());
    u.querySelector('#btn-help').addEventListener('click', () => this.showHelp());
    u.querySelector('#btn-report').addEventListener('click', () => this.onFeedback?.());
    u.querySelector('#btn-undo').addEventListener('click', () => this.onUndo?.());
    // Keyboard: Space — end turn / pass, Esc — cancel or close, 1–9 — options in a window, Z — undo.
    if (!this._keys) {
      this._keys = (e) => {
        if (!document.querySelector('#game.active') || /input|textarea|select/i.test(e.target.tagName)) return;
        if (e.code === 'Space') { e.preventDefault(); if (this.modalEl || document.querySelector('#game .priority-panel:not(.hidden)')) { (document.querySelector('#game .priority-panel [data-pass]') || document.querySelector('#game .modal [data-close]'))?.click(); } else this.clickEnd(); }
        else if (e.key === 'Escape') { const c = document.querySelector('#game .modal [data-cancel], #game .modal [data-close], #game .prompt button:last-child'); if (c) c.click(); else this.hidePreview(); }
        else if (/^[1-9]$/.test(e.key)) { const opts = document.querySelectorAll('#game .modal .pick-opt[data-k], #game .modal .draw-opt, #game .modal .choice-card, #game .priority-panel .pri-card'); opts[Number(e.key) - 1]?.click(); }
        else if ((e.key === 'z' || e.key === 'я' || e.key === 'Z' || e.key === 'Я') && this.onUndo) this.onUndo();
      };
      window.addEventListener('keydown', this._keys);
    }
    this.powersEl = u.querySelector('#powers');
    u.querySelector('#btn-emote').addEventListener('click', (e) => { e.stopPropagation(); this.openEmotes(); });
    u.querySelector('#btn-log').addEventListener('click', () => { this.showLog(); u.querySelector('#opts-pop').classList.add('hidden'); });
    u.querySelector('#btn-bug').addEventListener('click', () => { u.querySelector('#opts-pop').classList.add('hidden'); this.onFeedback?.(); });
    u.querySelector('#btn-rec').addEventListener('click', () => { u.querySelector('#opts-pop').classList.add('hidden'); toggleRecording(this.toast); });
    u.querySelector('#btn-watch').addEventListener('click', () => { u.querySelector('#opts-pop').classList.add('hidden'); this.onInviteWatchers?.(); });
    u.querySelector('#btn-opts').addEventListener('click', (e) => { e.stopPropagation(); u.querySelector('#opts-pop').classList.toggle('hidden'); });
    this.ui.addEventListener('click', (e) => { if (!e.target.closest('#opts-pop') && !e.target.closest('#btn-opts')) u.querySelector('#opts-pop')?.classList.add('hidden'); });
    this.stage.style.setProperty('--banner-y', L.bannerY + 'px');
    this.applyTheme();
    if (this.onRebuild) this.onRebuild();
  }

  // ---------- geometry ----------
  stagePoint(el) {
    const r = el.getBoundingClientRect(), sr = this.stage.getBoundingClientRect();
    return { x: (r.left + r.width / 2 - sr.left) / this.scale, y: (r.top + r.height / 2 - sr.top) / this.scale };
  }
  pointOf(uid) {
    const el = this.els.get(uid);
    if (el && el.isConnected) return this.stagePoint(el);
    return null;
  }

  // ---------- rendering ----------
  render(view) {
    this.view = view;
    const L = this.L;
    const me = this.me, op = 1 - me;
    const P = view.players;
    const want = new Map();
    const place = (c, mode, x, y, z = 1) => { if (c) want.set(c.uid, { c, mode, x, y, z }); };
    for (const side of [me, op]) {
      const mine = side === me;
      const p = P[side];
      const lp = mine ? L.leader.me : L.leader.opp;
      place(p.leader, 'leader', lp.x, lp.y, 2);
      p.regions.forEach((reg, r) => {
        const k = this.regionCol(r);
        place(reg.ally, 'ally', L.colX(k) + L.ally.dx, mine ? L.y.myAlly : L.y.oppAlly, 3);
        place(reg.place, 'place', L.colX(k) + L.place.dx, mine ? L.y.myPlace : L.y.oppPlace, 2);
      });
      const sp = mine ? L.support.me : L.support.opp;
      const n = p.support.length;
      const step = n > 1 ? Math.min(L.small.w + 8, Math.floor((sp.max - L.small.w) / (n - 1))) : 0;
      p.support.forEach((c, k) => place(c, 'small', sp.x + k * step, sp.y, 3 + k));
      // Hands.
      const hand = p.hand;
      if (mine) {
        const H = L.hand;
        const n2 = hand.length, w = n2 > 1 ? Math.min(H.step, (H.width - H.cardW) / (n2 - 1)) : 0;
        const x0 = H.cx - (w * (n2 - 1)) / 2 - H.cardW / 2;
        hand.forEach((c, k) => {
          const mid = (n2 - 1) / 2;
          const fan = L.name === 'port' ? 0 : 1;
          want.set(c.uid, { c, mode: c.hidden ? 'back' : 'hand', x: x0 + k * w, y: H.y + Math.abs(k - mid) * 4 * fan, z: 10 + k, rot: (k - mid) * 2.2 * fan });
        });
      } else {
        const H = L.oppHand;
        const n2 = hand.length, w = n2 > 1 ? Math.min(H.step, H.width / (n2 - 1)) : 0;
        const x0 = H.cx - (w * (n2 - 1)) / 2 - 49;
        hand.forEach((c, k) => {
          const mid = (n2 - 1) / 2;
          want.set(c.uid, { c, mode: c.hidden ? 'back' : 'ohand', x: x0 + k * w, y: H.y + Math.abs(k - mid) * 3, z: 10 + k, rot: -(k - mid) * 2.5 });
        });
      }
    }
    // Remove cards that left.
    for (const [uid, el] of this.els) {
      if (!want.has(uid)) {
        this.els.delete(uid);
        this.animateOut(el, uid, view);
      }
    }
    for (const [uid, w] of want) {
      let el = this.els.get(uid);
      const fresh = !el;
      if (fresh) {
        el = document.createElement('div');
        el.dataset.uid = uid;
        el.addEventListener('click', (e) => { e.stopPropagation(); if (el._justDragged) { el._justDragged = false; return; } this.clickCard(Number(uid)); });
        el.addEventListener('pointerdown', (e) => this.dragStart(e, el, Number(uid)));
        el.addEventListener('mouseenter', () => { if (!this.touch()) this.showPreview(Number(uid), el); });
        el.addEventListener('mouseleave', () => { if (!this.touch()) this.hidePreview(); });
        const origin = this.originFor(w, uid);
        el.style.left = origin.x + 'px'; el.style.top = origin.y + 'px';
        el.style.transition = 'none';
        this.board.appendChild(el);
        this.els.set(uid, el);
      }
      this.fillCard(el, w);
      el.style.zIndex = w.z;
      if (fresh) el.getBoundingClientRect();
      el.style.transition = 'left .45s cubic-bezier(.2,.8,.3,1), top .45s cubic-bezier(.2,.8,.3,1), transform .25s';
      el.style.left = w.x + 'px'; el.style.top = w.y + 'px';
      el.style.transform = w.rot ? `rotate(${w.rot}deg)` : '';
    }
    if (this.oppHandCount) this.oppHandCount.innerHTML = `🂠 ${P[op].handCount}`;
    this.renderSide(view);
    this.ui.querySelector('#btn-undo')?.classList.toggle('hidden', !this.onUndo);
    this.renderForecast(view);
    // More than 10 cards in hand: at the end of the turn the extra ones go to the graveyard (the player picks which).
    const nHand = P[this.me]?.hand?.length || 0;
    let lim = this.stage.querySelector('.hand-limit');
    if (nHand > 10) {
      if (!lim) { lim = document.createElement('div'); lim.className = 'hand-limit'; this.stage.appendChild(lim); }
      lim.style.left = this.L.hand.cx + 'px'; lim.style.top = (this.L.hand.y - 34) + 'px';
      lim.innerHTML = `В руке ${nHand} ${plural(nHand, 'карта', 'карты', 'карт')} — лимит 10. В конце вашего хода ${nHand - 10} ${plural(nHand - 10, 'лишняя уйдёт', 'лишние уйдут', 'лишних уйдут')} на кладбище: выберете сами.`;
    } else lim?.remove();
    this.applyInteractivity();
    this.updateHint();
  }
  touch() { return window.matchMedia('(hover: none)').matches; }
  /** Full-screen layer (real screen pixels) for windows and panels. */
  overlay() { return document.querySelector('#game'); }
  originFor(w, uid) {
    const L = this.L;
    if (w.mode === 'hand') return { x: L.piles.myDeck.x, y: L.piles.myDeck.y };
    if (w.mode === 'back' || w.mode === 'ohand') return { x: L.piles.oppDeck.x, y: L.piles.oppDeck.y - 100 };
    if (this._spawnFrom) return { x: this._spawnFrom.x - L.ally.w / 2, y: this._spawnFrom.y - L.ally.h / 2 };
    return { x: w.x, y: w.y };
  }
  animateOut(el, uid, view) {
    let to = null;
    for (const p of view.players) {
      if (p.grave.some((c) => c.uid === uid)) to = p.i === this.me ? this.L.piles.myGrave : this.L.piles.oppGrave;
    }
    el.style.pointerEvents = 'none';
    if (to) {
      el.style.transition = 'left .5s ease-in, top .5s ease-in, opacity .5s, transform .5s';
      el.style.left = to.x + 'px'; el.style.top = to.y + 'px';
      el.style.transform = 'scale(.6) rotate(8deg)';
      el.style.opacity = '0.2';
      setTimeout(() => el.remove(), 520);
    } else {
      el.animate([{ opacity: 1, transform: el.style.transform || 'none', filter: 'brightness(1)' }, { opacity: 0, transform: 'scale(1.25)', filter: 'brightness(3) blur(4px)' }], { duration: 450 }); setTimeout(() => el.remove(), 460);
    }
  }

  /** Battle forecast: in each region, roughly what the next battle does (attack against the card in front, or the Leader). */
  renderForecast(view) {
    this.board.querySelectorAll('.forecast').forEach((e) => e.remove());
    if (!view || view.over || view.phase === 'battle' || !view.players?.[this.me]) return;
    const me = this.me, op = 1 - me, L = this.L;
    for (let r = 0; r < 5; r++) {
      const a = view.players[me].regions[r]?.ally, e = view.players[op].regions[r]?.ally;
      if (!a && !e) continue;
      const hit = (x) => (x && !x.stunned ? x.atk || 0 : 0);
      const parts = [];
      if (a) parts.push(e ? (hit(a) >= e.hp ? `<b class="up">▲ ${hit(a)}</b> 💀` : `<b class="up">▲ ${hit(a)}</b>`) : `<b class="up">▲ ${hit(a)}</b> Лидеру`);
      if (e) parts.push(a ? (hit(e) >= a.hp ? `<b class="dn">▼ ${hit(e)}</b> 💀` : `<b class="dn">▼ ${hit(e)}</b>`) : `<b class="dn">▼ ${hit(e)}</b> ${this.spectator ? 'Лидеру' : 'вам'}`);
      const f = document.createElement('div');
      f.className = 'forecast';
      f.style.left = (L.colX(r) + L.colW / 2) + 'px';
      f.style.top = (L.midY - 13) + 'px';
      f.innerHTML = parts.join('<i>·</i>');
      f.dataset.tip = 'Прогноз боя|Примерно, без свойств карт: ▲ — сколько ран нанесёт ваш союзник, ▼ — сколько получит. 💀 — карта, скорее всего, погибнет.';
      this.board.appendChild(f);
    }
  }
  /** Move the neighbours of the hovered hand card aside, so the whole card is visible. */
  spreadHand(over) {
    const cards = [...this.board.querySelectorAll('.hand-card')].sort((a, b) => parseFloat(a.style.left) - parseFloat(b.style.left));
    const k = cards.indexOf(over);
    const step = cards.length > 1 ? parseFloat(cards[1].style.left) - parseFloat(cards[0].style.left) : 999;
    const push = Math.max(0, Math.min(70, (this.L.hand.cardW * 0.95) - step));
    cards.forEach((c, i) => { c.style.translate = k < 0 || i === k || !push ? '' : `${i < k ? -push : push}px 0`; });
  }
  fillCard(el, w) {
    const c = w.c;
    const d = c.hidden ? null : CARDS[c.id];
    const key = JSON.stringify([w.mode, c.id, c.atk, c.hp, c.maxHp, c.tok, c.kws, c.stunned, c.equip, c.cost, c.hidden, c.created, c.extraTypes]);
    if (el.dataset.key === key) return;
    const prev = el.dataset.key ? JSON.parse(el.dataset.key) : null;
    el.dataset.key = key;
    const img = d?.img;
    const bg = img ? `background-image:url('${img}')` : '';
    const gen = !img && d ? `<div class="gen-art" style="position:absolute;inset:0;border-radius:inherit">${GEN_EMOJI[c.id] || '✨'}</div>` : '';
    if (w.mode === 'back' || (w.mode === 'ohand' && !d)) {
      el.className = 'card-back';
      el.innerHTML = '';
      return;
    }
    if (w.mode === 'hand' || w.mode === 'ohand') {
      el.className = 'hand-card';
      const base = d.cost;
      let costHtml = '';
      if (w.mode === 'hand' && (c.cost ?? base) != null) {
        const now = c.cost ?? base;
        const cls = now === 'X' || base == null ? '' : now < base ? 'cheaper' : now > base ? 'dearer' : '';
        costHtml = `<div class="cost-now ${cls}" data-tip="Цена ${now}|${cls === 'cheaper' ? `Дешевле обычного (на карте ${base}).` : cls === 'dearer' ? `Дороже обычного (на карте ${base}).` : 'Столько монет нужно, чтобы разыграть карту.'}">${now}</div>`;
      }
      el.innerHTML = `<div class="face" style="${bg}">${gen}</div><div class="gloss"></div>${costHtml}${!img ? `<div class="nm" style="bottom:12px">${d.name}</div>` : ''}`;
      if (!el._spread) {
        el._spread = true;
        el.addEventListener('mouseenter', () => { if (!this.touch()) this.spreadHand(el); });
        el.addEventListener('mouseleave', () => this.spreadHand(null));
      }
      if (!el._tilt) {
        el._tilt = true;
        el.addEventListener('mousemove', (e) => {
          const r = el.getBoundingClientRect();
          const nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5;
          const f = el.querySelector('.face');
          if (f) f.style.transform = `perspective(600px) rotateY(${nx * 7}deg) rotateX(${-ny * 7}deg)`;
        });
        el.addEventListener('mouseleave', () => { const f = el.querySelector('.face'); if (f) f.style.transform = ''; });
      }
      return;
    }
    const mode = w.mode;
    const cls = ['card', mode === 'small' ? `small ${d.type}` : mode];
    if (d.legend) cls.push('legend');
    if (d.rarity === 'Золото') cls.push('gold');
    if (c.created) cls.push('created');
    const kws = c.kws || [];
    for (const k of ['defense', 'indestructible', 'breakthrough', 'deathtouch']) if (kws.includes(k)) cls.push(k);
    if (c.stunned) cls.push('stunned');
    el.className = cls.join(' ');
    let stats = '';
    if (c.atk != null && d.type === 'ally') {
      const buffed = c.atk > (d.atk ?? 0);
      stats += `<div class="stat atk ${buffed ? 'buffed' : ''}" data-tip="Атака ${c.atk}|Столько ран этот союзник наносит в бою.${buffed ? ' Усилен (зелёное число).' : ''}">${c.atk}</div>`;
    }
    if (c.hp != null) {
      const hurt = c.dmg > 0 || (d.type === 'leader' && c.hp < c.maxHp);
      const buffed = c.maxHp > (d.hp ?? 0) && !hurt;
      stats += `<div class="stat hp ${hurt ? 'hurt' : ''} ${buffed ? 'buffed' : ''}" data-tip="Здоровье ${c.hp}${c.maxHp ? ' из ' + c.maxHp : ''}|${d.type === 'leader' ? 'Если здоровье Лидера упадёт до 0 — игрок проиграл.' : 'Когда раны сравняются со здоровьем, карта погибнет.'}${hurt ? ' Ранен (красное число).' : ''}">${c.hp}</div>`;
    }
    let kwIcons = kws.filter((k) => KW_ICON[k] && k !== 'defense' && k !== 'ward').map((k) => `<div class="kw" data-tip="${KW_NAME[k]}|${KW_HELP[k]}">${KW_SVG[k] || KW_ICON[k]}</div>`).join('');
    // States that matter in the next battle, as clear badges on the card itself.
    if (c.stunned) kwIcons = `<div class="kw state stun" data-tip="Оглушена|В следующем Сражении не нанесёт ран.">💫</div>` + kwIcons;
    if (kws.includes('ward')) kwIcons = `<div class="kw state ward" data-tip="${KW_NAME.ward || 'Оберег'}|${KW_HELP.ward || 'Её нельзя выбрать целью.'}">✨</div>` + kwIcons;
    const toks = Object.entries(c.tok || {}).filter(([, n]) => n > 0).map(([t, n]) => `<div class="tok ${t}" data-tip="${TOK_TIP[t] || 'Фишки'}|${n} шт. Тратятся на свойства этой карты.">${TOK_SVG[t] || TOK_ICON[t] || t}<b>${n}</b></div>`).join('');
    const showName = mode !== 'small';
    el.innerHTML = `
      <div class="shadow"></div>
      ${kws.includes('defense') && mode !== 'leader' ? '<div class="taunt"></div>' : ''}
      <div class="frame"></div>
      <div class="face" style="${bg}">${gen}</div><div class="shade"></div>
      ${d.legend && mode !== 'leader' ? '<div class="legend-medal" data-tip="Легенда|У вас на поле не может быть двух Легенд с одним именем."></div>' : ''}
      ${showName ? (() => { const nm = mode === 'leader' ? (LEADER_SHORT[c.id] || d.name.split(',')[0]) : d.name.split(',')[0]; const len = nm.length; const fit = mode === 'leader' ? (len > 9 ? 'lname-long' : '') : len > (mode === 'place' ? 18 : 12) ? 'two' : len <= 8 ? 'big' : ''; return `<div class="nm rib ${d.type} ${fit}"><span>${nm}</span></div>`; })() : ''}
      ${stats}
      ${kwIcons ? `<div class="kw-row">${kwIcons}</div>` : ''}
      ${toks ? `<div class="tok-row">${toks}</div>` : ''}
      ${kws.includes('ward') ? '<div class="ward-bubble"></div>' : ''}
      ${c.stunned ? '<div class="stun-stars"><span>⭐</span><span>💫</span><span>⭐</span></div>' : ''}
      ${c.equip ? '<div class="equip-mark">⚔️</div>' : ''}`;
    if (prev && prev[0] === w.mode) {
      if (prev[2] !== c.atk) el.querySelector('.stat.atk')?.classList.add('bump');
      if (prev[3] !== c.hp) el.querySelector('.stat.hp')?.classList.add('bump');
    }
  }

  /** Break a card into flying fragments of its own art (death). */
  shatter(el) {
    const face = el.querySelector('.face');
    if (!face) return;
    const fxl = this.stage.querySelector('#fx-layer');
    const sr = this.stage.getBoundingClientRect(), s = this.scale;
    const fr = face.getBoundingClientRect();
    const W = fr.width / s, H = fr.height / s;
    const x0 = (fr.left - sr.left) / s, y0 = (fr.top - sr.top) / s;
    const cs = getComputedStyle(face);
    const bgImg = cs.backgroundImage;
    const sizePct = parseFloat(cs.backgroundSize) / 100 || 2;
    const bw = W * sizePct, bh = bw * 1.39;
    const [px, py] = cs.backgroundPosition.split(' ').map((v) => parseFloat(v) / 100);
    const offX = (W - bw) * (isNaN(px) ? 0.5 : px), offY = (H - bh) * (isNaN(py) ? 0.26 : py);
    const cols = 4, rows = 5, tw = W / cols, th = H / rows;
    const cx = x0 + W / 2, cy = y0 + H / 2;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const t = document.createElement('div');
      t.className = 'shard-tile';
      const tx = i * tw, ty = j * th;
      const r = () => Math.round(Math.random() * 20);
      t.style.cssText = `left:${x0 + tx}px;top:${y0 + ty}px;width:${tw + 1}px;height:${th + 1}px;background-image:${bgImg};background-size:${bw}px ${bh}px;background-position:${offX - tx}px ${offY - ty}px;clip-path:polygon(${r()}% 0,100% ${r()}%,${80 + r()}% 100%,0 ${80 + r()}%)`;
      fxl.appendChild(t);
      const dx = (x0 + tx + tw / 2 - cx) * (1.2 + Math.random() * 1.6) + (Math.random() - 0.5) * 60;
      const dy = (y0 + ty + th / 2 - cy) * (1.0 + Math.random()) - 40 - Math.random() * 60;
      const rot = (Math.random() - 0.5) * 540;
      const dur = (900 + Math.random() * 500) / FX.speed;
      t.animate([
        { transform: 'translate(0,0) rotate(0) scale(1)', opacity: 1, filter: 'brightness(1)' },
        { transform: `translate(${dx * 0.6}px,${dy * 0.6}px) rotate(${rot * 0.6}deg) scale(.95)`, opacity: 1, filter: 'brightness(.8)', offset: 0.45 },
        { transform: `translate(${dx}px,${dy + 160}px) rotate(${rot}deg) scale(.7)`, opacity: 0, filter: 'brightness(.4)' },
      ], { duration: dur, easing: 'cubic-bezier(.2,.6,.5,1)', fill: 'forwards' });
      setTimeout(() => t.remove(), dur + 50);
    }
    const soul = document.createElement('div');
    soul.className = 'soul'; soul.style.left = (cx - 20) + 'px'; soul.style.top = (cy - 30) + 'px';
    fxl.appendChild(soul);
    soul.animate([{ transform: 'translateY(0) scale(.6)', opacity: 0 }, { transform: 'translateY(-40px) scale(1)', opacity: 0.9, offset: 0.3 }, { transform: 'translateY(-160px) scale(1.4)', opacity: 0 }], { duration: 1400 / FX.speed });
    setTimeout(() => soul.remove(), 1450 / FX.speed);
    el.style.visibility = 'hidden';
  }

  renderSide(view) {
    const me = this.me, op = 1 - me, P = view.players;
    const setCount = (pile, n) => { pile.querySelector('.count').textContent = n; };
    setCount(this.piles.myDeck, P[me].deckCount); setCount(this.piles.oppDeck, P[op].deckCount);
    for (const [pile, p] of [[this.piles.myGrave, P[me]], [this.piles.oppGrave, P[op]]]) {
      setCount(pile, p.grave.length);
      const top = p.grave[p.grave.length - 1];
      const old = pile.querySelector('.face, .empty');
      const want = top && CARDS[top.id]?.img ? `<div class="face" style="background-image:url('${CARDS[top.id].img}')"></div>` : '<div class="empty">🪦</div>';
      if (old.outerHTML !== want) { old.outerHTML = want; }
    }
    const turnDot = (i) => (view.turn === i && view.phase === 'turn' ? '<span class="turn-dot"></span>' : '');
    this.names.me.innerHTML = `${turnDot(me)}${esc(P[me].name)}`; this.names.me.title = P[me].name;
    this.names.opp.innerHTML = `${turnDot(op)}${esc(P[op].name)}`; this.names.opp.title = P[op].name;
    for (const [el, p] of [[this.coinsEl.me, P[me]], [this.coinsEl.opp, P[op]]]) {
      const span = el.querySelector('span');
      if (span.textContent !== String(p.coins)) { span.textContent = p.coins; span.animate([{ transform: 'scale(1.6)' }, { transform: 'scale(1)' }], { duration: 300 }); }
    }
    const f = view.first;
    const who = (i) => (this.spectator ? this.sideName(i) : i === me ? 'Вы' : 'Соперник');
    const steps = [[who(f), view.phase === 'turn' && view.turn === f], [who(1 - f), view.phase === 'turn' && view.turn === 1 - f], [view.skipBattles ? 'Бой ✖' : 'Бой', view.phase === 'battle']];
    this.roundBox.innerHTML = `<b>Раунд ${view.round || 1}</b><div class="phases">${steps.map(([t, on], k) => `<span class="ph ${on ? 'on' : ''} ${k === 2 ? 'battle' : ''}">${k === 2 ? ICON.swords : ''}${t}</span>`).join('<i>›</i>')}</div>`;
    for (let r = 0; r < 5; r++) this.cols[r].classList.toggle('fighting', view.battleRegion === r);
    // Log.
    const atBottom = this.logEl.scrollTop + this.logEl.clientHeight >= this.logEl.scrollHeight - 10;
    const refs = view.logRefs || [], base = view.log.length - Math.min(40, view.log.length);
    const mini = (ref) => {
      if (!ref) return '';
      const pic = (r) => (r && CARDS[r.id]?.img ? `<i class="lg-pic ${r.ctrl === this.me ? 'mine' : 'theirs'}" style="background-image:url('${CARDS[r.id].img}')"></i>` : '');
      const t = (ref.tgts || []).find((x) => !ref.src || x.uid !== ref.src.uid);
      const a = pic(ref.src), b = pic(t);
      return a || b ? `<span class="lg-pics">${a}${a && b ? '<b>›</b>' : ''}${b}</span>` : '';
    };
    this.logEl.innerHTML = view.log.slice(-40).map((l, k) => `<div ${refs[base + k] ? `data-r="${base + k}" class="has-ref"` : ''}>${mini(refs[base + k])}${esc(l)}</div>`).join('');
    if (!this.logEl._hover) {
      this.logEl._hover = true;
      this.logEl.addEventListener('mouseover', (e) => { const d = e.target.closest('[data-r]'); if (d) this.showLogRef(this.view?.logRefs?.[Number(d.dataset.r)], d); });
      this.logEl.addEventListener('mouseleave', () => this.hideLogRef());
      // A click opens the history taller (upwards, over the hint), another click closes it.
      this.logEl.addEventListener('click', (e) => {
        if (e.target.closest('[data-r]') && this.logEl.classList.contains('open')) return;
        const L = this.L.log; if (!L) return;
        const open = this.logEl.classList.toggle('open');
        this.logEl.style.top = (open ? L.y - 320 : L.y) + 'px';
        this.logEl.style.height = (open ? L.h + 320 : L.h) + 'px';
        if (open) this.logEl.scrollTop = this.logEl.scrollHeight;
      });
    }
    if (atBottom) this.logEl.scrollTop = this.logEl.scrollHeight;
    // Stack.
    this.stackEl.innerHTML = view.stack.length ? '<div style="font-size:13px;color:#9fd0ff">Стопка:</div>' + [...view.stack].reverse().map((it) => `<div class="stack-item ${it.player === me ? '' : 'p1'}">${esc(it.label)}</div>`).join('') : '';
  }

  // ---------- interaction ----------
  /** A Leader at 10 health or less: tense music; at 5 or less: a warning sound (each once a game). */
  leaderDanger() {
    const v = this.view; if (!v || v.over) return;
    const low = Math.min(...v.players.map((pl) => pl.leader?.hp ?? 99));
    this.musicStep();
    if (low <= 5 && !this._danger) { this._danger = true; sfx.danger(); }
  }
  /** Music rises with the game: calm lute → tavern (from round 3 or a Leader at 18 or less) → battle (a Leader at 10 or less). */
  musicStep() {
    const v = this.view; if (!v || v.over) return;
    const low = Math.min(...v.players.map((pl) => pl.leader?.hp ?? 99));
    const step = low <= 10 ? 3 : (v.round >= 3 || low <= 18) ? 2 : 1;
    if (step > (this._musicStep || 1)) { this._musicStep = step; playMusic(step === 3 ? 'musicBattle' : 'musicMid'); }
  }
  /** Move clock (online games with a timer): seconds left shown under the end-turn button. */
  setDeadline(ms) {
    clearInterval(this._clock);
    let el = this.ui.querySelector('.turn-clock');
    if (!ms) { el?.remove(); return; }
    if (!el) { el = document.createElement('div'); el.className = 'turn-clock'; el.style.left = (this.L.end.x) + 'px'; el.style.top = (this.L.end.y + (this.L.name === 'port' ? 80 : 74)) + 'px'; this.ui.appendChild(el); }
    const tick = () => {
      const left = Math.max(0, Math.round((ms - Date.now()) / 1000));
      el.textContent = `⏳ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      el.classList.toggle('low', left <= 10);
      if (left <= 0) clearInterval(this._clock);
    };
    tick(); this._clock = setInterval(tick, 500);
  }
  /** Card pictures inside windows (Опережение, choices, history): pointing at one shows it big next to it. */
  bindZoom() {
    if (document._cardZoom) return;
    document._cardZoom = true;
    const SEL = '.pri-vs-card, .pri-img, .pick-card, .ch-img, .mcard, .lrb-card';
    let z = null;
    const hide = () => { z?.remove(); z = null; };
    document.addEventListener('mouseover', (e) => {
      const el = e.target.closest?.(SEL);
      if (!el) { if (z && !e.target.closest?.('.zoom-card')) hide(); return; }
      const m = (el.style.backgroundImage || getComputedStyle(el).backgroundImage).match(/url\(["']?(.*?)["']?\)/);
      if (!m) return;
      hide();
      z = document.createElement('div');
      z.className = 'zoom-card';
      z.style.backgroundImage = `url('${m[1]}')`;
      document.body.appendChild(z);
      const r = el.getBoundingClientRect(), H = Math.min(innerHeight * 0.78, 640), W = H * 0.716;
      const right = r.right + 16 + W < innerWidth;
      z.style.width = W + 'px'; z.style.height = H + 'px';
      z.style.left = (right ? r.right + 16 : Math.max(8, r.left - 16 - W)) + 'px';
      z.style.top = Math.max(8, Math.min(innerHeight - H - 8, r.top + r.height / 2 - H / 2)) + 'px';
    });
    document.addEventListener('mouseout', (e) => { if (e.target.closest?.(SEL) && !e.relatedTarget?.closest?.(SEL)) hide(); });
    document.addEventListener('click', hide, true);
  }
  /** Short name of a side (its Leader), for the spectator view. */
  sideName(i) { const id = this.view?.players?.[i]?.leader?.id; return LEADER_SHORT[id] || CARDS[id]?.name.split(',')[0] || this.view?.players?.[i]?.name || ''; }
  setPending(q) {
    // Spectators (a computer-vs-computer game, or watching friends) never get questions, windows or hints.
    if (this.spectator) {
      this.q = null; this.closeModal(); this.closePriority(); this.applyInteractivity(); this.renderPrompt();
      this.stage.classList.add('spectating');
      this.endBtn.className = 'end-turn wait'; this.endBtn.textContent = 'Режим зрителя';
      return;
    }
    // A card dropped onto a slot answers the following «where?» question by itself.
    const drop = this._dropRegion;
    this._dropRegion = null;
    if (q && drop != null && q.type === 'region' && q.player === this.me && q.options.some((o) => o.id === drop.region) && (q.row || 'ally') === drop.row) {
      this.q = q; setTimeout(() => { if (this.q === q) this.answer(drop.region); }, 0); return;
    }
    this.q = q;
    this.chosen.clear();
    this.closeModal();
    this.closePriority();
    this.applyInteractivity();
    this.renderPrompt();
    this.updateHint();
    this.maybeTip(q);
  }
  myOptions() { return this.q && this.q.player === this.me ? this.q.options : []; }
  applyInteractivity() {
    for (const el of this.els.values()) el.classList.remove('selectable', 'harm', 'playable', 'fastable', 'usable', 'chosen');
    for (const row of ['ally', 'place']) for (const side of [0, 1]) for (const s of this.slots[row][side]) s.classList.remove('selectable');
    const q = this.q;
    const mine = q && q.player === this.me;
    this.renderPowers();
    this.stage.classList.toggle('choosing', !!(mine && ['region', 'target'].includes(q.type)));
    this.endBtn.className = 'end-turn wait';
    this.endBtn.textContent = this.spectator ? 'Режим зрителя' : this.view?.phase === 'battle' ? 'Сражение' : 'Ход соперника';
    if (!mine) return;
    if (this.isManeuver(q)) { this.endBtn.className = 'end-turn'; this.endBtn.textContent = 'Не перемещать'; }
    if (q.type === 'main' || q.type === 'priority') {
      for (const o of q.options) {
        if (o.kind === 'play') this.els.get(o.uid)?.classList.add(q.type === 'main' ? 'playable' : 'fastable');
        if (o.kind === 'ability') this.els.get(o.uid)?.classList.add('usable');
      }
      if (q.type === 'main') {
        const anyPlay = q.options.some((o) => o.kind !== 'end');
        this.endBtn.className = 'end-turn' + (anyPlay ? '' : ' ready');
        this.endBtn.textContent = 'Завершить ход';
      } else {
        this.endBtn.className = 'end-turn';
        this.endBtn.textContent = 'Пас';
      }
    }
    if (q.type === 'target') {
      const harm = !['buff', 'yes', 'maneuver', 'defense'].includes(q.hint);
      for (const o of q.options) {
        const el = this.els.get(o.id);
        if (el) { el.classList.add('selectable'); if (harm) el.classList.add('harm'); }
      }
    }
    if (q.type === 'region') {
      const side = q.side ?? this.me;
      for (const o of q.options) this.slots[q.row || 'ally'][side][o.id]?.classList.add('selectable');
    }
  }
  renderPrompt() {
    const q = this.q, el = this.promptEl;
    // Highlight the card a question is about (e.g. which of two boats is being moved).
    for (const e of this.board.querySelectorAll('.card.focus')) e.classList.remove('focus');
    for (const e of this.board.querySelectorAll('.slot-prev')) e.remove();
    // Placing an ally: show on every free slot what it will be there (bonuses from Places etc.).
    if (q && q.player === this.me && q.type === 'region' && q.options.some((o) => o.preview)) {
      for (const o of q.options) {
        const pv = o.preview, slot = this.slots[q.row || 'ally']?.[this.me]?.[o.id];
        if (!pv || !slot) continue;
        const da = pv.atk - pv.baseAtk, dh = pv.hp - pv.baseHp;
        const bonus = da || dh || pv.kws.length;
        const pl = pv.place != null ? CARDS[pv.place]?.name : null;
        const note = bonus ? `${da || dh ? `${da >= 0 ? '+' : ''}${da}/${dh >= 0 ? '+' : ''}${dh}` : ''}${pv.kws.length ? ' ' + pv.kws.map((k) => KW_NAME[k] || k).join(', ') : ''}${pl ? ` · ${pl}` : ''}` : (pl ? `без бонуса · ${pl}` : 'без бонуса');
        const el = document.createElement('div');
        el.className = 'slot-prev' + (bonus ? ' bonus' : '');
        el.innerHTML = `<div class="sp-gems"><span class="sp-gem atk">${pv.atk}</span><span class="sp-gem hp">${pv.hp}</span></div><div class="sp-note">${esc(note)}</div>`;
        slot.appendChild(el);
      }
    }
    if (q && q.player === this.me && q.focus != null) this.els.get(q.focus)?.classList.add('focus');
    el.className = this.L.name === 'land' ? 'prompt side' : 'prompt';
    el.innerHTML = '';
    el.style.left = this._promptLeft ?? ''; el.style.top = this._promptTop ?? ''; // back from the «Манёвр» spot
    if (!q) return;
    if (q.player !== this.me) {
      if (this.view?.phase === 'battle') { el.innerHTML = ''; return; }
      el.className = this.L.name === 'land' ? 'prompt side wait' : 'prompt wait';
      el.innerHTML = `<div class="ptext">${q.type === 'priority' ? 'Соперник может ответить…' : 'Соперник думает…'}</div>`;
      return;
    }
    if (this.isManeuver(q)) {
      const fx = this.L.field;
      el.className = 'prompt man-box';
      el.style.left = (fx[0] + fx[2] / 2) + 'px'; el.style.top = (fx[1] + 6) + 'px';
      const step2 = q.type === 'region';
      const who = q.focus != null ? CARDS[this.cardIdOf(q.focus)]?.name.split(',')[0] : '';
      el.innerHTML = `<div class="man-in"><b>🏃 Манёвр</b><span>${step2 ? `Куда переместить «${esc(who)}»? Нажмите на подсвеченный регион.` : 'Можно переместить союзника в соседний свободный регион. Нажмите на подсвеченного союзника.'}</span><button class="btn" data-stay>${step2 ? 'Не перемещать' : 'Оставить всех на местах'}</button></div>`;
      el.querySelector('[data-stay]').onclick = () => { sfx.click(); this.answer(null); };
      return;
    }
    const btns = [];
    let text = q.prompt || '';
    switch (q.type) {
      case 'main': text = ''; break;
      case 'priority': this.openPriority(q); return;
      case 'draw': {
        // Big choice in screen pixels: a card from the deck or a gold coin.
        const me = this.view?.players[this.me];
        const info = { card: `Карта из Скрижали<small>В руке сейчас ${me?.hand.length ?? 0}</small>`, coin: `Монета<small>Сейчас у вас ${me?.coins ?? 0} 💰</small>` };
        this.modal(`<h3>${esc(q.prompt)}</h3><div class="draw-big">${q.options.map((o) => `<button class="draw-opt opt-${o.id}" data-id="${o.id}"><span class="draw-pic"></span><span class="draw-lbl">${info[o.id] || esc(o.label || o.id)}</span></button>`).join('')}</div>`, (m) => {
          m.querySelector('.modal').classList.add('draw-modal');
          m.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => { sfx.click(); this.answer(b.dataset.id); }));
        });
        return;
      }
      case 'pick':
        if (!q.begin) { this.openPick(q); return; }
        for (const o of q.options) btns.push([o.label ?? String(o.id), o.id]);
        break;
      case 'target': {
        const missing = q.options.filter((o) => !this.els.get(o.id));
        if (missing.length) { this.openCardModal(q, { single: true }); return; }
        break;
      }
      case 'region': break;
      case 'multi': this.openCardModal(q); return;
      case 'mulligan': this.openMulligan(q); return;
      default: break;
    }
    // Say plainly what «no» means here, and make it a big button.
    if (q.cancel) btns.push([q.maneuver ? 'Не перемещать' : /^Манёвр/.test(q.prompt || '') ? 'Оставить на месте' : 'Отмена', null]);
    el.innerHTML = (text ? `<div class="ptext">${esc(text)}</div>` : '') + (btns.length ? `<div class="pbtns">${btns.map(([l, v], k) => `<button class="btn small ${v === null ? 'cancel' : ''}" data-k="${k}">${esc(l)}</button>`).join('')}</div>` : '');
    el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { sfx.click(); this.answer(btns[Number(b.dataset.k)][1]); }));
  }
  answer(a) {
    if (!this.q) return;
    const q = this.q;
    this.q = null;
    this.applyInteractivity();
    this.promptEl.innerHTML = '';
    this.closeModal();
    this.closePriority();
    this.hidePreview();
    this.updateHint();
    this.onAnswer(q, a);
  }
  /** The two questions of «Манёвр»: which ally to move, then where. */
  isManeuver(q) { return !!q && (q.maneuver || (q.type === 'region' && /^Манёвр/.test(q.prompt || ''))); }
  clickEnd() {
    const q = this.q;
    if (!q || q.player !== this.me) return;
    if (q.type === 'main') { sfx.click(); this.answer('end'); }
    else if (q.type === 'priority') { sfx.click(); this.answer('pass'); }
    else if (this.isManeuver(q) && q.cancel !== false) { sfx.click(); this.answer(null); }
  }
  clickSlot(s) {
    const q = this.q;
    if (!q || q.player !== this.me || q.type !== 'region') return;
    const r = Number(s.dataset.region);
    if (s.dataset.row !== (q.row || 'ally')) return;
    if (!q.options.some((o) => o.id === r)) return;
    sfx.click();
    this.answer(r);
  }
  /** Mouse drag of a hand card onto the table: play it like in Hearthstone. Touch keeps tap-to-open. */
  dragStart(e, el, uid) {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const q = this.q;
    if (!q || q.player !== this.me || !(q.type === 'main' || q.type === 'priority')) return;
    const plays = q.options.filter((o) => o.kind === 'play' && o.uid === uid);
    if (!plays.length || !el.classList.contains('hand-card')) return;
    const sr = () => this.stage.getBoundingClientRect();
    const toStage = (ev) => { const r = sr(); return { x: (ev.clientX - r.left) / this.scale, y: (ev.clientY - r.top) / this.scale }; };
    const start = toStage(e), x0 = parseFloat(el.style.left), y0 = parseFloat(el.style.top);
    let dragging = false, overSlot = null;
    const handTop = this.L.hand.y - 20;
    const move = (ev) => {
      const p = toStage(ev);
      if (!dragging && Math.hypot(p.x - start.x, p.y - start.y) < 10) return;
      if (!dragging) { dragging = true; el.classList.add('dragging'); el.style.transition = 'transform .15s'; this.hidePreview(); this.stage.classList.add('drag-on'); sfx.select(); }
      el.style.left = (x0 + p.x - start.x) + 'px'; el.style.top = (y0 + p.y - start.y) + 'px';
      el.style.transform = p.y < handTop ? 'scale(.75) rotate(0deg)' : 'scale(1) rotate(0deg)';
      // Which slot is under the cursor?
      el.style.pointerEvents = 'none';
      const hit = document.elementFromPoint(ev.clientX, ev.clientY);
      el.style.pointerEvents = '';
      const slot = hit?.closest?.('.slot');
      const ok = slot && Number(slot.dataset.side) === this.me ? slot : null;
      if (overSlot !== ok) { overSlot?.classList.remove('drop-here'); ok?.classList.add('drop-here'); overSlot = ok; }
      this.stage.classList.toggle('drop-ready', p.y < handTop);
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      this.stage.classList.remove('drag-on', 'drop-ready');
      overSlot?.classList.remove('drop-here');
      if (!dragging) return;
      el._justDragged = true; setTimeout(() => { el._justDragged = false; }, 50);
      el.classList.remove('dragging');
      el.style.transition = 'left .3s cubic-bezier(.2,.8,.3,1), top .3s cubic-bezier(.2,.8,.3,1), transform .3s';
      const p = toStage(ev);
      if (p.y >= handTop || this.q !== q) { el.style.left = x0 + 'px'; el.style.top = y0 + 'px'; el.style.transform = ''; return; }
      if (overSlot) this._dropRegion = { region: Number(overSlot.dataset.region), row: overSlot.dataset.row };
      sfx.click();
      if (plays.length === 1) this.answer(plays[0].id);
      else { el.style.left = x0 + 'px'; el.style.top = y0 + 'px'; el.style.transform = ''; this.openChoiceMenu(uid, plays); }
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }
  clickCard(uid) {
    const q = this.q;
    const own = this.view?.players[this.me]?.leader;
    if (own && own.uid === uid && !(q && q.player === this.me && ['target', 'main', 'priority'].includes(q.type) && q.options.some((o) => o.id === uid || o.uid === uid))) { this.openSheet(uid); return; }
    // Touch screens: a tap opens the big card with its buttons (except picking a target).
    if (this.touch() && !(q && q.player === this.me && q.type === 'target' && q.options.some((o) => o.id === uid))) {
      this.openSheet(uid); return;
    }
    if (!q || q.player !== this.me) { this.openSheet(uid); return; }
    if (q.type === 'target' && q.options.some((o) => o.id === uid)) { sfx.click(); this.answer(uid); return; }
    if (q.type === 'main' || q.type === 'priority') {
      const plays = q.options.filter((o) => o.kind === 'play' && o.uid === uid);
      const abs = q.options.filter((o) => o.kind === 'ability' && o.uid === uid);
      const all = [...plays, ...abs];
      if (all.length === 1) { sfx.click(); this.answer(all[0].id); return; }
      if (all.length > 1) { this.openChoiceMenu(uid, all); return; }
    }
    this.hidePreview();
    if (this.whyCantPlay(uid)) sfx.error();
    this.openSheet(uid);
  }
  /** Plain reason why a card in my hand can't be played right now (null if it is not in my hand). */
  whyCantPlay(uid) {
    const v = this.view, me = v?.players[this.me];
    const c = me?.hand.find((x) => x.uid === uid);
    if (!c || c.hidden) return null;
    const d = CARDS[c.id];
    if (!d) return null;
    const q = this.q && this.q.player === this.me ? this.q : null;
    const myTurn = v.turn === this.me && v.phase === 'turn';
    if (!myTurn && !(d.kw || []).includes('fast')) return 'Сейчас не ваш ход: без Опережения карты играют только в свой ход.';
    if (!q) return 'Дождитесь своей очереди.';
    const onField = [me.leader, ...me.support, ...me.regions.flatMap((r) => [r.ally, r.place])].filter(Boolean);
    if (d.legend && onField.some((x) => CARDS[x.id]?.name === d.name)) return `«${d.name}» — Легенда и уже стоит у вас на поле. Двух Легенд с одним именем держать нельзя.`;
    const cost = c.cost ?? d.cost;
    if (cost !== 'X' && cost != null && cost > me.coins) return `Не хватает монет: нужно ${cost}, у вас ${me.coins}.`;
    if (d.type === 'ally' && me.regions.every((r) => r.ally)) return 'Во всех пяти регионах уже стоят ваши Союзники.';
    if (d.type === 'place' && me.regions.every((r) => r.place)) return 'Во всех пяти регионах уже есть ваши Места.';
    return 'Сейчас нет подходящей цели или не выполнено условие карты.';
  }
  /** One option as a picture with what you get: the side's art, price, stats and text (or the ability's text). */
  choiceCardHtml(o, uid, k) {
    if (o.kind === 'play') {
      const d = CARDS[o.side];
      const stats = d.type === 'ally' ? `<span class="ch-st atk">${d.atk}</span><span class="ch-st hp">${d.hp}</span>` : d.hp != null ? `<span class="ch-st hp">${d.hp}</span>` : '';
      return `<button class="choice-card" data-k="${k}"><div class="ch-img" style="background-image:url('${d.img || ''}')"></div>
        <div class="ch-name">${esc(d.name.split(',')[0])}</div>
        <div class="ch-meta"><span class="ch-cost">${o.cost ?? d.cost} 💰</span>${stats}</div>
        <div class="ch-text">${linkTerms(esc((d.text || '').split('\n').filter((l) => !/^\(.*обратн/i.test(l.trim())).slice(0, 3).join(' ')))}</div>
        <div class="ch-go">Разыграть это</div></button>`;
    }
    const id = this.cardIdOf(uid), d = CARDS[id];
    const line = (d?.text || '').split('\n').find((l) => l.startsWith(o.label)) || o.label;
    return `<button class="choice-card" data-k="${k}"><div class="ch-img" style="background-image:url('${d?.img || ''}')"></div>
      <div class="ch-name">${esc(o.label)}</div><div class="ch-meta"><span class="ch-cost">${esc(costText(o.abCost))}</span></div>
      <div class="ch-text">${linkTerms(esc(line))}</div><div class="ch-go">Использовать</div></button>`;
  }
  openChoiceMenu(uid, opts) {
    const sides = opts.some((o) => o.kind === 'play' && o.side !== this.cardIdOf(uid)) || new Set(opts.filter((o) => o.kind === 'play').map((o) => o.side)).size > 1;
    const title = sides ? 'Какую сторону карты разыграть?' : `Что сделать с «${esc(CARDS[this.cardIdOf(uid)]?.name.split(',')[0] || '')}»?`;
    this.modal(`<h3>${title}</h3><div class="choice-row">${opts.map((o, k) => this.choiceCardHtml(o, uid, k)).join('')}</div>
      <div class="row-btns"><button class="btn danger" data-cancel>Отмена</button></div>`, (m) => {
      m.querySelector('.modal').classList.add('choice-modal');
      m.querySelectorAll('.choice-card').forEach((b) => b.addEventListener('click', () => { const k = Number(b.dataset.k); this.closeModal(); sfx.click(); this.answer(opts[k].id); }));
      m.querySelector('[data-cancel]').addEventListener('click', () => this.closeModal());
    });
  }

  cardIdOf(uid) {
    const v = this.view;
    if (!v) return null;
    for (const p of v.players) {
      for (const c of [p.leader, ...p.support, ...p.hand, ...p.grave, ...(p.mull || []), ...p.regions.flatMap((r) => [r.ally, r.place])]) if (c && c.uid === uid) return c.id;
    }
    return null;
  }
  findCard(uid) {
    const v = this.view;
    for (const p of v.players) for (const c of [p.leader, ...p.support, ...p.hand, ...p.grave, ...(p.mull || []), ...p.regions.flatMap((r) => [r.ally, r.place])]) if (c && c.uid === uid) return c;
    return null;
  }

  /** Leader abilities as always-visible buttons (like a hero power). */
  renderPowers() {
    const el = this.powersEl;
    if (!el || !this.view) return;
    const L = this.view.players[this.me]?.leader;
    const abs = L?.abilities || [];
    const q = this.q && this.q.player === this.me ? this.q : null;
    el.innerHTML = abs.map((a, k) => {
      const opt = q && (q.type === 'main' || q.type === 'priority') ? q.options.find((o) => o.id === `ab:${L.uid}:${k}`) : null;
      const why = opt ? 'Нажмите, чтобы использовать.' : (q ? 'Сейчас нельзя: не хватает ресурсов, нет подходящей цели или не ваш момент.' : 'Можно использовать в свой ход.');
      return `<button class="power ${opt ? 'ready' : ''}" data-k="${k}" data-tip="${esc(a.name)} — ${esc(costText(a.cost))}|${a.fast ? '⚡ С Опережением: можно и в ход соперника. ' : ''}${why}">
        <span class="pw-ico">${a.fast ? ICON.bolt : ICON.crown}</span><span class="pw-name">${esc(a.name)}</span><span class="pw-cost">${esc(costText(a.cost))}</span></button>`;
    }).join('');
    el.querySelectorAll('.power').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const k = Number(b.dataset.k);
      const opt = this.q && this.q.player === this.me ? this.q.options.find((o) => o.id === `ab:${L.uid}:${k}`) : null;
      if (opt) { sfx.click(); this.answer(opt.id); } else { sfx.error(); b.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }], { duration: 260 }); }
    }));
  }

  // ---------- VS intro, themes, easter eggs, emotes ----------
  async intro(view) {
    this.introDone = true;
    const me = this.me, P = view.players;
    const mine = CARDS[P[me].leader.id], theirs = CARDS[P[1 - me].leader.id];
    const port = this.L.name === 'port';
    const layer = document.createElement('div');
    layer.className = 'vs-layer';
    layer.innerHTML = `<div class="vs-bg"></div>
      <div class="vs-hero vme" style="background-image:url('${mine.img}')"><div class="vs-name">${esc(P[me].name)}</div></div>
      <div class="vs-hero vopp" style="background-image:url('${theirs.img}')"><div class="vs-name">${esc(P[1 - me].name)}</div></div>
      <div class="vs-text">VS</div>`;
    this.overlay().appendChild(layer);
    const A = layer.querySelector('.vme'), B = layer.querySelector('.vopp'), V = layer.querySelector('.vs-text'), bg = layer.querySelector('.vs-bg');
    const W = window.innerWidth, H = window.innerHeight;
    const hw = Math.min(W * 0.34, 300, H * 0.42 * 0.72), hh = hw / 0.72;
    for (const el of [A, B]) { el.style.width = hw + 'px'; el.style.height = hh + 'px'; el.style.top = '0'; el.style.left = '0'; }
    const pos = port
      ? { a: { x: W / 2 - hw / 2, y: H * 0.72 - hh / 2 }, b: { x: W / 2 - hw / 2, y: H * 0.28 - hh / 2 } }
      : { a: { x: W * 0.3 - hw / 2, y: H / 2 - hh / 2 }, b: { x: W * 0.7 - hw / 2, y: H / 2 - hh / 2 } };
    const from = port ? { a: { x: pos.a.x, y: H + 40 }, b: { x: pos.b.x, y: -hh - 40 } } : { a: { x: -hw - 40, y: pos.a.y }, b: { x: W + 40, y: pos.b.y } };
    const tr = (p, s = 1, r = 0) => `translate(${p.x}px,${p.y}px) scale(${s}) rotate(${r}deg)`;
    const d = (ms) => ms / FX.speed;
    A.animate([{ transform: tr(from.a, 0.9, -8) }, { transform: tr(pos.a, 1.04, 2), offset: 0.8 }, { transform: tr(pos.a) }], { duration: d(650), easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' });
    B.animate([{ transform: tr(from.b, 0.9, 8) }, { transform: tr(pos.b, 1.04, -2), offset: 0.8 }, { transform: tr(pos.b) }], { duration: d(650), easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' });
    sfx.swing(); setTimeout(() => sfx.swing(), 120);
    await FX.wait(560);
    V.animate([{ transform: 'translate(-50%,-50%) scale(3)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(.9)', opacity: 1, offset: 0.7 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }], { duration: d(380), fill: 'forwards', easing: 'cubic-bezier(.5,0,.3,1.4)' });
    await FX.wait(300);
    sfx.explosion(); FX.shake(2);
    await FX.wait(1100);
    // Leaders fly to their corners on the board.
    const sr = this.stage.getBoundingClientRect(), sc = this.scale;
    const dest = (lp) => ({ x: sr.left + lp.x * sc, y: sr.top + lp.y * sc, w: this.L.leaderSize.w * sc, h: this.L.leaderSize.h * sc });
    const da = dest(this.L.leader.me), db = dest(this.L.leader.opp);
    const fly = (el, p, t) => el.animate([{ transform: tr(p), borderRadius: '20px' }, { transform: `translate(${t.x}px,${t.y}px) scale(${t.w / hw}, ${t.h / hh})`, borderRadius: '50% 50% 18px 18px / 42% 42% 18px 18px' }], { duration: d(620), easing: 'cubic-bezier(.6,0,.3,1)', fill: 'forwards' });
    fly(A, pos.a, da); fly(B, pos.b, db);
    layer.querySelectorAll('.vs-name').forEach((n) => n.animate([{ opacity: 1 }, { opacity: 0 }], { duration: d(200), fill: 'forwards' }));
    V.animate([{ opacity: 1 }, { opacity: 0, transform: 'translate(-50%,-50%) scale(1.6)' }], { duration: d(300), fill: 'forwards' });
    bg.animate([{ opacity: 1 }, { opacity: 0 }], { duration: d(620), fill: 'forwards' });
    sfx.land(true);
    await FX.wait(640);
    layer.remove();
    // The opponent greets.
    if (this.view) setTimeout(() => this.showEmote(1 - this.me, 'Привет!'), 900);
  }

  applyTheme() {
    const id = Number(PLACE_THEME[this.theme] ?? this.theme) || 160;
    const d = CARDS[id];
    const [, , fw, fh] = this.L.field;
    const art = this.board.querySelector('.field-art');
    if (art && d) art.style.cssText = artCover(d.img, fw - 24, fh - 24, 0.5);
    const rib = this.board.querySelector('.field-ribbon');
    if (rib && d) { rib.textContent = d.name; rib.setAttribute('data-tip', `${d.name}|Здесь идёт бой. Место можно выбрать в настройках.`); }
  }
  wander(el) {
    const spots = [[1290, 600], [1460, 620], [1500, 540], [1280, 520], [1420, 690]];
    let k = 0;
    clearInterval(this._wander);
    this._wander = setInterval(() => {
      if (!el.isConnected) { clearInterval(this._wander); return; }
      k = (k + 1 + Math.floor(Math.random() * 3)) % spots.length;
      const [x, y] = spots[k];
      el.style.transition = 'left 2.4s ease-in-out, top 2.4s ease-in-out';
      el.style.transform = x < parseFloat(el.style.left) ? 'scaleX(1)' : 'scaleX(-1)';
      el.style.left = x + 'px'; el.style.top = y + 'px';
    }, 7000);
  }
  /** Easter eggs from the Chicken Curry lore. */
  poke(el, kind) {
    const p = this.stagePoint(el);
    this.pokes = this.pokes || {};
    const n = (this.pokes[kind] = (this.pokes[kind] || 0) + 1);
    const say = (t, ms) => this.bubbleAt(p.x - 40, p.y - 70, t, ms);
    el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35) rotate(-10deg)' }, { transform: 'scale(1)' }], { duration: 400 });
    switch (kind) {
      case 'mug': sfx.blood(); FX.burst(p.x, p.y - 20, { color: ['#fff6e0', '#ffe9a8'], count: 20, speed: 4, gravity: 0.2, size: 7, add: false }); say(['Ваше здоровье!', 'За Королевство Пони!', 'Ещё кружечку — и в Подземелья.', 'Эль из Таверны «Кайф» — лучший в Понии.'][n % 4]); break;
      case 'chicken': sfx.animal(); FX.burst(p.x, p.y, { emoji: ['🪶'], shape: 'emoji', count: 6, speed: 4, gravity: 0.08, add: false, size: 10 }); say(n >= 5 ? 'Ко-ко-ко! Я и есть Чикен Карри!' : ['Ко-ко-ко!', 'Ко? КО-КО!', 'Не трогай курицу, она из карри!'][n % 3]); break;
      case 'd20': {
        const r = 1 + Math.floor(Math.random() * 20);
        sfx.select();
        el.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(720deg) scale(1.3)' }, { transform: 'rotate(1080deg)' }], { duration: 700 });
        setTimeout(() => {
          if (r === 20) { sfx.legend(); FX.burst(p.x, p.y, { emoji: ['✨', '🎉'], shape: 'emoji', count: 16, speed: 7, add: false, size: 12, gravity: 0.15 }); }
          if (r === 1) sfx.lose && sfx.debuff();
          say(r === 20 ? '🎲 20! Критический успех!' : r === 1 ? '🎲 1… Критический провал. Мастер доволен.' : `🎲 Выпало ${r}.`);
        }, 700);
        break;
      }
      case 'sword': sfx.chain(); say(n >= 7 ? 'Меч не вынимается. Сфинктерион уже взял свой, гэнгста-щит в придачу.' : ['Меч застрял в камне.', 'Не поддаётся…', 'Может, нужен герой посильнее?'][n % 3]); break;
      case 'rat': sfx.animal(); el.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(12px)', opacity: 0.2 }, { transform: 'translateY(0)' }], { duration: 900 }); say(['Я буду хорошей крысой, Пэлиас!', 'Пи-пи-пи!', 'Рой крыс уже в пути…'][n % 3]); break;
      case 'crest': sfx.shield(); FX.ring(p.x, p.y, '#ffd84a', 30, 600, 1.6, 5); say(['Герб Лёвенхартов.', 'Вёрджинвальд помнит своих защитников.'][n % 2]); break;
      case 'curry': sfx.fire(); FX.smoke(p.x, p.y - 30, { color: ['#e8e0d0', '#c8beb0'], count: 8, size: 30, alpha: 0.5 }); say(n >= 4 ? 'Карри готово! Только курицу никто не видел…' : ['Бульк…', 'Пахнет карри.', 'Не хватает курицы…'][n % 3]); break;
      case 'skull': sfx.dark(); say(['Ещё один герой в Подземельях…', 'Мастер, а можно перекинуть?', 'Я тоже когда-то кидал d20…'][n % 3]); break;
      case 'candle': sfx.magic(); el.style.opacity = el.style.opacity === '0.35' ? '1' : '0.35'; FX.glow(p.x, p.y - 20, 'rgba(255,200,90,.6)', 60, 500); break;
      default: break;
    }
  }
  bubbleAt(x, y, text, ms = 2600, down = false) {
    const b = document.createElement('div');
    b.className = 'bubble' + (down ? ' down' : '');
    b.textContent = text;
    b.style.left = Math.max(10, Math.min(this.L.W - 340, x)) + 'px'; b.style.top = y + 'px';
    this.ui.appendChild(b);
    if (!down) b.style.transform = 'translateY(-100%)';
    b.animate([{ opacity: 1 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], { duration: ms / FX.speed });
    setTimeout(() => b.remove(), ms / FX.speed);
  }
  /** Leader emote bubble (also used for the opponent and online friends). */
  showEmote(side, text) {
    const L = this.view?.players[side]?.leader;
    const p = L && this.pointOf(L.uid);
    if (!p) return;
    const mine = side === this.me;
    const top = mine ? p.y - 110 : p.y + 70;
    this.bubbleAt(p.x + 40, top, text, 3200, !mine);
    sfx.reveal();
  }
  openEmotes() {
    const L = this.view?.players[this.me]?.leader;
    const p = L && this.pointOf(L.uid);
    if (!p) return;
    this.closeEmotes();
    const quote = CARDS[L.id]?.flavor;
    const items = ['Привет!', 'Спасибо!', 'Отлично сыграно!', 'Упс…', 'Сейчас я тебя!', ...(quote ? [quote] : [])];
    const w = document.createElement('div');
    w.className = 'emote-wheel';
    w.innerHTML = items.map((t, k) => `<button data-k="${k}">${esc(t.length > 42 ? t.slice(0, 40) + '…' : t)}</button>`).join('');
    w.style.left = (p.x + 90) + 'px';
    w.style.top = (this.L.name === 'port' ? p.y - 330 : p.y - 290) + 'px';
    this.ui.appendChild(w);
    this.emoteEl = w;
    w.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const t = items[Number(b.dataset.k)];
      this.closeEmotes();
      this.showEmote(this.me, t);
      this.onEmote && this.onEmote(t);
    }));
    setTimeout(() => document.addEventListener('click', this._closeEm = () => this.closeEmotes(), { once: true }), 0);
  }
  closeEmotes() { if (this.emoteEl) { this.emoteEl.remove(); this.emoteEl = null; } }

  // ---------- explanations ----------
  /** One line under the board that always says what is going on and what to do. */
  updateHint() {
    const el = this.hintEl;
    if (!el || !this.view) return;
    const v = this.view, q = this.q, me = this.me;
    // A short heading in the card-name style + one line in the italic of card quotes, with a gold icon medal.
    let ico = 'scroll-unfurled', title = '', sub = '';
    if (v.over) title = '';
    else if (q && q.player !== me && q.type === 'priority') { ico = 'bolt-shield'; title = 'Соперник может ответить'; sub = 'Ждём, ответит ли он Опережением.'; }
    else if (!q || q.player !== me) {
      if (v.phase === 'battle') { ico = 'crossed-swords'; title = 'Сражение'; sub = 'Союзники бьют друг друга; если напротив пусто — удар по Лидеру.'; }
      else if (v.phase === 'turn' && v.turn !== me) { ico = 'hourglass'; title = 'Ход соперника'; sub = 'Если сможете ответить Опережением — игра спросит.'; }
      else { ico = 'hourglass'; title = 'Подождите…'; }
    } else {
      const coins = v.players[me].coins;
      switch (q.type) {
        case 'main': {
          const plays = q.options.filter((o) => o.kind === 'play').length, abs = q.options.filter((o) => o.kind === 'ability').length;
          ico = 'card-play'; title = `Ваш ход · ${coins} ${plural(coins, 'монета', 'монеты', 'монет')}`;
          sub = plays || abs ? `${plays ? 'Разыграйте карту с зелёной рамкой' : 'Используйте ✦ Свойство'}${plays && abs ? ' или ✦ Свойство' : ''}, затем — «Завершить ход».` : 'Больше нечего разыграть — завершите ход.';
          break;
        }
        case 'draw': ico = 'card-draw'; title = 'Начало хода'; sub = 'Возьмите две: карты или монеты, по одной.'; break;
        case 'region': ico = 'targeted'; title = q.row === 'place' ? 'Куда положить Место?' : 'Куда поставить Союзника?'; sub = q.row === 'place' ? 'Нажмите на подсвеченную ячейку дальнего ряда.' : 'Он бьётся с тем, кто напротив. На ячейках — его сила там.'; break;
        case 'target':
          if (q.defense) { ico = 'checked-shield'; title = 'Оборона'; sub = 'Принять удар на карту с Обороной — или «Отмена».'; }
          else if (q.maneuver) { ico = 'sprint'; title = 'Манёвр'; sub = 'Можно передвинуть союзника в свободный регион.'; }
          else if (q.hint === 'face') { ico = 'crossed-swords'; title = 'Кого бить?'; sub = 'Напротив пусто: выберите Лидера или Напарника соперника.'; }
          else { ico = 'targeted'; title = q.prompt || 'Выберите цель'; sub = q.hint === 'buff' ? 'Подходящие карты подсвечены зелёным.' : 'Цели подсвечены красным.'; }
          break;
        case 'priority': ico = 'bolt-shield'; title = 'Опережение'; sub = 'Ответьте картой или свойством — или «Пропустить».'; break;
        default: title = q.prompt || '';
      }
    }
    el.innerHTML = (this.coachText && q && q.player === me ? `<div class="coach-line" title="${esc(this.coachText)}"><b>Совет:</b> ${esc(this.coachText)}</div>` : '')
      + (title ? `<span class="hint-ico"><i style="-webkit-mask-image:url(assets/icons/${ico}.svg);mask-image:url(assets/icons/${ico}.svg)"></i></span><span class="hint-txt"><b>${esc(title)}</b>${sub ? `<em>${esc(sub)}</em>` : ''}</span>` : '');
    el.classList.toggle('empty', !title);
  }

  /** The «Опережение» decision, explained. */
  openPriority(q) {
    const ctx = q.context || {};
    const me = this.me;
    let what;
    if (ctx.kind === 'stack') {
      const who = ctx.by === me ? 'Вы' : 'Соперник';
      const tg = (ctx.targets || []).map((t) => `${t.ctrl === me ? 'ваш(у)' : 'вражеский(ую)'} «${CARDS[t.id]?.name?.split(',')[0]}»`).join(', ');
      what = `${who} ${ctx.by === me ? 'используете' : 'использует'} «${esc(ctx.label)}»${tg ? ` → ${esc(tg)}` : ''}. Это ещё не сработало.`;
    } else if (ctx.kind === 'battleStart') what = 'Начинается Сражение.';
    else if (ctx.kind === 'regionStart') what = `Начинается бой в регионе ${this.regionCol(ctx.region) + 1}.`;
    else if (ctx.kind === 'turnStart') what = 'Начинается ход соперника.';
    else if (ctx.kind === 'turnEnd') what = 'Соперник заканчивает ход.';
    else what = 'Сейчас можно сыграть карту с Опережением.';
    const opts = q.options.filter((o) => o.id !== 'pass');
    const optHtml = opts.map((o, k) => {
      if (o.kind === 'play') {
        const d = CARDS[o.side];
        return `<button class="pri-card" data-k="${k}"><div class="pri-img" style="background-image:url('${d.img || ''}')"></div><span>Сыграть «${esc(d.name.split(',')[0])}»<br><b>${o.cost} 💰</b></span></button>`;
      }
      const id = this.cardIdOf(o.uid);
      return `<button class="pri-card ab" data-k="${k}"><div class="pri-img" style="background-image:url('${CARDS[id]?.img || ''}')"></div><span>${esc(o.label)}<br><b>${costText(o.abCost)}</b></span></button>`;
    }).join('');
    // The situation as pictures: what is being used ➜ at whom (your cards in red), then your possible answers.
    const tgs = ctx.kind === 'stack' ? (ctx.targets || []) : [];
    const mineHit = tgs.some((t) => t.ctrl === me);
    const pic = (id, cls, lbl) => CARDS[id]?.img ? `<div class="pri-vs"><div class="pri-vs-card ${cls}" style="background-image:url('${CARDS[id].img}')"></div><div class="pri-vs-lbl ${cls}">${lbl}</div></div>` : '';
    const scene = ctx.kind === 'stack' ? `<div class="pri-scene">${pic(ctx.id, ctx.by === me ? 'mine' : 'enemy', ctx.by === me ? 'Ваше действие' : 'Соперник использует')}${tgs.length ? '<div class="pri-arrow">➜</div>' + tgs.map((t) => pic(t.id, t.ctrl === me ? 'threat' : 'enemy', t.ctrl === me ? 'Цель: ваша карта' : 'Цель')).join('') : ''}</div>` : '';
    const head = mineHit ? '⚠ Против вас — можно ответить' : '⚡ Опережение — можно ответить';
    const html = `<div class="pri-head ${mineHit ? 'danger' : ''}">${head}</div>
      <div class="pri-what">${what}</div>
      ${scene}
      <div class="pri-sub">${mineHit ? 'Ваш ответ сработает <b>раньше</b> — успейте защитить карту. Чем можно ответить:' : 'Чем можно ответить (сработает раньше):'}</div>
      <div class="pri-row"><div class="pri-opts">
${optHtml}</div></div>
      <div class="pri-btns"><button class="btn primary" data-pass>Пропустить</button><button class="btn small" data-why>Что это?</button></div>
      <div class="pri-why hidden">Карты и свойства со значком ⚡ можно играть не только в свой ход, но и в ответ на действия соперника, в начале хода и в бою. Ваш ответ срабатывает <b>раньше</b> того, на что вы отвечаете: например, можно усилить союзника до того, как по нему ударит заклинание. Если отвечать не нужно — «Пропустить». Кнопка ⚡ сверху выключает эти вопросы совсем.</div>`;
    const panel = document.createElement('div');
    panel.className = 'priority-panel';
    panel.innerHTML = html;
    this.overlay().appendChild(panel);
    this.priEl = panel;
    // Mark the threatened cards on the board too.
    this._threat = tgs.filter((t) => t.ctrl === me).map((t) => t.uid);
    for (const u of this._threat) this.els.get(u)?.classList.add('threat');
    panel.querySelector('[data-pass]').addEventListener('click', () => { sfx.click(); this.answer('pass'); });
    panel.querySelector('[data-why]').addEventListener('click', () => panel.querySelector('.pri-why').classList.toggle('hidden'));
    panel.querySelectorAll('.pri-card').forEach((b) => {
      const o = opts[Number(b.dataset.k)];
      b.addEventListener('click', () => { sfx.click(); this.answer(o.id); });
    });
  }
  closePriority() {
    if (this.priEl) { this.priEl.remove(); this.priEl = null; }
    for (const u of this._threat || []) this.els.get(u)?.classList.remove('threat');
    this._threat = null;
  }

  /** Big readable card sheet with the actions available for it. */
  openSheet(uid) {
    const c = this.findCard(uid);
    if (!c || c.hidden) return;
    const d = CARDS[c.id];
    const q = this.q && this.q.player === this.me ? this.q : null;
    const acts = [];
    if (q && (q.type === 'main' || q.type === 'priority')) {
      for (const o of q.options) {
        if (o.kind === 'play' && o.uid === uid) acts.push([`▶ Разыграть${o.side !== c.id ? ` «${CARDS[o.side].name.split(',')[0]}»` : ''} — ${o.cost} 💰`, o.id, 'primary']);
        if (o.kind === 'ability' && o.uid === uid) acts.push([`✦ ${o.label} — ${costText(o.abCost)}`, o.id, 'primary']);
      }
    }
    if (q && q.type === 'target' && q.options.some((o) => o.id === uid)) acts.push(['🎯 Выбрать целью', uid, 'primary']);
    if (q && (q.type === 'main' || q.type === 'priority')) {
      const opts = q.options.filter((o) => (o.kind === 'play' || o.kind === 'ability') && o.uid === uid);
      if (opts.length > 1) { this.openChoiceMenu(uid, opts); return; }
    }
    const why = !acts.length && q && (q.type === 'main' || q.type === 'priority') ? this.whyCantPlay(uid) : null;
    this.modal(`<div class="sheet">
        <div class="sheet-img">${d.img ? `<img src="${d.img}" alt="">` : `<div class="gen-card">${GEN_EMOJI[c.id] || '✨'}<br>${esc(d.name)}</div>`}</div>
        <div class="sheet-info">${cardInfoHtml(d, c)}
          ${why ? `<div class="sheet-why"><b>Сейчас нельзя сыграть.</b> ${esc(why)}</div>` : ''}
          <div class="sheet-acts">${acts.map(([l], k) => `<button class="btn ${acts[k][2]}" data-k="${k}">${esc(l)}</button>`).join('')}<button class="btn" data-close>Закрыть</button></div>
        </div></div>`, (m) => {
      m.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => { const a = acts[Number(b.dataset.k)]; this.closeModal(); sfx.click(); this.answer(a[1]); }));
      m.querySelector('[data-close]').addEventListener('click', () => this.closeModal());
      m.addEventListener('click', (e) => { if (e.target === m) this.closeModal(); });
    });
    this.modalEl.classList.add('sheet-back');
  }
  showHelp() {
    this.modal(`<div class="help">
      <h3>Как играть</h3>
      <p><b>Цель:</b> довести здоровье вражеского Лидера до 0 (число в красной капле на его портрете).</p>
      <p><b>Ход:</b> возьмите 2 — карты или монеты 💰. Потом разыгрывайте карты: цена в монетах — в кружке слева вверху карты. Союзников ставьте в ближний ряд, Места — в дальний; Напарники и Предметы встают к Лидеру.</p>
      <p><b>Раунд:</b> ход первого игрока → ход второго → ⚔ Сражение. Потом очерёдность меняется.</p>
      <p><b>Сражение:</b> в каждом регионе союзники напротив друг друга бьют одновременно (жёлтое число — атака, красное — здоровье). Если напротив пусто — удар идёт в Лидера или Напарника.</p>
      <p><b>⚡ Опережение:</b> такие карты и свойства можно играть в ответ на действия соперника и в бою — они срабатывают раньше. Игра сама предложит.</p>
      <div class="help-icons">
        <div>💥 <b>Прорыв</b> — лишние раны идут Лидеру</div><div>🛡️ <b>Оборона</b> — принимает удар на себя</div>
        <div>✨ <b>Оберег</b> — нельзя выбрать целью</div><div>🏃 <b>Манёвр</b> — перебегает перед боем</div>
        <div>☠️ <b>Смертельный удар</b> — убивает любой раной</div><div>🩸 <b>Кровопийца</b> — копит кровь за удары</div>
        <div>🪨 <b>Нерушимость</b> — не уничтожить эффектом</div><div>💫 <b>Оглушён</b> — не бьёт в следующем бою</div>
      </div>
      <p><b>Подсветка:</b> зелёная — можно сыграть, синяя — есть свойство, красная — цель-враг. Нажмите на любую карту, чтобы прочитать её крупно.</p>
      <div class="row-btns"><button class="btn primary" data-close>Понятно</button><button class="btn small" data-tips>Показать подсказки заново</button></div></div>`, (m) => {
      m.querySelector('[data-close]').addEventListener('click', () => this.closeModal());
      m.querySelector('[data-tips]').addEventListener('click', () => { tipStore.reset(); this.closeModal(); });
    });
  }
  /** Small card pictures «who → whom» for a history line. */
  logRefHtml(ref) {
    if (!ref) return '';
    const pic = (r) => r && CARDS[r.id]?.img ? `<span class="lr-card ${r.ctrl === this.me ? 'mine' : 'theirs'}" style="background-image:url('${CARDS[r.id].img}')" title="${esc(CARDS[r.id].name)}"></span>` : '';
    const src = pic(ref.src), tg = (ref.tgts || []).filter((t) => !ref.src || t.uid !== ref.src.uid).map(pic).join('');
    return `<span class="lr">${src}${src && tg ? '<span class="lr-arrow">➜</span>' : ''}${tg}</span>`;
  }
  /** Big «who → whom» for the hover popup: large cards with names and who they belong to. */
  logRefBigHtml(ref, text) {
    const fig = (r, role) => {
      const d = r && CARDS[r.id];
      if (!d?.img) return '';
      const side = r.ctrl === this.me ? 'mine' : 'theirs';
      return `<figure class="lrb ${side}"><figcaption>${role}</figcaption><span class="lrb-card" style="background-image:url('${d.img}')"></span><b>${esc(d.name)}</b><small>${side === 'mine' ? 'ваша карта' : 'карта соперника'}</small></figure>`;
    };
    const tg = (ref.tgts || []).filter((t) => !ref.src || t.uid !== ref.src.uid);
    const src = fig(ref.src, tg.length ? 'Кто' : 'Карта');
    const tgts = tg.map((t) => fig(t, 'Против кого')).join('');
    return `<div class="lrb-text">${esc(text || '')}</div><div class="lrb-row">${src}${src && tgts ? '<span class="lrb-arrow">➜</span>' : ''}${tgts}</div>`;
  }
  /** Hovering a history line: show the cards next to the history and point at them on the board. */
  showLogRef(ref, anchor) {
    this.hideLogRef();
    if (!ref) return;
    const el = document.createElement('div');
    el.className = 'logref-pop';
    el.innerHTML = this.logRefBigHtml(ref, anchor.textContent);
    this.overlay().appendChild(el);
    const r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = Math.max(8, r.left - w - 14) + 'px';
    el.style.top = Math.min(window.innerHeight - h - 8, Math.max(8, r.top + r.height / 2 - h / 2)) + 'px';
    this._logPop = el;
    const on = [ref.src, ...(ref.tgts || [])].filter((x) => x?.uid != null && this.els.get(x.uid));
    for (const x of on) this.els.get(x.uid).classList.add('logfocus');
    this._logFocus = on.map((x) => x.uid);
    const from = ref.src?.uid != null ? this.pointOf(ref.src.uid) : null;
    for (const t of ref.tgts || []) if (from && t.uid !== ref.src.uid) this.arrow(from, this.pointOf(t.uid), ref.src.ctrl === this.me ? '#7fd4ff' : '#ff8a6a');
  }
  hideLogRef() {
    this._logPop?.remove(); this._logPop = null;
    for (const u of this._logFocus || []) this.els.get(u)?.classList.remove('logfocus');
    this._logFocus = null;
  }
  showLog() {
    const log = this.view?.log || [], refs = this.view?.logRefs || [], base = log.length - Math.min(80, log.length);
    this.modal(`<h3>Журнал</h3><div class="log-full">${log.slice(-80).map((l, k) => `<div class="log-line">${this.logRefHtml(refs[base + k])}<span>${esc(l)}</span></div>`).join('')}</div><div class="row-btns"><button class="btn" data-close>Закрыть</button></div>`, (m) => {
      m.querySelector('[data-close]').addEventListener('click', () => this.closeModal());
      const lf = m.querySelector('.log-full'); lf.scrollTop = lf.scrollHeight;
    });
  }
  /** One-time tutorial tips (first game). */
  maybeTip(q) {
    if (!q || q.player !== this.me || this.noTips) return;
    const key = q.type === 'target' ? (q.defense ? 'defense' : q.maneuver ? 'maneuver' : q.hint === 'face' ? 'face' : 'target') : q.type;
    const tip = TIPS[key];
    if (!tip || tipStore.seen(key)) return;
    tipStore.mark(key);
    this.showTip(tip);
  }
  showTip(tip) {
    const el = document.createElement('div');
    el.className = 'tip-card';
    el.innerHTML = `<div class="tip-ico">${tip.icon}</div><div class="tip-body"><b>${tip.title}</b><p>${tip.text}</p>
      <div class="tip-btns"><button class="btn primary small" data-ok>Понятно</button><button class="btn small" data-off>Больше не показывать</button></div></div>`;
    this.overlay().appendChild(el);
    el.querySelector('[data-ok]').addEventListener('click', () => el.remove());
    el.querySelector('[data-off]').addEventListener('click', () => { tipStore.off(); el.remove(); });
  }
  /** Caption at the top of the board describing an action. */
  caption(html, ms = 2200) {
    if (!this.capEl) { this.capEl = document.createElement('div'); this.capEl.className = 'caption'; this.ui.appendChild(this.capEl); }
    const el = this.capEl;
    el.innerHTML = html;
    el.classList.remove('show'); el.getBoundingClientRect(); el.classList.add('show');
    clearTimeout(this._capT);
    this._capT = setTimeout(() => el.classList.remove('show'), ms / FX.speed);
  }
  /** Glowing arrow from a point to a card. */
  arrow(from, to, color = '#ffd27a') {
    if (!from || !to) return;
    const layer = this.stage.querySelector('#fx-layer');
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'arrow-svg');
    svg.setAttribute('width', this.L.W); svg.setAttribute('height', this.L.H);
    const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2 - Math.min(160, Math.hypot(to.x - from.x, to.y - from.y) / 3);
    const id = 'ah' + Math.random().toString(36).slice(2, 7);
    svg.innerHTML = `<defs><marker id="${id}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${color}"/></marker></defs>
      <path d="M${from.x},${from.y} Q${mx},${my} ${to.x},${to.y}" stroke="${color}" stroke-width="9" fill="none" stroke-linecap="round" marker-end="url(#${id})" class="arrow-path" style="filter:drop-shadow(0 0 8px ${color})"/>`;
    layer.appendChild(svg);
    const path = svg.querySelector('path');
    const len = path.getTotalLength();
    path.style.strokeDasharray = len; path.style.strokeDashoffset = len;
    path.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 380 / FX.speed, fill: 'forwards', easing: 'ease-out' });
    svg.animate([{ opacity: 1 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }], { duration: 1900 / FX.speed });
    setTimeout(() => svg.remove(), 1950 / FX.speed);
  }

  // ---------- modals ----------
  modal(html, bind) {
    this.closeModal();
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal">${html}</div>`;
    this.overlay().appendChild(back);
    this.modalEl = back;
    bind && bind(back);
    return back;
  }
  closeModal() { if (this.modalEl) { this.modalEl.remove(); this.modalEl = null; } }
  openCardModal(q, { single = false } = {}) {
    const ids = q.options.map((o) => ({ uid: o.id, id: o.cardId ?? this.cardIdOf(o.id) }));
    const min = single ? 1 : q.min, max = single ? 1 : q.max;
    const sel = new Set();
    const html = `<h3>${esc(q.prompt)}</h3>
      <div class="cards">${ids.map((c) => `<div class="mcard" data-uid="${c.uid}" style="background-image:url('${CARDS[c.id]?.img || ''}')">${CARDS[c.id]?.img ? '' : `<div class="gen-card" style="width:100%;height:100%;font-size:18px">${esc(CARDS[c.id]?.name || '?')}</div>`}</div>`).join('')}</div>
      <div class="row-btns">${single ? '' : `<button class="btn primary" data-ok>Готово</button>`}${q.cancel ? '<button class="btn danger" data-cancel>Отмена</button>' : ''}</div>
      <p style="color:var(--ink-dim);margin:8px 0 0">${single ? 'Выберите карту' : `Выберите от ${min} до ${max}`}</p>`;
    this.modal(html, (m) => {
      const ok = m.querySelector('[data-ok]');
      const upd = () => { if (ok) ok.disabled = sel.size < min || sel.size > max; m.querySelectorAll('.mcard').forEach((e) => e.classList.toggle('on', sel.has(Number(e.dataset.uid)))); };
      m.querySelectorAll('.mcard').forEach((e) => {
        e.addEventListener('click', () => {
          const u = Number(e.dataset.uid);
          if (single) { sfx.click(); this.answer(u); return; }
          if (sel.has(u)) sel.delete(u); else if (sel.size < max) sel.add(u);
          sfx.click(); upd();
        });
        e.addEventListener('mouseenter', () => this.showPreviewId(this.cardIdOf(Number(e.dataset.uid)) ?? ids.find((x) => x.uid === Number(e.dataset.uid))?.id, e));
        e.addEventListener('mouseleave', () => this.hidePreview());
      });
      ok && ok.addEventListener('click', () => { sfx.click(); this.answer([...sel]); });
      m.querySelector('[data-cancel]')?.addEventListener('click', () => this.answer(null));
      upd();
    });
  }
  /** A choice between options (modes of a card, yes/no, how many coins): a big window with the card and large buttons. */
  openPick(q) {
    const id = q.srcId;
    const img = id != null && CARDS[id]?.img;
    const numeric = q.options.every((o) => /^\d+$/.test(String(o.label ?? o.id)));
    const html = `<div class="pick-win ${img ? 'with-card' : ''}">
      ${img ? `<div class="pick-card" style="background-image:url('${img}')"></div>` : ''}
      <div class="pick-body"><h3>${esc(q.prompt)}</h3>
        <div class="pick-opts ${numeric ? 'numeric' : ''}">${q.options.map((o, k) => `<button class="pick-opt" data-k="${k}">${linkTerms(esc(o.label ?? String(o.id)))}</button>`).join('')}</div>
        ${q.cancel ? '<button class="pick-opt cancel" data-cancel>Отмена — ничего не делать</button>' : ''}
      </div></div>`;
    this.modal(html, (m) => {
      m.querySelector('.modal').classList.add('pick-modal');
      m.querySelectorAll('.pick-opt[data-k]').forEach((b) => b.addEventListener('click', () => { sfx.click(); this.closeModal(); this.answer(q.options[Number(b.dataset.k)].id); }));
      m.querySelector('[data-cancel]')?.addEventListener('click', () => { sfx.click(); this.closeModal(); this.answer(null); });
      if (img) m.querySelector('.pick-card').addEventListener('mouseenter', (e) => this.showPreviewId(id, e.currentTarget));
    });
  }
  openMulligan(q) {
    const sel = new Set();
    const ids = q.options.map((o) => ({ uid: o.id, id: this.cardIdOf(o.id) }));
    const html = `<h3>Стартовая рука: оставьте ${q.keep} карт</h3>
      <div class="cards">${ids.map((c) => `<div class="mcard" data-uid="${c.uid}" style="background-image:url('${CARDS[c.id]?.img || ''}')"></div>`).join('')}</div>
      <div class="row-btns"><button class="btn primary" data-ok>Оставить выбранные</button>${q.canMull ? '<button class="btn danger" data-mull>Муллиган (взять на 2 карты меньше)</button>' : ''}</div>
      <p style="color:var(--ink-dim);margin:8px 0 0">${q.prompt}</p>`;
    this.modal(html, (m) => {
      m.querySelector('.modal').classList.add('mull-modal');
      const ok = m.querySelector('[data-ok]');
      const upd = () => { ok.disabled = sel.size !== q.keep; ok.textContent = `Оставить выбранные (${sel.size}/${q.keep})`; m.querySelectorAll('.mcard').forEach((e) => { const on = sel.has(Number(e.dataset.uid)); e.classList.toggle('on', on); e.classList.toggle('off', !on && sel.size === q.keep); }); };
      m.querySelectorAll('.mcard').forEach((e) => {
        e.addEventListener('click', () => { const u = Number(e.dataset.uid); if (sel.has(u)) sel.delete(u); else if (sel.size < q.keep) sel.add(u); sfx.click(); upd(); });
        e.addEventListener('mouseenter', () => this.showPreviewId(this.cardIdOf(Number(e.dataset.uid)), e));
        e.addEventListener('mouseleave', () => this.hidePreview());
      });
      if (q.keep === ids.length) ids.forEach((c) => sel.add(c.uid));
      ok.addEventListener('click', () => { sfx.click(); this.answer([...sel]); });
      m.querySelector('[data-mull]')?.addEventListener('click', () => { sfx.click(); this.answer('mulligan'); });
      upd();
    });
  }
  showGrave(side) {
    const g = this.view?.players[side]?.grave || [];
    if (this.q && this.q.player === this.me && this.modalEl) return;
    this.modal(`<h3>Кладбище: ${esc(this.view.players[side].name)} (${g.length})</h3><div class="cards">${g.map((c) => `<div class="mcard" data-id="${c.id}" style="background-image:url('${CARDS[c.id]?.img || ''}')"></div>`).join('') || '<p>Пусто</p>'}</div><div class="row-btns"><button class="btn" data-close>Закрыть</button></div>`, (m) => {
      m.querySelector('[data-close]').addEventListener('click', () => this.closeModal());
      m.querySelectorAll('.mcard').forEach((e) => { e.addEventListener('mouseenter', () => this.showPreviewId(Number(e.dataset.id), e)); e.addEventListener('mouseleave', () => this.hidePreview()); });
    });
  }

  // ---------- preview ----------
  showPreview(uid, el) {
    const c = this.findCard?.(uid);
    if (!c || c.hidden) return;
    this.showPreviewId(c.id, el, c);
  }
  togglePreview(uid) {
    if (this.previewEl.classList.contains('hidden')) { const el = this.els.get(uid); if (el) this.showPreview(uid, el); } else this.hidePreview();
  }
  showPreviewId(id, el, c = null) {
    const d = CARDS[id];
    if (!d) return;
    const pv = this.previewEl;
    const kws = [...new Set([...(d.kw || []), ...((c && c.kws) || [])])].filter((k) => KW_NAME[k]);
    const toks = c ? Object.entries(c.tok || {}).filter(([, n]) => n > 0).map(([t, n]) => `${TOK_ICON[t] || t}×${n}`).join(' ') : '';
    const statLine = c && c.hp != null ? `<div>${c.atk != null ? `⚔️ ${c.atk} ` : ''}❤️ ${c.hp}${c.maxHp != null ? ` / ${c.maxHp}` : ''}${toks ? ` · ${toks}` : ''}${c.stunned ? ' · 💫 оглушён' : ''}</div>` : (toks ? `<div>${toks}</div>` : '');
    pv.innerHTML = `${d.img ? `<img src="${d.img}" alt="">` : `<div class="gen-card">${GEN_EMOJI[id] || '✨'}<br>${esc(d.name)}<br><small>${d.atk ?? ''}/${d.hp ?? ''}</small></div>`}
      <div class="pv-info"><b>${esc(d.name)}</b> — ${TYPE_RU[d.type] || ''}${d.subtypes?.length ? ' · ' + d.subtypes.join(', ').toLowerCase() : ''}${statLine}
      ${kws.map((k) => `<div><b>${KW_NAME[k]}</b>: ${KW_HELP[k]}</div>`).join('')}
      ${this.fxHtml(c, d)}
      ${!d.img && d.text ? `<div>${esc(d.text)}</div>` : ''}</div>`;
    pv.classList.remove('hidden');
    const r = el.getBoundingClientRect();
    const w = pv.offsetWidth || 300, h = pv.offsetHeight || 520;
    // Fixed spot on the far side of the screen, like a card inspector.
    const x = r.left + r.width / 2 > window.innerWidth / 2 ? 12 : window.innerWidth - w - 12;
    const y = Math.max(8, (window.innerHeight - h) / 2);
    pv.style.left = x + 'px'; pv.style.top = y + 'px';
  }
  /** «Что на карте сейчас» (changes against the printed card) and «Что с ней было» (the effects noted by noteFx). */
  fxHtml(c, d) {
    if (!c || c.uid == null) return '';
    const now = [];
    if (c.atk != null && d.atk != null && c.atk !== d.atk) now.push(`⚔️ атака ${c.atk} (на карте ${d.atk})`);
    if (c.maxHp != null && d.hp != null && c.maxHp !== d.hp) now.push(`❤️ здоровье до ${c.maxHp} (на карте ${d.hp})`);
    if (c.hp != null && c.maxHp != null && c.hp < c.maxHp) now.push(`🩸 ранена: ${c.maxHp - c.hp}`);
    if (c.stunned) now.push('💫 оглушена — не атакует');
    if (c.tmpHp > 0 || c.tmpAtk > 0) {
      const dies = c.tmpHp > 0 && c.hp != null && c.hp - c.tmpHp <= 0;
      now.push(`⏳ временно ${c.tmpAtk ? `+${c.tmpAtk} атаки ` : ''}${c.tmpHp ? `+${c.tmpHp} здоровья` : ''}${dies ? ' — когда усиление кончится, раны останутся и карта погибнет' : ''}`);
    }
    const extra = (c.kws || []).filter((k) => KW_NAME[k] && !(d.kw || []).includes(k));
    if (extra.length) now.push(`✨ получила: ${extra.map((k) => KW_NAME[k]).join(', ')}`);
    const hist = (this.cardFx?.get(c.uid) || []).slice().reverse();
    if (!now.length && !hist.length) return '';
    return `<div class="pv-fx">${now.length ? `<div class="pv-fx-h">Сейчас на карте</div>${now.map((t) => `<div>${esc(t)}</div>`).join('')}` : ''}
      ${hist.length ? `<div class="pv-fx-h">Что с ней было</div>${hist.map((h) => `<div><span>${h.icon}</span> ${esc(h.text)}${h.round ? ` <small>· раунд ${h.round}</small>` : ''}</div>`).join('')}` : ''}</div>`;
  }
  hidePreview() { this.previewEl.classList.add('hidden'); }

  // ---------- event animations ----------
  async playEvents(batch) {
    for (let k = 0; k < batch.length; k++) {
      const { ev, view } = batch[k];
      if (!this.introDone && view && view.players?.[0]?.leader && !this.noIntro) await this.intro(view);
      try { this.tally(ev, view); } catch (e) { console.warn(e); }
      try { this.noteFx(ev); } catch (e) { console.warn(e); }
      try { await this.pre(ev, batch, k); } catch (e) { console.warn(e); }
      this.render(view);
      try { await this.post(ev); } catch (e) { console.warn(e); }
    }
  }
  async pre(ev, batch, k) {
    const W = FX.wait;
    // Remember which card is acting, to show its picture when it asks to pick an option.
    if (ev.type === 'declare' || ev.type === 'resolve') this._actId = ev.id ?? this.cardIdOf(ev.uid) ?? this._actId;
    if (ev.type === 'declareAbility' || ev.type === 'ability') this._actId = this.cardIdOf(ev.uid) ?? this._actId;
    switch (ev.type) {
      case 'pause': {
        // The opponent «may answer»: shown exactly like a real wait for their answer (hint, prompt, end button),
        // so a stop never reveals whether they hold a card with Опережение.
        if (ev.player === this.me) break;
        const keep = this.q;
        this.setPending({ player: ev.player, type: 'priority', options: [], pause: true });
        await W(ev.ms || 1000);
        if (this.q?.pause) this.setPending(keep);
        break;
      }
      case 'declare': case 'declareAbility': {
        const id = ev.id ?? this.cardIdOf(ev.uid);
        this.announce(ev, id);
        if (ev.type === 'declare' && ev.player === this.me) { this.played = this.played || []; this.played.push(id); }
        if (ev.type === 'declare') await this.showStageCard(ev.uid, id, ev.player, ev.targets);
        else {
          const p = this.pointOf(ev.uid);
          if (p) {
            FX.glow(p.x, p.y, 'rgba(90,180,255,.7)', 110, 600);
            FX.ring(p.x, p.y, '#8fd0ff', 26, 600, 2.2, 4);
            FX.burst(p.x, p.y, { color: ['#59b6ff', '#cfeaff', '#ffffff'], count: 22, speed: 4, size: 7, gravity: -0.05 });
            const el = this.els.get(ev.uid);
            el?.animate([{ transform: 'scale(1)', filter: 'brightness(1)' }, { transform: 'scale(1.12)', filter: 'brightness(1.6)' }, { transform: 'scale(1)', filter: 'brightness(1)' }], { duration: 420 / FX.speed });
          }
          for (const t of ev.targets || []) this.arrow(p, this.pointOf(t), ev.player === this.me ? '#7fd4ff' : '#ff8a6a');
          sfx.magic(p?.x); await W(ev.player === this.me ? 320 : 700);
        }
        break;
      }
      case 'shown': {
        // The opponent shows cards from the hand: put them in front of you for a moment.
        if (ev.player === this.me || !ev.ids?.length) break;
        const w = document.createElement('div');
        w.className = 'shown-pop';
        w.innerHTML = `<div class="shown-title">Соперник показывает из руки</div><div class="shown-row">${ev.ids.map((id) => `<span class="shown-card" style="background-image:url('${CARDS[id]?.img || ''}')" title="${esc(CARDS[id]?.name || '')}"></span>`).join('')}</div>`;
        this.overlay().appendChild(w);
        sfx.reveal();
        await FX.wait(2200);
        w.classList.add('out'); setTimeout(() => w.remove(), 400);
        break;
      }
      case 'fx': {
        const src = ev.src != null ? this.pointOf(ev.src) : null;
        const tg = (Array.isArray(ev.tgt) ? ev.tgt : ev.tgt != null ? [ev.tgt] : []).map((u) => this.pointOf(u)).filter(Boolean);
        if (ev.fx === 'destroy' && !tg.length) break;
        await FX.preset(ev.fx, src || (tg[0] ? { x: 800, y: 430 } : null), tg);
        break;
      }
      case 'attack': {
        const a = this.els.get(ev.src);
        if (!a) break;
        let tgtPt = ev.tgt != null ? this.pointOf(ev.tgt) : null;
        if (!tgtPt) {
          const nx = batch.slice(k + 1).find((b) => b.ev.type === 'damage' && b.ev.src === ev.src);
          tgtPt = nx ? this.pointOf(nx.ev.tgt) : null;
        }
        const ap = this.stagePoint(a);
        if (!tgtPt) tgtPt = { x: ap.x, y: ap.y + (ap.y > this.L.midY ? -300 : 300) };
        {
          const nx = batch.slice(k + 1).find((b) => b.ev.type === 'damage' && b.ev.src === ev.src);
          const an = CARDS[this.cardIdOf(ev.src)]?.name.split(',')[0] || '';
          const tn = nx ? CARDS[this.cardIdOf(nx.ev.tgt)]?.name.split(',')[0] : null;
          this.caption(`⚔️ Регион ${this.regionCol(ev.region) + 1}: <b>${esc(an)}</b> бьёт ${tn ? `<b>${esc(tn)}</b>` : ''}`, 1600);
        }
        const dx = (tgtPt.x - ap.x) * 0.8, dy = (tgtPt.y - ap.y) * 0.8;
        a.style.zIndex = 40;
        const dur = 760 / FX.speed;
        // Wind-up: lift off the table, shadow grows; then dash and strike; then settle back.
        a.animate([
          { transform: 'translate(0,0) scale(1) rotate(0)', filter: 'brightness(1)' },
          { transform: `translate(${-dx * 0.1}px,${-dy * 0.1 - 14}px) scale(1.18) rotate(${dx > 0 ? -5 : 5}deg)`, filter: 'brightness(1.15)', offset: 0.32 },
          { transform: `translate(${dx}px,${dy}px) scale(1.12) rotate(${dx > 0 ? 6 : -6}deg)`, filter: 'brightness(1.3)', offset: 0.55 },
          { transform: `translate(${dx * 0.85}px,${dy * 0.85}px) scale(1.08)`, offset: 0.62 },
          { transform: 'translate(0,0) scale(1) rotate(0)', filter: 'brightness(1)' },
        ], { duration: dur, easing: 'cubic-bezier(.45,0,.25,1)' });
        a.querySelector('.shadow')?.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'translateY(16px) scale(1.5)', opacity: 0.5, offset: 0.32 }, { transform: 'scale(1)', opacity: 1 }], { duration: dur });
        await W(0.3 * 760);
        sfx.swing(ap.x);
        FX.streak(ap, { x: ap.x + dx, y: ap.y + dy }, this.attackColor(a));
        await W(0.25 * 760);
        // Impact. If the opposing card strikes back right away, let it start while this one settles.
        FX.impact(ap.x + dx / 0.8 * 0.92, ap.y + dy / 0.8 * 0.92, this.attackColor(a));
        const nextStrike = batch.slice(k + 1, k + 3).some((b) => b.ev.type === 'attack');
        await W((nextStrike ? 0.12 : 0.32) * 760);
        a.style.zIndex = '';
        break;
      }
      case 'damage': {
        const p = this.pointOf(ev.tgt);
        if (!p) break;
        const el = this.els.get(ev.tgt);
        const isLeader = el?.classList.contains('leader');
        el?.classList.add(isLeader ? 'hurt-flash' : 'hit-flash'); setTimeout(() => el?.classList.remove('hit-flash', 'hurt-flash'), 520);
        if (ev.amount > 0) {
          FX.splat(p.x, p.y, `-${ev.amount}`);
          FX.burst(p.x, p.y, { color: ev.combat ? ['#ffffff', '#ffd27a', '#ff7a3a'] : ['#ff7a3a', '#ff2a2a', '#ffd0a0'], shape: 'spark', count: 12 + ev.amount * 4, speed: 10 });
          FX.glow(p.x, p.y, 'rgba(255,120,60,.6)', 70 + ev.amount * 8, 380);
          if (isLeader) { sfx.face(ev.amount, p.x); this.leaderDanger(); } else sfx.hit(ev.amount, p.x);
          FX.shake(Math.min(2.6, 0.4 + ev.amount / 3.2));
          el?.animate([{ transform: 'translate(0,0) scale(1)' }, { transform: 'translate(-7px,3px) scale(.96)' }, { transform: 'translate(7px,-3px) scale(1.02)' }, { transform: 'translate(-3px,1px)' }, { transform: 'translate(0,0) scale(1)' }], { duration: 320 });
        }
        await W(ev.combat ? 220 : 340);
        break;
      }
      case 'death': {
        const el = this.els.get(ev.uid);
        if (!el) break;
        const p = this.stagePoint(el);
        el.animate([{ filter: 'none', transform: 'scale(1)' }, { filter: 'grayscale(1) brightness(.6) contrast(1.5)', transform: 'scale(1.04) rotate(-2deg)' }], { duration: 260, fill: 'forwards' });
        await W(240);
        sfx.death(p.x);
        this.shatter(el);
        FX.burst(p.x, p.y, { color: ['#555', '#777', '#3a3a3a'], count: 16, speed: 2, size: 26, add: false, grow: 1.6, gravity: -0.06, life: 1100, alpha: 0.6 });
        FX.burst(p.x, p.y, { color: ['#ffb070', '#ff7a30'], count: 18, speed: 6, size: 5, gravity: 0.15 });
        await W(420);
        break;
      }
      case 'leave': case 'toHand': case 'exiled': break;
      case 'move': {
        const p = this.pointOf(ev.uid);
        sfx.swing(p?.x);
        if (p) FX.burst(p.x, p.y + 60, { color: ['#a88a6a', '#6b5440'], count: 12, speed: 3, add: false, size: 6, gravity: 0.05 });
        break;
      }
      case 'flip': {
        const el = this.els.get(ev.uid);
        sfx.flip(this.pointOf(ev.uid)?.x);
        if (el) el.animate([{ transform: 'perspective(600px) rotateY(0)' }, { transform: 'perspective(600px) rotateY(90deg) scale(1.1)', filter: 'brightness(2)' }], { duration: 240 / FX.speed });
        await W(240);
        break;
      }
      case 'fizzle': sfx.error(); await FX.banner('Не сработало', 'red', 900); break;
      case 'battleStart': {
        sfx.battle();
        await FX.banner('⚔ СРАЖЕНИЕ ⚔', 'red', 1500);
        break;
      }
      case 'battleSkipped': await FX.banner('Сражение пропущено', '', 1100); break;
      case 'regionStart': {
        const v = this.view, r = ev.region;
        const busy = v && v.players.some((pl) => pl.regions[r]?.ally);
        if (!busy) break; // nobody fights here: no pause
        const col = this.cols[ev.region];
        if (col) { const p = this.stagePoint(col); FX.glow(p.x, p.y, 'rgba(255,170,60,.35)', 170, 600); sfx.drum(); }
        await W(200);
        break;
      }
      case 'turnStart': {
        if (this.spectator) await FX.banner(`Ход: ${this.sideName(ev.player)}`, '', 950);
        else if (ev.player === this.me) { sfx.turn(); await FX.banner('Ваш ход', '', 1150); } else await FX.banner('Ход соперника', 'dim', 850);
        break;
      }
      case 'round': this.musicStep(); await W(150); break;
      case 'control': {
        const p = this.pointOf(ev.uid);
        if (p) FX.burst(p.x, p.y, { emoji: ['💗', '💖'], shape: 'emoji', count: 12, speed: 5, add: false, size: 12, gravity: -0.05 });
        sfx.magic(p?.x); await W(380); break;
      }
      default: break;
    }
  }
  attackColor(el) {
    if (el.classList.contains('deathtouch')) return 'death';
    if (el.classList.contains('breakthrough')) return 'fire';
    return 'gold';
  }
  async post(ev) {
    const W = FX.wait;
    switch (ev.type) {
      case 'enter': {
        const el = this.els.get(ev.uid);
        this._spawnFrom = null;
        if (!el) break;
        const d = CARDS[ev.id];
        const p = this.stagePoint(el);
        const big = (d.cost ?? 0) >= 6 || d.legend;
        const type = d.type;
        // The card is put down on the table: it comes in a little above, its shadow shrinks, a small puff on landing.
        el.animate([
          { transform: 'translateY(-46px) scale(1.18) rotate(-2deg)', opacity: 0, filter: 'drop-shadow(0 46px 18px rgba(0,0,0,.45))' },
          { transform: 'translateY(-30px) scale(1.12) rotate(-1deg)', opacity: 1, filter: 'drop-shadow(0 34px 16px rgba(0,0,0,.5))', offset: 0.35 },
          { transform: 'translateY(0) scale(.98)', filter: 'drop-shadow(0 6px 6px rgba(0,0,0,.6))', offset: 0.8 },
          { transform: 'scale(1)', filter: 'none' },
        ], { duration: 520 / FX.speed, easing: 'cubic-bezier(.4,0,.6,1)' });
        await W(400);
        if (type === 'ally' || type === 'place') {
          sfx.land(big, p.x);
          FX.dust(p.x, p.y + (type === 'ally' ? 80 : 34), big ? 0.9 : 0.55);
          if (big) FX.shake((d.cost ?? 0) >= 9 ? 1.4 : 0.8);
        } else {
          sfx.magic(p.x);
          FX.glow(p.x, p.y, type === 'companion' ? 'rgba(190,120,255,.45)' : 'rgba(255,210,120,.45)', 80, 500);
        }
        if (this._epicLanding) {
          this._epicLanding = false;
          FX.shake(1.4); FX.dust(p.x, p.y + 70, 1.4);
          FX.stars(p.x, p.y, { count: 14 });
        }
        if (d.legend) {
          sfx.legend(p.x);
          el.classList.add('shine'); setTimeout(() => el.classList.remove('shine'), 1300);
        }
        if (ev.created && type === 'ally') sfx.animal(p.x);
        if (d.legend && d.flavor && (type === 'ally' || type === 'companion')) this.bubbleAt(p.x - 60, p.y - (this.L.name === 'port' ? 130 : 100), `«${d.flavor}»`, 2800);
        await W(big ? 420 : 160);
        break;
      }
      case 'heal': {
        const p = this.pointOf(ev.uid);
        if (!p) break;
        FX.floatText(p.x, p.y, `+${ev.amount}`, 'heal');
        FX.healFx(p.x, p.y);
        sfx.heal(p.x); await W(320); break;
      }
      case 'buff': {
        const p = this.pointOf(ev.uid);
        if (!p) break;
        const down = ev.atk < 0 || ev.hp < 0;
        FX.floatText(p.x, p.y - 20, `${ev.atk >= 0 ? '+' : ''}${ev.atk}/${ev.hp >= 0 ? '+' : ''}${ev.hp}`, down ? 'debuff' : 'buff');
        const el = this.els.get(ev.uid);
        if (down) { sfx.debuff(p.x); FX.burst(p.x, p.y, { color: ['#b06cff', '#3a0b6b', '#7a2bd9'], count: 22, speed: 3, gravity: 0.18, size: 8 }); }
        else {
          sfx.buff(p.x); FX.ring(p.x, p.y, '#ffd84a', 30, 650, 1.8, 5); FX.glow(p.x, p.y, 'rgba(255,210,90,.55)', 90, 500);
          FX.burst(p.x, p.y + 40, { color: ['#ffd84a', '#fff1a8'], count: 22, speed: 3, gravity: -0.16, size: 6, angle: -Math.PI / 2, spread: 1.2 });
          el?.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.7) drop-shadow(0 0 12px #ffd84a)' }, { filter: 'brightness(1)' }], { duration: 600 });
        }
        await W(280); break;
      }
      case 'grant': {
        const p = this.pointOf(ev.uid);
        if (!p) break;
        FX.floatText(p.x, p.y - 30, `${KW_ICON[ev.kw] || '✦'} ${KW_NAME[ev.kw] || ev.kw}`, 'buff');
        if (ev.kw === 'ward' || ev.kw === 'indestructible') { sfx.shield(p.x); FX.ring(p.x, p.y, '#fff0b0', 46, 700, 0.5, 7); FX.glow(p.x, p.y, 'rgba(255,236,160,.6)', 110, 600); }
        else { sfx.buff(p.x); FX.glow(p.x, p.y, ev.kw === 'breakthrough' ? 'rgba(255,80,40,.6)' : 'rgba(255,210,90,.5)', 90, 500); }
        await W(240); break;
      }
      case 'stun': { const p = this.pointOf(ev.uid); if (p) { sfx.stun(p.x); FX.burst(p.x, p.y - 40, { emoji: ['💫', '⭐'], shape: 'emoji', count: 6, speed: 3, add: false, size: 12 }); } await W(240); break; }
      case 'coins': {
        if (!ev.amount) break;
        const side = ev.player === this.me ? 'me' : 'opp';
        const tgt = this.stagePoint(this.coinsEl[side].querySelector('.coin-ico'));
        const src = ev.src != null ? this.pointOf(ev.src) : null;
        if (src) {
          sfx.coin(src.x);
          for (let i = 0; i < Math.min(ev.amount, 7); i++) setTimeout(() => FX.projectile(src, tgt, { emoji: '🪙', size: 13, trail: 2, trailColor: '#ffd84a', arc: 90 + i * 10, duration: 560 }).then(() => { FX.burst(tgt.x, tgt.y, { color: ['#ffe08a', '#fff'], count: 6, speed: 3, size: 5 }); }), i * 80 / FX.speed);
          FX.floatText(src.x, src.y - 20, `+${ev.amount} 💰`, 'coin');
          await W(420);
          sfx.coinStack(tgt.x);
        } else sfx.coin(tgt.x);
        break;
      }
      case 'tokens': {
        if (!ev.n) break;
        const p = this.pointOf(ev.uid);
        if (p) {
          FX.floatText(p.x + 30, p.y - 30, `+${ev.n}${TOK_ICON[ev.type] || ''}`, ev.type === 'blood' ? 'dmg' : 'coin');
          if (ev.type === 'blood') { sfx.blood(p.x); FX.burst(p.x, p.y, { color: ['#b3001b', '#e0202a'], count: 10, speed: 3, size: 6, gravity: 0.25, add: false }); }
          else { sfx.book(p.x); }
        }
        await W(170); break;
      }
      case 'draw': if (ev.player === this.me) sfx.draw(); await W(110); break;
      case 'shuffle': sfx.shuffle(); break;
      case 'move': await W(340); break;
      case 'flip': {
        const el = this.els.get(ev.uid);
        if (el) {
          el.animate([{ transform: 'perspective(600px) rotateY(-90deg) scale(1.1)', filter: 'brightness(2)' }, { transform: 'perspective(600px) rotateY(0) scale(1)', filter: 'brightness(1)' }], { duration: 280 / FX.speed });
          const p = this.stagePoint(el); FX.glow(p.x, p.y, 'rgba(200,160,255,.6)', 90, 500);
        }
        await W(280);
        break;
      }
      case 'gameOver': this.showGameOver(ev.winner); try { this.onGameEnd && this.onGameEnd(ev.winner, this.view, [...(this.played || [])]); } catch (e) { console.warn(e); } break;
      case 'resolve': await W(60); break;
      default: break;
    }
  }
  announce(ev, id) {
    const v = this.view;
    if (!v) return;
    const who = this.spectator ? esc(this.sideName(ev.player)) : ev.player === this.me ? 'Вы' : esc(v.players[ev.player]?.name || 'Соперник');
    const nm = ev.type === 'declare' ? `«${esc(CARDS[id]?.name.split(',')[0] || '')}»` : `«${esc(CARDS[id]?.name.split(',')[0] || '')}» — ${esc(ev.name || 'свойство')}`;
    const tg = (ev.targets || []).map((u) => { const t = this.findCard(u); return t ? `${t.ctrl === this.me ? 'ваш' : 'чужой'} «${esc(CARDS[t.id]?.name.split(',')[0])}»` : null; }).filter(Boolean).join(', ');
    const mine = ev.player === this.me && !this.spectator;
    const verb = ev.type === 'declare' ? (mine ? 'играете' : 'играет') : (mine ? 'используете' : 'использует');
    this.caption(`<span class="cap-who ${mine ? 'me' : 'opp'}">${who}</span> ${verb} ${nm}${tg ? ` → ${tg}` : ''}`, mine ? 1800 : 3200);
  }
  /** Gold cards (and expensive Legends) get a cinematic entrance like legendaries in Hearthstone. */
  isEpic(d) { return d && (d.rarity === 'Золото' || (d.legend && (d.cost ?? 0) >= 5)); }
  async legendaryEntrance(d, from, player) {
    const fx = this.stage.querySelector('#fx-layer');
    const { W, H } = this.L;
    const cx = W / 2, cy = this.L.name === 'port' ? H * 0.42 : H / 2 - 20;
    const cw = this.L.name === 'port' ? 520 : 340, ch = cw / 0.72;
    const dim = document.createElement('div');
    dim.className = 'epic-dim';
    fx.appendChild(dim);
    const card = document.createElement('div');
    card.className = 'epic-card';
    card.style.cssText = `left:${cx - cw / 2}px;top:${cy - ch / 2}px;width:${cw}px;height:${ch}px;background-image:url('${d.img || ''}')`;
    card.innerHTML = '<div class="epic-shine"></div>';
    const title = document.createElement('div');
    title.className = 'epic-title';
    title.style.top = (cy - ch / 2 - (this.L.name === "port" ? 130 : 100)) + 'px';
    title.innerHTML = `<span>Легендарная</span>`;
    const nm = document.createElement('div');
    nm.className = 'epic-name';
    nm.style.top = (cy + ch / 2 + 52) + 'px';
    nm.textContent = d.name;
    fx.append(card, title, nm);
    const S = FX.speed;
    dim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260 / S, fill: 'forwards' });
    sfx.legend(); sfx.explosion();
    const dx = from.x - cx, dy = from.y - cy;
    card.animate([
      { transform: `translate(${dx}px,${dy}px) scale(.25) rotateY(${player === this.me ? 0 : 180}deg)`, filter: 'brightness(3)' },
      { transform: 'translate(0,0) scale(1.18) rotateY(360deg)', filter: 'brightness(1.8)', offset: 0.55 },
      { transform: 'translate(0,0) scale(1) rotateY(360deg)', filter: 'brightness(1)' },
    ], { duration: 820 / S, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' });
    await FX.wait(430);
    FX.flash('rgba(255,236,170,.65)', 420);
    FX.shake(2.6);
    FX.rays(cx, cy, '#ffd84a');
    FX.flare(cx, cy, '#ffd27a', 420, 700);
    FX.burst(cx, cy, { shape: 'tex', tex: ['star_01', 'star_04', 'spark_02'], color: ['#fff6c8', '#ffd84a', '#ffb347'], count: 70, speed: 14, size: 22, life: 1400, gravity: 0.12, spin: 0.3 });
    for (let k = 0; k < 4; k++) setTimeout(() => FX.burst(cx - W / 2 + Math.random() * W, -20, { shape: 'tex', tex: ['star_02', 'spark_01'], color: ['#ffe08a', '#fff'], count: 18, speed: 3, angle: Math.PI / 2, spread: 1, gravity: 0.18, size: 14, life: 1600 }), k * 160 / S);
    title.animate([{ transform: 'translateX(-50%) scale(2)', opacity: 0 }, { transform: 'translateX(-50%) scale(1)', opacity: 1 }], { duration: 380 / S, fill: 'forwards', easing: 'cubic-bezier(.2,.8,.3,1.3)' });
    nm.animate([{ transform: 'translateX(-50%) translateY(20px)', opacity: 0 }, { transform: 'translateX(-50%)', opacity: 1 }], { duration: 420 / S, delay: 120 / S, fill: 'forwards' });
    await FX.wait(1250);
    for (const e of [title, nm, dim]) e.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300 / S, fill: 'forwards' });
    card.animate([{ transform: 'scale(1) rotateY(360deg)', opacity: 1 }, { transform: 'scale(.35) translateY(60px) rotateY(360deg)', opacity: 0 }], { duration: 320 / S, fill: 'forwards', easing: 'ease-in' });
    this._spawnFrom = { x: cx, y: cy };
    this._epicLanding = true;
    await FX.wait(300);
    for (const e of [card, title, nm, dim]) e.remove();
  }
  async showStageCard(uid, id, player, targets = []) {
    const d = CARDS[id];
    if (!d) return;
    const el = this.els.get(uid);
    const from = el ? this.stagePoint(el) : (player === this.me ? { x: 800, y: 850 } : { x: 800, y: 0 });
    if (this.isEpic(d) && d.type !== 'action') {
      if (el) el.style.opacity = '0';
      await this.legendaryEntrance(d, from, player);
      for (const t of targets || []) this.arrow({ x: this.L.W / 2, y: this.L.H / 2 }, this.pointOf(t), player === this.me ? '#7fd4ff' : '#ff8a6a');
      if (el) el.style.opacity = '';
      return;
    }
    const sc = document.createElement('div');
    sc.className = 'stage-card';
    sc.style.backgroundImage = d.img ? `url('${d.img}')` : '';
    if (!d.img) sc.innerHTML = `<div class="gen-card" style="width:100%;height:100%">${esc(d.name)}</div>`;
    const tx = this.L.stageCard.x, ty = this.L.stageCard.y;
    sc.style.left = tx + 'px'; sc.style.top = ty + 'px';
    this.stage.querySelector('#fx-layer').appendChild(sc);
    if (el) el.style.opacity = '0';
    sfx.play(from.x);
    if (player !== this.me) sfx.reveal();
    const dx = from.x - (tx + 150), dy = from.y - (ty + 209);
    sc.animate([
      { transform: `translate(${dx}px,${dy}px) scale(.42) rotateY(${player === this.me ? 0 : 180}deg) rotate(${player === this.me ? -10 : 10}deg)`, opacity: 0.7 },
      { transform: 'translate(0,0) scale(1.08) rotateY(0) rotate(0)', opacity: 1, offset: 0.68 },
      { transform: 'scale(1)', opacity: 1 },
    ], { duration: 480 / FX.speed, easing: 'cubic-bezier(.2,.8,.3,1)' });
    await FX.wait(480);
    FX.glow(tx + 150, ty + 209, d.legend ? 'rgba(255,210,90,.6)' : 'rgba(255,200,120,.32)', 170, 600);
    if (d.legend) FX.rays(tx + 150, ty + 209, '#ffd84a');
    for (const t of targets || []) this.arrow({ x: tx + 150, y: ty + 209 }, this.pointOf(t), player === this.me ? '#7fd4ff' : '#ff8a6a');
    await FX.wait(player === this.me ? 480 : 1200);
    this._spawnFrom = { x: tx + 150, y: ty + 209 };
    sc.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.55) translateY(40px)' }], { duration: 280 / FX.speed });
    setTimeout(() => sc.remove(), 300 / FX.speed);
    if (el) el.style.opacity = '';
  }
  /** Match statistics for the end screen, counted from the events as they are shown. */
  /** What happened to each card while it is in play (shown when you hover it). Cleared when it leaves play. */
  noteFx(ev) {
    const fx = this.cardFx || (this.cardFx = new Map());
    // Played actions leave the board fast, so remember their ids to name them as the source.
    const ids = this.fxIds || (this.fxIds = new Map());
    if (ev.uid != null && ev.id != null) ids.set(ev.uid, ev.id);
    const nm = (uid) => { const id = uid != null ? this.cardIdOf(uid) ?? ids.get(uid) : null; return id != null && CARDS[id] ? `«${CARDS[id].name}»` : ''; };
    const add = (uid, icon, text, src) => {
      if (uid == null) return;
      const list = fx.get(uid) || [];
      const by = src != null && src !== uid ? nm(src) : '';
      list.push({ icon, text: text + (by ? ` — от ${by}` : ''), round: this.view?.round });
      fx.set(uid, list.slice(-10));
    };
    const sign = (n) => (n >= 0 ? '+' : '') + n;
    switch (ev.type) {
      case 'buff': add(ev.uid, ev.atk < 0 || ev.hp < 0 ? '🔻' : '🔺', `${sign(ev.atk)}/${sign(ev.hp)}`, ev.src); break;
      case 'grant': add(ev.uid, '✨', `получает «${KW_NAME[ev.kw] || ev.kw}»`, ev.src); break;
      case 'stun': add(ev.uid, '💫', 'оглушение', ev.src); break;
      case 'damage': if (ev.amount > 0) add(ev.tgt, '🩸', `${ev.amount} ${plural(ev.amount, 'рана', 'раны', 'ран')}${ev.combat ? ' в бою' : ''}`, ev.src); break;
      case 'heal': add(ev.uid, '💚', `лечение ${ev.amount}`, ev.src); break;
      case 'tokens': add(ev.uid, TOK_ICON[ev.type] || '●', `${sign(ev.n)} ${TOK_ICON[ev.type] ? '' : ev.type}`.trim()); break;
      case 'control': add(ev.uid, '🔁', 'сменила хозяина'); break;
      case 'flip': add(ev.uid, '🔃', 'перевёрнута'); break;
      case 'move': add(ev.uid, '➡️', 'перемещена'); break;
      case 'declare': case 'declareAbility':
        for (const t of ev.targets || []) { const u = typeof t === 'object' ? t?.uid : t; if (u != null && u !== ev.uid) add(u, '🎯', ev.type === 'declare' ? `цель карты «${CARDS[ev.id]?.name || '?'}»` : `цель свойства «${ev.name}» ${nm(ev.uid)}`); }
        break;
      case 'death': case 'exiled': case 'toHand': case 'discard': fx.delete(ev.uid); break;
    }
  }
  tally(ev, view) {
    const st = this.stats || (this.stats = { dmg: [0, 0], face: [0, 0], kills: [0, 0], played: [0, 0], best: null, byCard: new Map() });
    const ctrl = (uid) => {
      if (uid == null) return null;
      for (const v of [this.view, view]) for (const p of v?.players || []) for (const c of [p.leader, ...p.support, ...p.regions.flatMap((r) => [r.ally, r.place])]) if (c && c.uid === uid) return p.i ?? v.players.indexOf(p);
      return null;
    };
    const idOf = (uid) => this.cardIdOf(uid);
    if (ev.type === 'declare' && ev.player != null) st.played[ev.player]++;
    if (ev.type === 'damage' && ev.amount > 0) {
      const sc = ctrl(ev.src), tc = ctrl(ev.tgt);
      const side = sc ?? (tc != null ? 1 - tc : null);
      if (side != null) {
        st.dmg[side] += ev.amount;
        if (CARDS[idOf(ev.tgt)]?.type === 'leader') st.face[side] += ev.amount;
        const sid = idOf(ev.src);
        if (sid != null) {
          if (!st.best || ev.amount > st.best.amount) st.best = { amount: ev.amount, id: sid, side };
          const key = `${side}:${sid}`; st.byCard.set(key, (st.byCard.get(key) || 0) + ev.amount);
        }
      }
    }
    if (ev.type === 'death') { const tc = ctrl(ev.uid); const t = CARDS[idOf(ev.uid)]?.type; if (tc != null && (t === 'ally' || t === 'companion')) st.kills[1 - tc]++; }
  }
  /** Update the ranking block of the end screen (filled in by the app once the result is saved). */
  setRankInfo(html) { const el = document.querySelector('#game .over2 .ov-rank'); if (el) el.innerHTML = html; else this._rankHtml = html; }
  showGameOver(winner) {
    const win = winner === this.me, draw = winner === 'draw';
    (win || this.spectator ? sfx.win : sfx.lose)();
    setTimeout(() => { stopAmbient(); playMusic(win || this.spectator ? 'musicWin' : 'musicMenu'); }, 1800);
    const L = this.view.players[win ? 1 - this.me : this.me].leader;
    const p = L && this.pointOf(L.uid);
    if (p) FX.burst(p.x, p.y, { color: ['#3a2a1a', '#7a5a3a', '#ffcf6a'], shape: 'shard', count: 50, speed: 10, gravity: 0.3, add: false, size: 12, spin: 0.5, life: 1400 });
    const me = this.me, op = 1 - me, P = this.view.players;
    const st = this.stats || { dmg: [0, 0], face: [0, 0], kills: [0, 0], played: [0, 0], best: null, byCard: new Map() };
    let bestCard = null;
    for (const [k, v] of st.byCard) { const [side, id] = k.split(':').map(Number); if (side === me && CARDS[id]?.type !== 'leader' && (!bestCard || v > bestCard.v)) bestCard = { id, v }; }
    const name = (i) => esc(LEADER_SHORT[P[i].leader?.id] || CARDS[P[i].leader?.id]?.name.split(',')[0] || P[i].name);
    const art = (i) => (P[i].leader?.id != null ? `assets/leaders/${P[i].leader.id}.webp` : '');
    const row = (lbl, a, b) => `<tr><td>${lbl}</td><td class="${a > b ? 'up' : ''}">${a}</td><td class="${b > a ? 'up' : ''}">${b}</td></tr>`;
    const fighter = (i) => {
      const won = !draw && winner === i, hp = Math.max(0, P[i].leader?.hp ?? 0);
      return `<div class="ov-fighter ${i === me ? 'me' : 'op'} ${draw ? '' : won ? 'won' : 'lost'}">
        <div class="ov-port" style="background-image:url('${art(i)}')"></div>
        ${won ? '<div class="ov-crown">Победитель</div>' : ''}
        <div class="ov-plate"><b>${name(i)}</b><small>${esc(P[i].name)}${i === me && !this.spectator ? ' · вы' : ''}</small><span class="ov-hp">❤ ${hp}</span></div>
      </div>`;
    };
    setTimeout(() => {
      document.querySelector('#game > .over-screen')?.remove();
      const o = document.createElement('div');
      o.className = 'over-screen over2 over3' + (win || (this.spectator && !draw) ? ' win' : draw ? ' draw' : ' lose');
      // New awards: a row of medals that appear one by one; hover shows what each is for.
      const ach = (this.newAch || []).length ? `<div class="ov-medals"><span class="ov-medals-lbl">${this.newAch.length === 1 ? 'Новая награда' : 'Новые награды'}</span>${this.newAch.map((x, k) => `<span class="ov-medal" style="animation-delay:${0.9 + k * 0.25}s" data-tip="${esc(x.title)}|${esc(x.text)}">${x.id ? medalHtml(x.id, { size: 56, tip: false }) : `<span class="medal on" style="--m:56px"><i style="-webkit-mask-image:url(assets/icons/scroll-unfurled.svg);mask-image:url(assets/icons/scroll-unfurled.svg)"></i></span>`}</span>`).join('')}</div>` : '';
      o.innerHTML = `
        <div class="ov-vs">
          ${fighter(me)}
          <div class="ov-mid">
            <div class="ov-title">${draw ? 'Ничья' : win || this.spectator ? 'Победа' : 'Поражение'}</div>
            <div class="ov-vsword">VS</div>
            <div class="ov-sub">${draw ? 'Оба Лидера пали одновременно' : `${name(winner)} побеждает ${esc(LEADER_ACC[P[1 - winner].leader?.id] || name(1 - winner))}`}<br>раунд ${this.view.round || 1}</div>
          </div>
          ${fighter(op)}
        </div>
        <div class="ov-bottom">
          ${ach}
          <div class="ov-rank">${this._rankHtml || (this.noRank ? '' : '<span class="ov-wait">Обновляем мировой рейтинг…</span>')}</div>
          ${this.levelNote ? `<div class="ov-level">${esc(this.levelNote)}</div>` : ''}
          <div class="ov-btns"><button class="ov-btn gold" data-again>Реванш</button><button class="ov-btn" data-stats>Статистика партии</button><button class="ov-btn" data-share>📤 Поделиться</button>${this.onReplay ? '<button class="ov-btn" data-replay>▶ Повтор</button>' : ''}<button class="ov-btn" data-rank>Рейтинг и награды</button><button class="ov-btn" data-menu>В меню</button></div>
          <a class="ov-buy" href="https://cardbattles.cc" target="_blank" rel="noopener">Понравилось? Настоящая коробка — на cardbattles.cc ↗</a>
        </div>
        <div class="ov-statpanel hidden"><div class="ov-statin">
          <table class="ov-stats"><tr><th></th><th>Вы</th><th>Соперник</th></tr>
            ${row('Нанесено ран', st.dmg[me], st.dmg[op])}${row('Из них Лидеру', st.face[me], st.face[op])}${row('Уничтожено союзников', st.kills[me], st.kills[op])}${row('Сыграно карт', st.played[me], st.played[op])}</table>
          <div class="ov-highs">
            ${st.best ? `<div class="ov-high"><span class="ov-pic" style="background-image:url('${CARDS[st.best.id]?.img || ''}')"></span><div><b>Самый сильный удар</b>«${esc(CARDS[st.best.id]?.name.split(',')[0] || '')}» — ${st.best.amount} ${plural(st.best.amount, 'рана', 'раны', 'ран')}${st.best.side === me ? '' : ' (соперник)'}</div></div>` : ''}
            ${bestCard ? `<div class="ov-high"><span class="ov-pic" style="background-image:url('${CARDS[bestCard.id]?.img || ''}')"></span><div><b>Ваша лучшая карта</b>«${esc(CARDS[bestCard.id]?.name.split(',')[0] || '')}» — ${bestCard.v} ${plural(bestCard.v, 'рана', 'раны', 'ран')} за партию</div></div>` : ''}
          </div>
          <button class="ov-btn" data-stats-close>Закрыть</button>
        </div></div>`;
      this.overlay().appendChild(o);
      o.querySelector('[data-menu]').addEventListener('click', () => this.onMenu && this.onMenu(true));
      o.querySelector('[data-again]').addEventListener('click', () => this.onAgain && this.onAgain());
      o.querySelector('[data-rank]').addEventListener('click', () => this.onRanking ? this.onRanking() : this.onMenu && this.onMenu(true));
      o.querySelector('[data-replay]')?.addEventListener('click', () => this.onReplay());
      o.querySelector('[data-share]').addEventListener('click', async () => {
        const fighter = (i) => ({ leader: P[i].leader?.id, name: LEADER_SHORT[P[i].leader?.id] || P[i].name, hp: P[i].leader?.hp ?? 0, lost: !draw && winner !== i });
        const sub = draw ? 'Оба Лидера пали одновременно' : `${LEADER_SHORT[P[winner].leader?.id] || ''} побеждает ${LEADER_ACC[P[1 - winner].leader?.id] || ''} · раунд ${this.view.round || 1}`;
        const blob = await resultPicture({ left: fighter(me), right: fighter(op), title: draw ? 'Ничья' : win || this.spectator ? 'Победа' : 'Поражение', sub, line: `Нанесено ран: ${st.dmg[me]} · уничтожено союзников: ${st.kills[me]}` });
        sharePicture(blob, this.toast);
      });
      const sp = o.querySelector('.ov-statpanel');
      o.querySelector('[data-stats]').addEventListener('click', () => { sfx.click?.(); sp.classList.remove('hidden'); });
      o.querySelector('[data-stats-close]').addEventListener('click', () => sp.classList.add('hidden'));
      sp.addEventListener('click', (e) => { if (e.target === sp) sp.classList.add('hidden'); });
    }, 1300);
  }

}

export function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ---------- helpers for explanations ----------
function costText(c) {
  if (!c) return 'бесплатно';
  const parts = [];
  if (c.coins) parts.push(`${c.coins} 💰`);
  if (c.blood) parts.push(`${c.blood} 🩸`);
  if (c.goods) parts.push(`${c.goods} 📦`);
  if (c.star) parts.push(`${c.star} ✨`);
  if (c.selfDestroy) parts.push('уничтожить эту карту');
  return parts.join(' + ') || 'бесплатно';
}
function cardInfoHtml(d, c) {
  const kws = [...new Set([...(d.kw || []), ...((c && c.kws) || [])])].filter((k) => KW_NAME[k]);
  const toks = c ? Object.entries(c.tok || {}).filter(([, n]) => n > 0).map(([t, n]) => `${TOK_ICON[t] || t} ×${n}`).join('  ') : '';
  const stats = [];
  if (d.cost != null) stats.push(`<span class="st cost">💰 ${c && c.cost != null && c.cost !== d.cost ? `${c.cost} <s>${d.cost}</s>` : d.cost}</span>`);
  if (c && c.atk != null) stats.push(`<span class="st atk">⚔️ ${c.atk}</span>`); else if (d.atk != null) stats.push(`<span class="st atk">⚔️ ${d.atk}</span>`);
  if (c && c.hp != null) stats.push(`<span class="st hp">❤️ ${c.hp}${c.maxHp != null && c.maxHp !== c.hp ? ` / ${c.maxHp}` : ''}</span>`); else if (d.hp != null) stats.push(`<span class="st hp">❤️ ${d.hp}</span>`);
  const text = (d.text || '').replace(/💰/g, '💰');
  return `<div class="ci-name">${esc(d.name)}</div>
    <div class="ci-type">${TYPE_RU[d.type] || ''}${d.subtypes?.length ? ' · ' + d.subtypes.map((x) => x.toLowerCase()).join(', ') : ''}${d.legend ? ' · <b>Легенда</b>' : ''}</div>
    <div class="ci-stats">${stats.join('')}</div>
    ${toks ? `<div class="ci-toks">На карте: ${toks}</div>` : ''}
    ${c && c.stunned ? '<div class="ci-warn">💫 Оглушён: не нанесёт ран в следующем Сражении</div>' : ''}
    <div class="ci-text">${linkTerms(esc(text)).replace(/\n/g, '<br>')}</div>
    ${kws.length ? `<div class="ci-kws">${kws.map((k) => `<div><span>${KW_ICON[k] || '•'}</span> <b>${KW_NAME[k]}</b> — ${KW_HELP[k]}</div>`).join('')}</div>` : ''}`;
}
const TIPS = {
  mulligan: { icon: '🃏', title: 'Стартовая рука', text: 'Выберите 5 карт, которые оставите. Не нравится расклад — «Муллиган»: карты замешаются, и вы возьмёте на 2 меньше. Хорошая рука — дешёвые союзники и Места, которые приносят монеты.' },
  draw: { icon: '🪙', title: 'Начало хода', text: 'Каждый ход вы берёте две вещи: карту из колоды или монету. Можно 2 карты, 2 монеты или по одной. Монеты нужны, чтобы разыгрывать карты.' },
  main: { icon: '▶️', title: 'Ваш ход', text: 'Нажмите на карту с зелёной рамкой, чтобы разыграть её. Цена — в монетах. Союзники встают в ближний ряд и бьются в Сражении; Места дают монеты и свойства. Когда закончите — «Завершить ход».' },
  region: { icon: '🗺️', title: 'Выбор региона', text: 'На поле 5 регионов. Союзник бьётся с тем, кто стоит прямо напротив. Если напротив пусто — он бьёт Лидера соперника.' },
  target: { icon: '🎯', title: 'Выбор цели', text: 'Нажмите на подсвеченную карту. Красная подсветка — враг, зелёная — ваша карта. Карты с ✨ Оберегом выбрать нельзя.' },
  priority: { icon: '⚡', title: 'Опережение', text: 'У вас есть карта или свойство со значком ⚡. Их можно играть в ответ на действия соперника — ваш ответ сработает раньше. Если не нужно — «Пропустить». Кнопка ⚡ сверху выключает эти вопросы.' },
  defense: { icon: '🛡️', title: 'Оборона', text: 'Ваш союзник с Обороной может принять удар на себя вместо Лидера или Напарника. Выберите его — или «Отмена», чтобы удар прошёл как есть.' },
  maneuver: { icon: '🏃', title: 'Манёвр', text: 'Перед боем союзник с Манёвром может перебежать в свободный регион — например, чтобы ударить в Лидера или уйти от сильного врага.' },
  face: { icon: '⚔️', title: 'Удар по Лидеру', text: 'Напротив вашего союзника никого нет — он бьёт напрямую. Выберите: Лидера (цель игры) или Напарника соперника.' },
};
const tipStore = {
  get() { try { return JSON.parse(localStorage.getItem('pchk_tips') || '{}'); } catch { return {}; } },
  put(v) { try { localStorage.setItem('pchk_tips', JSON.stringify(v)); } catch { /* private mode */ } },
  seen(k) { const v = this.get(); return v.off || v[k]; },
  mark(k) { const v = this.get(); v[k] = 1; this.put(v); },
  off() { const v = this.get(); v.off = 1; this.put(v); },
  reset() { this.put({}); },
};
