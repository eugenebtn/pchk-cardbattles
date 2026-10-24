// Board renderer: draws a view from one player's perspective, animates events, collects answers.
import { CARDS } from '../data/cards.js';
import * as FX from './fx.js';
import { sfx } from './sound.js';

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

const COL_X = (k) => 400 + k * 162;
const Y = { oppPlace: 112, oppAlly: 204, myAlly: 484, myPlace: 670 };
const POS = {
  myLeader: { x: 40, y: 712 }, oppLeader: { x: 40, y: 22 },
  mySupport: { x: 22, y: 556 }, oppSupport: { x: 22, y: 186 },
  myDeck: { x: 1236, y: 730 }, myGrave: { x: 1350, y: 730 }, oppDeck: { x: 1236, y: 64 }, oppGrave: { x: 1350, y: 64 },
};
export const cardDef = (id) => CARDS[id];

export class BoardUI {
  constructor(stage, { me, onAnswer, onMenu, hotseat = false }) {
    this.stage = stage;
    this.board = stage.querySelector('#board');
    this.ui = stage.querySelector('#ui-layer');
    this.me = me;
    this.onAnswer = onAnswer;
    this.onMenu = onMenu;
    this.els = new Map();
    this.view = null;
    this.q = null;
    this.chosen = new Set();
    FX.initFx(stage);
    this.buildStatic();
    this.previewEl = document.getElementById('preview');
    this.fit();
    this._fit = () => this.fit();
    window.addEventListener('resize', this._fit);
    this._ro = new ResizeObserver(this._fit); this._ro.observe(document.documentElement);
  }
  destroy() { window.removeEventListener('resize', this._fit); this._ro?.disconnect(); this.board.innerHTML = ''; this.ui.innerHTML = ''; }

  fit() {
    const W = 1600, H = 900;
    const s = Math.min(window.innerWidth / W, window.innerHeight / H);
    this.scale = s;
    this.stage.style.transform = `scale(${s})`;
    this.stage.style.left = `${(window.innerWidth - W * s) / 2}px`;
    this.stage.style.top = `${(window.innerHeight - H * s) / 2}px`;
  }
  regionCol(r) { return this.me === 0 ? r : 4 - r; }

  buildStatic() {
    const b = this.board;
    b.innerHTML = '';
    b.insertAdjacentHTML('beforeend', `<div class="mat opp"></div><div class="mat me"></div><div class="midline"></div>`);
    for (const [x, y] of [[352, 60], [1212, 60], [352, 700], [1212, 700]]) {
      b.insertAdjacentHTML('beforeend', `<div class="torch" style="left:${x}px;top:${y}px"><div class="glow"></div><div class="bracket"></div><div class="flame"></div></div>`);
    }
    this.cols = [];
    this.slots = { ally: [[], []], place: [[], []] };
    for (let r = 0; r < 5; r++) {
      const k = this.regionCol(r);
      const col = document.createElement('div');
      col.className = 'region-col'; col.style.left = COL_X(k) + 'px';
      b.appendChild(col); this.cols[r] = col;
      const lbl = document.createElement('div');
      lbl.className = 'region-label'; lbl.style.left = COL_X(k) + 'px'; lbl.textContent = `Регион ${k + 1}`;
      b.appendChild(lbl);
      for (const side of [0, 1]) {
        const mine = side === this.me;
        for (const row of ['ally', 'place']) {
          const s = document.createElement('div');
          s.className = `slot ${row}`;
          s.style.left = (COL_X(k) + (row === 'ally' ? 10 : 5)) + 'px';
          s.style.top = (row === 'ally' ? (mine ? Y.myAlly : Y.oppAlly) : (mine ? Y.myPlace : Y.oppPlace)) + 'px';
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
      myDeck: mk('pile deck', POS.myDeck, '<div class="lbl">Скрижаль</div><div class="card-back" style="left:0;top:0"></div><div class="count">0</div>'),
      oppDeck: mk('pile deck', POS.oppDeck, '<div class="lbl">Скрижаль</div><div class="card-back" style="left:0;top:0"></div><div class="count">0</div>'),
      myGrave: mk('pile grave', POS.myGrave, '<div class="lbl">Кладбище</div><div class="empty">🪦</div><div class="count">0</div>'),
      oppGrave: mk('pile grave', POS.oppGrave, '<div class="lbl">Кладбище</div><div class="empty">🪦</div><div class="count">0</div>'),
    };
    this.piles.myGrave.addEventListener('click', () => this.showGrave(this.me));
    this.piles.oppGrave.addEventListener('click', () => this.showGrave(1 - this.me));
    this.names = { me: mk('pname', { x: 205, y: 722 }), opp: mk('pname', { x: 205, y: 28 }) };
    this.coinsEl = {
      me: mk('coins', { x: 205, y: 760 }, '<div class="coin-ico">₽</div><span>0</span>'),
      opp: mk('coins', { x: 205, y: 66 }, '<div class="coin-ico">₽</div><span>0</span>'),
    };
    this.coinsEl.me.querySelector('.coin-ico').textContent = '💰';
    this.coinsEl.opp.querySelector('.coin-ico').textContent = '💰';
    this.roundBox = mk('round-box', { x: 1250, y: 398 });
    // UI layer: end turn, log, stack, top buttons, prompt.
    const u = this.ui;
    u.innerHTML = `
      <button class="end-turn wait" id="end-turn">Ход соперника</button>
      <div class="log-panel" id="log"></div>
      <div class="stack-panel" id="stack"></div>
      <div class="top-btns">
        <button class="icon-btn" id="btn-fast" title="Спрашивать об Опережении">⚡</button>
        <button class="icon-btn" id="btn-speed" title="Скорость анимаций">⏩</button>
        <button class="icon-btn" id="btn-music" title="Музыка">🎵</button>
        <button class="icon-btn" id="btn-sound" title="Звук">🔊</button>
        <button class="icon-btn" id="btn-menu" title="В меню">☰</button>
      </div>
      <div class="prompt" id="prompt"></div>`;
    this.endBtn = u.querySelector('#end-turn');
    this.endBtn.addEventListener('click', () => this.clickEnd());
    this.logEl = u.querySelector('#log');
    this.stackEl = u.querySelector('#stack');
    this.promptEl = u.querySelector('#prompt');
    u.querySelector('#btn-menu').addEventListener('click', () => this.onMenu && this.onMenu());
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
  leaderPoint(side) { const v = this.view; const L = v?.players[side]?.leader; return L ? this.pointOf(L.uid) : { x: 115, y: side === this.me ? 787 : 97 }; }

  // ---------- rendering ----------
  render(view) {
    this.view = view;
    const me = this.me, op = 1 - me;
    const P = view.players;
    const want = new Map();
    const place = (c, mode, x, y, z = 1) => { if (c) want.set(c.uid, { c, mode, x, y, z }); };
    for (const side of [me, op]) {
      const mine = side === me;
      const p = P[side];
      place(p.leader, 'leader', (mine ? POS.myLeader : POS.oppLeader).x, (mine ? POS.myLeader : POS.oppLeader).y, 2);
      p.regions.forEach((reg, r) => {
        const k = this.regionCol(r);
        place(reg.ally, 'ally', COL_X(k) + 10, mine ? Y.myAlly : Y.oppAlly, 3);
        place(reg.place, 'place', COL_X(k) + 5, mine ? Y.myPlace : Y.oppPlace, 2);
      });
      const sp = mine ? POS.mySupport : POS.oppSupport;
      const n = p.support.length;
      const step = n > 4 ? Math.floor(300 / (n - 1)) : 86;
      p.support.forEach((c, k) => place(c, 'small', sp.x + k * step, sp.y + (n > 4 && k % 2 ? 6 : 0), 3 + k));
      // Hands.
      const hand = p.hand;
      if (mine) {
        const n2 = hand.length, w = Math.min(118, 760 / Math.max(1, n2));
        const x0 = 800 - (w * (n2 - 1)) / 2 - 75;
        hand.forEach((c, k) => {
          const mid = (n2 - 1) / 2;
          want.set(c.uid, { c, mode: c.hidden ? 'back' : 'hand', x: x0 + k * w, y: 768 + Math.abs(k - mid) * 4, z: 10 + k, rot: (k - mid) * 2.2 });
        });
      } else {
        const n2 = hand.length, w = Math.min(64, 520 / Math.max(1, n2));
        const x0 = 800 - (w * (n2 - 1)) / 2 - 48;
        hand.forEach((c, k) => {
          const mid = (n2 - 1) / 2;
          want.set(c.uid, { c, mode: c.hidden ? 'back' : 'ohand', x: x0 + k * w, y: -76 + Math.abs(k - mid) * 3, z: 10 + k, rot: -(k - mid) * 2.5 });
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
        el.addEventListener('click', (e) => { e.stopPropagation(); this.clickCard(Number(uid)); });
        el.addEventListener('mouseenter', () => this.showPreview(Number(uid), el));
        el.addEventListener('mouseleave', () => this.hidePreview());
        // Start from a sensible origin.
        const origin = this.originFor(w, uid);
        el.style.left = origin.x + 'px'; el.style.top = origin.y + 'px';
        el.style.transition = 'none';
        this.board.appendChild(el);
        this.els.set(uid, el);
      }
      this.fillCard(el, w);
      el.style.zIndex = w.z;
      if (fresh) {
        el.getBoundingClientRect();
        el.style.transition = '';
      }
      el.style.transition = 'left .45s cubic-bezier(.2,.8,.3,1), top .45s cubic-bezier(.2,.8,.3,1), transform .25s';
      el.style.left = w.x + 'px'; el.style.top = w.y + 'px';
      el.style.transform = w.rot ? `rotate(${w.rot}deg)` : '';
    }
    this.renderSide(view);
    this.applyInteractivity();
  }
  originFor(w, uid) {
    const mine = w.c.owner === this.me || w.c.ctrl === this.me;
    if (w.mode === 'hand') return { x: POS.myDeck.x, y: POS.myDeck.y };
    if (w.mode === 'back' || w.mode === 'ohand') return { x: POS.oppDeck.x, y: POS.oppDeck.y - 100 };
    if (this._spawnFrom) return { x: this._spawnFrom.x - 67, y: this._spawnFrom.y - 87 };
    return { x: w.x, y: w.y };
  }
  animateOut(el, uid, view) {
    // Where did it go?
    let to = null;
    for (const p of view.players) {
      if (p.grave.some((c) => c.uid === uid)) to = p.i === this.me ? POS.myGrave : POS.oppGrave;
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
      if (c.cost != null && base != null && w.mode === 'hand') {
        const cls = c.cost === 'X' ? '' : c.cost < base ? 'cheaper' : c.cost > base ? 'dearer' : '';
        if (cls) costHtml = `<div class="cost-now ${cls}">${c.cost}</div>`;
      }
      el.innerHTML = `<div class="face" style="${bg}">${gen}</div><div class="gloss"></div>${costHtml}${!img ? `<div class="nm" style="bottom:12px">${d.name}</div>` : ''}`;
      if (!el._tilt) {
        el._tilt = true;
        el.addEventListener('mousemove', (e) => {
          const r = el.getBoundingClientRect();
          const nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5;
          const f = el.querySelector('.face');
          if (f) f.style.transform = `perspective(600px) rotateY(${nx * 18}deg) rotateX(${-ny * 18}deg)`;
        });
        el.addEventListener('mouseleave', () => { const f = el.querySelector('.face'); if (f) f.style.transform = ''; });
      }
      return;
    }
    const mode = w.mode;
    const cls = ['card', mode === 'small' ? `small ${d.type}` : mode];
    if (d.legend) cls.push('legend');
    if (c.created) cls.push('created');
    const kws = c.kws || [];
    for (const k of ['defense', 'indestructible', 'breakthrough', 'deathtouch']) if (kws.includes(k)) cls.push(k);
    if (c.stunned) cls.push('stunned');
    el.className = cls.join(' ');
    let stats = '';
    if (c.atk != null && d.type === 'ally') {
      const buffed = c.atk > (d.atk ?? 0);
      stats += `<div class="stat atk ${buffed ? 'buffed' : ''}">${c.atk}</div>`;
    }
    if (c.hp != null) {
      const hurt = c.dmg > 0 || (d.type === 'leader' && c.hp < c.maxHp);
      const buffed = c.maxHp > (d.hp ?? 0) && !hurt;
      stats += `<div class="stat hp ${hurt ? 'hurt' : ''} ${buffed ? 'buffed' : ''}">${c.hp}</div>`;
    }
    const kwIcons = kws.filter((k) => KW_ICON[k] && k !== 'defense' && k !== 'ward').map((k) => `<div class="kw" title="${KW_NAME[k]}">${KW_ICON[k]}</div>`).join('');
    const toks = Object.entries(c.tok || {}).filter(([, n]) => n > 0).map(([t, n]) => `<div class="tok ${t}">${TOK_ICON[t] || t}${n}</div>`).join('');
    const showName = mode !== 'leader';
    el.innerHTML = `
      <div class="shadow"></div>
      ${kws.includes('defense') && mode !== 'leader' ? '<div class="taunt"></div>' : ''}
      <div class="frame"></div>
      <div class="face" style="${bg}">${gen}</div><div class="shade"></div>
      ${d.legend && mode === 'ally' ? '<div class="crown"></div>' : ''}
      ${showName ? `<div class="nm">${d.name.split(',')[0]}</div>` : ''}
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
    this.names.me.innerHTML = `${turnDot(me)}${esc(P[me].name)}`;
    this.names.opp.innerHTML = `${turnDot(op)}${esc(P[op].name)}`;
    for (const [el, p] of [[this.coinsEl.me, P[me]], [this.coinsEl.opp, P[op]]]) {
      const span = el.querySelector('span');
      if (span.textContent !== String(p.coins)) { span.textContent = p.coins; span.animate([{ transform: 'scale(1.6)' }, { transform: 'scale(1)' }], { duration: 300 }); }
    }
    const phase = view.phase === 'battle' ? 'Сражение' : view.phase === 'turn' ? (view.turn === me ? 'Ваш ход' : 'Ход соперника') : view.phase === 'over' ? 'Конец игры' : 'Подготовка';
    this.roundBox.innerHTML = `<b>Раунд ${view.round || 1}</b>${phase}${view.skipBattles ? '<br>⛔ бой пропускается' : ''}<br><small>${view.first === me ? 'Вы ходите первым' : 'Соперник ходит первым'}</small>`;
    for (let r = 0; r < 5; r++) this.cols[r].classList.toggle('fighting', view.battleRegion === r);
    // Log.
    const atBottom = this.logEl.scrollTop + this.logEl.clientHeight >= this.logEl.scrollHeight - 10;
    this.logEl.innerHTML = view.log.slice(-40).map((l) => `<div>${esc(l)}</div>`).join('');
    if (atBottom) this.logEl.scrollTop = this.logEl.scrollHeight;
    // Stack.
    this.stackEl.innerHTML = view.stack.length ? '<div style="font-size:13px;color:#9fd0ff">Стопка:</div>' + [...view.stack].reverse().map((it) => `<div class="stack-item ${it.player === me ? '' : 'p1'}">${esc(it.label)}</div>`).join('') : '';
  }

  // ---------- interaction ----------
  setPending(q) {
    this.q = q;
    this.chosen.clear();
    this.closeModal();
    this.applyInteractivity();
    this.renderPrompt();
  }
  myOptions() { return this.q && this.q.player === this.me ? this.q.options : []; }
  applyInteractivity() {
    for (const el of this.els.values()) el.classList.remove('selectable', 'harm', 'playable', 'fastable', 'usable', 'chosen');
    for (const row of ['ally', 'place']) for (const side of [0, 1]) for (const s of this.slots[row][side]) s.classList.remove('selectable');
    const q = this.q;
    const mine = q && q.player === this.me;
    this.stage.classList.toggle('choosing', !!(mine && ['region', 'target'].includes(q.type)));
    this.endBtn.className = 'end-turn wait';
    this.endBtn.textContent = this.view?.phase === 'battle' ? 'Сражение' : 'Ход соперника';
    if (!mine) return;
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
    el.className = 'prompt';
    el.innerHTML = '';
    if (!q) return;
    if (q.player !== this.me) {
      if (this.view?.phase === 'battle') { el.innerHTML = ''; return; }
      el.className = 'prompt wait';
      el.innerHTML = `<div class="ptext">Соперник думает…</div>`;
      return;
    }
    const btns = [];
    let text = q.prompt || '';
    switch (q.type) {
      case 'main': text = ''; break;
      case 'priority': text = q.prompt; btns.push(['Пас', 'pass']); break;
      case 'draw':
        el.innerHTML = `<div class="ptext">${esc(q.prompt)}</div><div class="draw-choice">${q.options.map((o) => `<button data-id="${o.id}"><span class="big-ico">${o.id === 'card' ? '🂠' : '🪙'}</span>${o.id === 'card' ? 'Карта' : 'Монета'}</button>`).join('')}</div>`;
        el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { sfx.click(); this.answer(b.dataset.id); }));
        return;
      case 'pick':
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
    if (q.cancel) btns.push(['Отмена', null]);
    el.innerHTML = (text ? `<div class="ptext">${esc(text)}</div>` : '') + (btns.length ? `<div class="pbtns">${btns.map(([l], k) => `<button class="btn small" data-k="${k}">${esc(l)}</button>`).join('')}</div>` : '');
    el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { sfx.click(); this.answer(btns[Number(b.dataset.k)][1]); }));
  }
  answer(a) {
    if (!this.q) return;
    const q = this.q;
    this.q = null;
    this.applyInteractivity();
    this.promptEl.innerHTML = '';
    this.closeModal();
    this.hidePreview();
    this.onAnswer(q, a);
  }
  clickEnd() {
    const q = this.q;
    if (!q || q.player !== this.me) return;
    if (q.type === 'main') { sfx.click(); this.answer('end'); }
    else if (q.type === 'priority') { sfx.click(); this.answer('pass'); }
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
  clickCard(uid) {
    const q = this.q;
    // Touch screens: first tap shows the card large, second tap uses it.
    if (window.matchMedia('(hover: none)').matches) {
      const el = this.els.get(uid);
      if (el && this.armed !== uid && (el.classList.contains('hand-card') || el.classList.contains('usable'))) {
        this.armed = uid; this.showPreview(uid, el); return;
      }
      this.armed = null;
    }
    if (!q || q.player !== this.me) { this.togglePreview(uid); return; }
    if (q.type === 'target' && q.options.some((o) => o.id === uid)) { sfx.click(); this.answer(uid); return; }
    if (q.type === 'main' || q.type === 'priority') {
      const plays = q.options.filter((o) => o.kind === 'play' && o.uid === uid);
      const abs = q.options.filter((o) => o.kind === 'ability' && o.uid === uid);
      const all = [...plays, ...abs];
      if (all.length === 1) { sfx.click(); this.answer(all[0].id); return; }
      if (all.length > 1) { this.openChoiceMenu(uid, all); return; }
    }
    if (q.type === 'region' && this.view) {
      // Clicking an occupied card in a selectable row does nothing.
    }
    this.togglePreview(uid);
  }
  openChoiceMenu(uid, opts) {
    const labels = opts.map((o) => o.kind === 'play' ? `Разыграть «${CARDS[o.side].name}»${o.cost != null ? ` — ${o.cost} 💰` : ''}` : `Свойство: ${o.label}`);
    this.modal(`<h3>${esc(CARDS[this.cardIdOf(uid)]?.name || '')}</h3><div class="row-btns" style="flex-direction:column">${labels.map((l, k) => `<button class="btn" data-k="${k}">${esc(l)}</button>`).join('')}<button class="btn danger" data-k="-1">Отмена</button></div>`, (m) => {
      m.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
        const k = Number(b.dataset.k);
        this.closeModal();
        if (k >= 0) { sfx.click(); this.answer(opts[k].id); }
      }));
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

  // ---------- modals ----------
  modal(html, bind) {
    this.closeModal();
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal">${html}</div>`;
    this.ui.appendChild(back);
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
  openMulligan(q) {
    const sel = new Set();
    const ids = q.options.map((o) => ({ uid: o.id, id: this.cardIdOf(o.id) }));
    const html = `<h3>Стартовая рука: оставьте ${q.keep} карт</h3>
      <div class="cards">${ids.map((c) => `<div class="mcard" data-uid="${c.uid}" style="background-image:url('${CARDS[c.id]?.img || ''}')"></div>`).join('')}</div>
      <div class="row-btns"><button class="btn primary" data-ok>Оставить выбранные</button>${q.canMull ? '<button class="btn danger" data-mull>Муллиган (взять на 2 карты меньше)</button>' : ''}</div>
      <p style="color:var(--ink-dim);margin:8px 0 0">${q.prompt}</p>`;
    this.modal(html, (m) => {
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
      ${!d.img && d.text ? `<div>${esc(d.text)}</div>` : ''}</div>`;
    pv.classList.remove('hidden');
    const r = el.getBoundingClientRect();
    const w = pv.offsetWidth || 300, h = pv.offsetHeight || 520;
    // Fixed spot on the far side of the screen, like a card inspector.
    const x = r.left + r.width / 2 > window.innerWidth / 2 ? 12 : window.innerWidth - w - 12;
    const y = Math.max(8, (window.innerHeight - h) / 2);
    pv.style.left = x + 'px'; pv.style.top = y + 'px';
  }
  hidePreview() { this.previewEl.classList.add('hidden'); }

  // ---------- event animations ----------
  async playEvents(batch) {
    for (let k = 0; k < batch.length; k++) {
      const { ev, view } = batch[k];
      try { await this.pre(ev, batch, k); } catch (e) { console.warn(e); }
      this.render(view);
      try { await this.post(ev); } catch (e) { console.warn(e); }
    }
  }
  async pre(ev, batch, k) {
    const W = FX.wait;
    switch (ev.type) {
      case 'declare': case 'declareAbility': {
        const id = ev.id ?? this.cardIdOf(ev.uid);
        if (ev.type === 'declare') await this.showStageCard(ev.uid, id, ev.player);
        else {
          const p = this.pointOf(ev.uid);
          if (p) {
            FX.glow(p.x, p.y, 'rgba(90,180,255,.7)', 110, 600);
            FX.ring(p.x, p.y, '#8fd0ff', 26, 600, 2.2, 4);
            FX.burst(p.x, p.y, { color: ['#59b6ff', '#cfeaff', '#ffffff'], count: 22, speed: 4, size: 7, gravity: -0.05 });
            const el = this.els.get(ev.uid);
            el?.animate([{ transform: 'scale(1)', filter: 'brightness(1)' }, { transform: 'scale(1.12)', filter: 'brightness(1.6)' }, { transform: 'scale(1)', filter: 'brightness(1)' }], { duration: 420 / FX.speed });
          }
          sfx.magic(p?.x); await W(320);
        }
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
        if (!tgtPt) tgtPt = { x: ap.x, y: ap.y + (ap.y > 430 ? -300 : 300) };
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
        // Impact.
        FX.impact(ap.x + dx / 0.8 * 0.92, ap.y + dy / 0.8 * 0.92, this.attackColor(a));
        await W(0.45 * 760);
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
          if (isLeader) sfx.face(ev.amount, p.x); else sfx.hit(ev.amount, p.x);
          FX.shake(Math.min(2.6, 0.4 + ev.amount / 3.2));
          el?.animate([{ transform: 'translate(0,0) scale(1)' }, { transform: 'translate(-7px,3px) scale(.96)' }, { transform: 'translate(7px,-3px) scale(1.02)' }, { transform: 'translate(-3px,1px)' }, { transform: 'translate(0,0) scale(1)' }], { duration: 320 });
        }
        await W(ev.combat ? 300 : 360);
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
        const col = this.cols[ev.region];
        if (col) { const p = this.stagePoint(col); FX.glow(p.x, p.y, 'rgba(255,170,60,.35)', 170, 600); sfx.drum(); }
        await W(260);
        break;
      }
      case 'turnStart': {
        if (ev.player === this.me) { sfx.turn(); await FX.banner('Ваш ход', '', 1150); } else await FX.banner('Ход соперника', 'dim', 850);
        break;
      }
      case 'round': await W(150); break;
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
        el.animate([
          { transform: 'translateY(-90px) scale(1.6)', opacity: 0, filter: 'brightness(2.2) drop-shadow(0 40px 20px rgba(0,0,0,.6))' },
          { transform: 'translateY(-20px) scale(1.25)', opacity: 1, filter: 'brightness(1.5)', offset: 0.45 },
          { transform: 'translateY(0) scale(.94)', filter: 'brightness(1.2)', offset: 0.72 },
          { transform: 'scale(1)', filter: 'brightness(1)' },
        ], { duration: 560 / FX.speed, easing: 'cubic-bezier(.5,0,.6,1)' });
        await W(400);
        if (type === 'ally' || type === 'place') {
          sfx.land(big, p.x);
          FX.dust(p.x, p.y + (type === 'ally' ? 70 : 34), big ? 1.6 : 1);
          FX.ring(p.x, p.y + 30, d.legend ? '#ffd84a' : 'rgba(255,230,180,.75)', 24, 600, big ? 5 : 3, big ? 7 : 3);
          FX.shake(big ? ((d.cost ?? 0) >= 9 ? 2.4 : 1.5) : 0.5);
        } else {
          sfx.magic(p.x);
          FX.glow(p.x, p.y, type === 'companion' ? 'rgba(190,120,255,.7)' : 'rgba(255,210,120,.7)', 90, 600);
          FX.burst(p.x, p.y, { color: type === 'companion' ? ['#d6a8ff', '#8a4ab0', '#fff'] : ['#ffe08a', '#fff', '#c98a2a'], count: 24, speed: 4, size: 7, gravity: -0.06 });
        }
        if (d.legend) {
          sfx.legend(p.x);
          FX.rays(p.x, p.y, '#ffd84a');
          FX.burst(p.x, p.y, { color: ['#ffd84a', '#fff1a8', '#ffffff'], count: 40, speed: 10, size: 7 });
        }
        if (ev.created && type === 'ally') sfx.animal(p.x);
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
      case 'gameOver': this.showGameOver(ev.winner); break;
      case 'resolve': await W(60); break;
      default: break;
    }
  }
  async showStageCard(uid, id, player) {
    const d = CARDS[id];
    if (!d) return;
    const el = this.els.get(uid);
    const from = el ? this.stagePoint(el) : (player === this.me ? { x: 800, y: 850 } : { x: 800, y: 0 });
    const sc = document.createElement('div');
    sc.className = 'stage-card';
    sc.style.backgroundImage = d.img ? `url('${d.img}')` : '';
    if (!d.img) sc.innerHTML = `<div class="gen-card" style="width:100%;height:100%">${esc(d.name)}</div>`;
    const tx = 1010, ty = 230;
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
    FX.glow(tx + 150, ty + 209, d.legend ? 'rgba(255,210,90,.75)' : 'rgba(255,200,120,.45)', 230, 700);
    if (d.legend) FX.rays(tx + 150, ty + 209, '#ffd84a');
    await FX.wait(player === this.me ? 480 : 1000);
    this._spawnFrom = { x: tx + 150, y: ty + 209 };
    sc.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.55) translateY(40px)' }], { duration: 280 / FX.speed });
    setTimeout(() => sc.remove(), 300 / FX.speed);
    if (el) el.style.opacity = '';
  }
  showGameOver(winner) {
    const win = winner === this.me, draw = winner === 'draw';
    (win ? sfx.win : sfx.lose)();
    if (win) for (let i = 0; i < 6; i++) setTimeout(() => FX.burst(200 + Math.random() * 1200, 200 + Math.random() * 400, { emoji: ['🎉', '✨', '🏆', '🎊'], shape: 'emoji', count: 14, speed: 9, add: false, size: 14, gravity: 0.2 }), i * 250);
    const L = this.view.players[win ? 1 - this.me : this.me].leader;
    const p = L && this.pointOf(L.uid);
    if (p) FX.burst(p.x, p.y, { color: ['#3a2a1a', '#7a5a3a', '#ffcf6a'], shape: 'shard', count: 50, speed: 10, gravity: 0.3, add: false, size: 12, spin: 0.5, life: 1400 });
    setTimeout(() => {
      const o = document.createElement('div');
      o.className = 'over-screen';
      o.innerHTML = `<div class="over-box ${win ? '' : 'lose'}"><h1>${draw ? 'Ничья' : win ? 'Победа!' : 'Поражение'}</h1><p>${draw ? 'Оба Лидера пали одновременно' : win ? 'Вражеский Лидер повержен' : 'Ваш Лидер пал'}</p><div class="row-btns" style="display:flex;gap:12px;justify-content:center"><button class="btn primary" data-again>Ещё раз</button><button class="btn" data-menu>В меню</button></div></div>`;
      this.ui.appendChild(o);
      o.querySelector('[data-menu]').addEventListener('click', () => this.onMenu && this.onMenu(true));
      o.querySelector('[data-again]').addEventListener('click', () => this.onAgain && this.onAgain());
    }, 1200);
  }
}

export function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
