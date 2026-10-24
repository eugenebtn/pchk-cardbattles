// App shell: menu, deck choice, game sessions (bot, hot-seat, online host/guest), builder, rules.
import { Game } from './engine/game.js';
import { botAnswer } from './engine/bot.js';
import { CARDS } from './data/cards.js';
import { DECKS } from './data/decks.js';
import { BoardUI, esc } from './ui/board.js';
import { sfx, setSound, setMusic, playMusic, unlockAudio } from './ui/sound.js';
import * as FX from './ui/fx.js';
import { hostRoom, joinRoom } from './net/online.js';
import { renderRules } from './ui/rules.js';
import { renderBuilder, loadCustomDecks } from './ui/builder.js';
import { installTooltips, linkTerms } from './ui/glossary.js';
import { renderStats, recordGame } from './ui/stats.js';
import { submitResult } from './net/ranking.js';
import { showTutorial } from './ui/tutorial.js';
installTooltips();

const $ = (s, r = document) => r.querySelector(s);
const store = {
  get(k, d) { try { const v = localStorage.getItem('pchk_' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('pchk_' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};

// ---------- screens ----------
function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  FX.ambient(id === 'game');
  $('#scene').classList.toggle('off', id === 'game');
  if (audioStarted) playMusic(id === 'game' ? (Math.random() < 0.5 ? 'musicGame' : 'musicGame2') : 'musicMenu');
}
function toast(text, ms = 3000) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

// ---------- settings ----------
const opt = {
  sound: store.get('sound', true), bonus: store.get('bonus', false), autopass: store.get('autopass', false),
  name: store.get('name', ''), speed: store.get('speed', 1), music: store.get('music', true), board: store.get('board', 'random'),
};
setSound(opt.sound); setMusic(opt.music); FX.setSpeed(opt.speed);
$('#opt-music').checked = opt.music;
$('#opt-music').addEventListener('change', (e) => { opt.music = e.target.checked; setMusic(opt.music); store.set('music', opt.music); });
// Browsers allow sound only after the first click.
let audioStarted = false;
document.addEventListener('pointerdown', () => {
  if (audioStarted) return;
  audioStarted = true; unlockAudio();
  playMusic(document.querySelector('#game').classList.contains('active') ? 'musicGame' : 'musicMenu');
}, { capture: true });
$('#opt-sound').checked = opt.sound;
$('#opt-bonus').checked = opt.bonus;
$('#opt-autopass').checked = opt.autopass;
$('#opt-name').value = opt.name;
$('#opt-board').value = opt.board;
$('#opt-board').addEventListener('change', (e) => { opt.board = e.target.value; store.set('board', opt.board); });
$('#opt-sound').addEventListener('change', (e) => { opt.sound = e.target.checked; setSound(opt.sound); store.set('sound', opt.sound); });
$('#opt-bonus').addEventListener('change', (e) => { opt.bonus = e.target.checked; store.set('bonus', opt.bonus); });
$('#opt-autopass').addEventListener('change', (e) => { opt.autopass = e.target.checked; store.set('autopass', opt.autopass); });
$('#opt-name').addEventListener('input', (e) => { opt.name = e.target.value.trim(); store.set('name', opt.name); });
const myName = () => opt.name || 'Игрок';

// Preload card art.
setTimeout(() => { for (const c of Object.values(CARDS)) if (c.img) { const i = new Image(); i.src = c.img; } }, 300);

// ---------- scene behind the splash, menu and hero select: velvet, leader art slices, a fan of leader cards ----------
const LEADER_IDS = [62, 117, 41, 20, 118, 63];
(function scene() {
  $('#scene-slices').innerHTML = [20, 41, 63, 62, 117, 118].map((id) => `<div class="sl" style="background-image:url('${CARDS[id].img}')"></div>`).join('');
  document.querySelectorAll('[data-fan]').forEach((fan) => {
    const n = LEADER_IDS.length;
    fan.innerHTML = LEADER_IDS.map((id, i) => `<div class="fan-card" style="--k:${i - (n - 1) / 2};--i:${i};background-image:url('${CARDS[id].img}')"></div>`).join('');
  });
  const cv = $('#menu-bg'), c = cv.getContext('2d');
  const embers = Array.from({ length: 40 }, () => ({ x: Math.random(), y: Math.random(), s: 0.8 + Math.random() * 2, v: 0.0004 + Math.random() * 0.001, w: Math.random() * 6 }));
  function frame(t) {
    if ($('#scene').classList.contains('off')) { requestAnimationFrame(frame); return; }
    if (cv.width !== cv.clientWidth) { cv.width = cv.clientWidth; cv.height = cv.clientHeight; }
    c.clearRect(0, 0, cv.width, cv.height);
    for (const e of embers) {
      e.y -= e.v; if (e.y < -0.05) { e.y = 1.05; e.x = Math.random(); }
      const x = (e.x + Math.sin(t / 1000 + e.w) * 0.012) * cv.width, y = e.y * cv.height;
      const g = c.createRadialGradient(x, y, 0, x, y, e.s * 4);
      g.addColorStop(0, 'rgba(255,224,160,.7)'); g.addColorStop(0.4, 'rgba(230,150,60,.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, e.s * 4, 0, 7); c.fill();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
// Splash: the first click also turns the sound on.
$('#splash').addEventListener('click', () => { sfx.confirm(); show('menu'); });
$('#menu [data-act=settings]')?.addEventListener('click', () => { $('#menu-opts').classList.toggle('hidden'); });

// ---------- decks ----------
const DECK_STYLE = {
  sfinkteirion: 'Стабильный доход, сильные Воины и постепенное давление. Хороший выбор для первой партии.',
  larisa: 'Рой зверей: много дешёвых Животных, скидки на первую карту и быстрый натиск числом.',
  dan_balan: 'Дешёвые Вампиры, кровь и темп — закончить партию раньше, чем соперник опомнится.',
  vlad: 'Терпение и контроль: копите ресурсы, уничтожайте угрозы и добивайте вампирскими лордами.',
  erik: 'Плуты и трюки: играйте карты в ход соперника и готовьте подлые сюрпризы.',
  sofia: 'Таверны и Торговцы: много монет, лечение Лидера и могучие Древолюды под конец.',
};
function allDecks() {
  const official = Object.values(DECKS).map((d) => ({ key: 'off:' + d.key, deckKey: d.key, title: d.title, leader: d.leader, cards: d.main, official: true }));
  const custom = loadCustomDecks(store).map((d, k) => ({ key: 'cus:' + k, title: d.name, leader: d.leader, cards: d.cards, official: false }));
  return [...official, ...custom];
}
function deckMix(cards) {
  const n = { ally: 0, place: 0, action: 0, item: 0, companion: 0 };
  for (const id of cards) { const t = CARDS[id]?.type; if (t in n) n[t]++; }
  return `⚔ ${n.ally} союзников · 🏰 ${n.place} мест · ✨ ${n.action} действий · 🎒 ${n.item + n.companion} напарников и предметов`;
}
/** Hero select. steps: [{title, allowRandom, goLabel}] → resolves with array of decks (or null). */
function pickDecks(steps) {
  return new Promise((resolve) => {
    const decks = allDecks();
    const chosen = [];
    let step = 0;
    const root = $('#heroes');
    const draw = () => {
      const st = steps[step];
      const list = st.allowRandom ? [{ key: 'random', title: 'Случайный', leader: null, cards: [], random: true }, ...decks] : decks;
      let sel = list.find((d) => d.key === (draw.last || '')) || list[st.allowRandom ? 1 : 0];
      const paint = () => {
        const L = sel.random ? null : CARDS[sel.leader];
        root.innerHTML = `<div class="hero-select">
          <div class="hs-title">${esc(st.title)}</div>
          <div class="hs-main">
            <div class="hs-portrait" style="background-image:url('${L ? L.img : CARDS[63].img}')${sel.random ? ';filter:brightness(.35) blur(2px)' : ''}">${sel.random ? '<div style="position:absolute;inset:0;display:grid;place-items:center;font-size:120px;filter:none">🎲</div>' : ''}</div>
            <div class="hs-info">
              <div class="hs-name">${esc(sel.random ? 'Случайный соперник' : L.name)}</div>
              <div class="hs-sub">${sel.random ? 'Компьютер возьмёт любую стартовую колоду' : `${esc(sel.title)} · ${sel.official ? 'стартовая скрижаль' : 'своя колода'} · ${sel.cards.length} карт`}</div>
              ${L ? `<div class="hs-hp" data-tip="Здоровье Лидера|Если упадёт до 0 — поражение.">❤️ ${L.hp}</div>
              <div class="hs-ability">${linkTerms(esc(L.text)).replace(/\n/g, '<br>')}</div>
              <div class="hs-style">${esc(DECK_STYLE[sel.deckKey] || 'Ваша собственная скрижаль.')}</div>
              <div class="hs-sub" style="margin-top:10px">${deckMix(sel.cards)}</div>` : ''}
            </div>
          </div>
          <div class="hs-roster"><div class="hs-medal newdeck" data-new><div class="m">＋</div>Своя колода<div class="tag">собрать</div></div>${list.map((d) => `<div class="hs-medal ${d === sel ? 'sel' : ''} ${d.random ? 'random' : ''}" data-key="${d.key}">
            <div class="m" ${d.random ? '' : `style="background-image:url('${CARDS[d.leader].img}')"`}>${d.random ? '🎲' : ''}</div>
            ${esc(d.random ? 'Случайный' : d.title)}${!d.random && !d.official ? '<div class="tag">своя</div>' : ''}</div>`).join('')}</div>
          <div class="hs-bar"><button class="btn" data-back>← Назад</button><button class="btn hs-go" data-go>${esc(step === steps.length - 1 ? (st.goLabel || 'В бой!') : 'Далее')}</button></div>
        </div>`;
        root.querySelectorAll('.hs-medal').forEach((m) => m.addEventListener('click', () => {
          const d = list.find((x) => x.key === m.dataset.key);
          if (!d || d === sel) return; // «＋ Своя колода» has its own handler
          sel = d; draw.last = d.key; sfx.select(); sfx.reveal(); paint();
        }));
        root.querySelector('[data-new]').onclick = () => {
          sfx.select();
          openBuilder({ startNew: true, back: () => { const fresh = allDecks(); decks.length = 0; decks.push(...fresh); draw.last = fresh[fresh.length - 1]?.key; show('heroes'); draw(); } });
        };
        root.querySelector('[data-back]').onclick = () => { sfx.click(); if (step > 0) { step--; chosen.pop(); draw(); } else { resolve(null); show('menu'); } };
        root.querySelector('[data-go]').onclick = () => {
          sfx.confirm();
          let d = sel;
          if (d.random) { const off = decks.filter((x) => x.official); d = off[Math.floor(Math.random() * off.length)]; }
          chosen.push(d);
          step++;
          if (step >= steps.length) resolve(chosen); else draw();
        };
      };
      paint();
    };
    show('heroes');
    draw();
  });
}

// ---------- local session (bot / hot-seat) and online host ----------
class Session {
  constructor({ players, controllers, me, hotseat = false, remote = null }) {
    this.controllers = controllers; // ['human'|'bot'|'remote', ...]
    this.me = me;
    this.hotseat = hotseat;
    this.remote = remote;
    this.queue = [];
    this.remoteQueue = [];
    this.busy = false;
    this.cfgPlayers = players;
    this.newGame();
  }
  newGame() {
    const autoPass = [false, false];
    this.controllers.forEach((c, i) => { if (c === 'human' && opt.autopass) autoPass[i] = true; });
    const seed = (Math.random() * 2 ** 31) | 0;
    this.game = new Game({ seed, players: this.cfgPlayers, options: { mulliganBonus: opt.bonus, autoPass, previews: true } });
    this.hook();
  }
  hook() {
    const g = this.game;
    const orig = g.emit.bind(g);
    g.emit = (type, data) => {
      const ev = orig(type, data);
      const v = this.viewFor(this.me);
      this.queue.push({ ev, view: v });
      if (this.remote) this.remoteQueue.push({ ev, view: g.view(1) });
      return ev;
    };
    // Events already emitted during construction (setup) — replay the current view.
    this.queue.push({ ev: { type: 'init' }, view: this.viewFor(this.me) });
    if (this.remote) this.remoteQueue.push({ ev: { type: 'init' }, view: g.view(1) });
  }
  viewFor(i) { return this.game.view(i); }
  attach(ui) {
    this.ui = ui;
    ui.onAgain = () => this.again();
  }
  again() {
    this.queue = []; this.remoteQueue = [];
    this.ui.destroy();
    this.newGame();
    startBoard(this);
  }
  flushRemote() {
    if (!this.remote) return;
    const q = this.game.pending;
    const batch = this.remoteQueue.splice(0);
    batch.push({ ev: { type: 'sync' }, view: this.game.view(1) });
    this.remote.send({ t: 'events', batch, pending: q && q.player === 1 ? q : null, waiting: !!q && q.player !== 1 });
  }
  async pump() {
    if (this.busy) return;
    this.busy = true;
    try {
      for (;;) {
        this.flushRemote();
        if (this.queue.length) {
          const batch = this.queue.splice(0);
          await this.ui.playEvents(batch);
          continue;
        }
        const g = this.game, q = g.pending;
        if (!q || g.s.over) { this.ui.setPending(null); break; }
        const who = this.controllers[q.player];
        if (who === 'bot') {
          const fast = q.type === 'priority' || q.type === 'draw';
          this.ui.setPending(q);
          await FX.wait(fast ? 250 : 650);
          const a = botAnswer(g, q);
          if (!g.respond(q.player, a)) g.respond(q.player, q.options[0]?.id ?? null);
          continue;
        }
        if (who === 'remote') { this.ui.setPending(q); break; }
        // Human.
        if (this.hotseat && q.player !== this.me) { await this.switchSeat(q.player); continue; }
        this.ui.render(this.viewFor(this.me));
        this.ui.setPending(q);
        break;
      }
    } finally { this.busy = false; }
  }
  async switchSeat(p) {
    this.me = p;
    this.ui.me = p;
    this.ui.setPending(null);
    await new Promise((res) => {
      const s = document.createElement('div');
      s.className = 'pass-screen';
      s.innerHTML = `<div><h2>Передайте устройство</h2><p style="font-size:22px">Сейчас решает: <b>${esc(this.game.P(p).name)}</b></p><button class="btn primary big" style="width:auto">Я готов(а)</button></div>`;
      this.ui.ui.appendChild(s);
      s.querySelector('button').addEventListener('click', () => { s.remove(); res(); });
    });
    this.ui.buildStatic();
    this.ui.els.clear();
    this.queue = [];
    this.ui.render(this.game.view(p));
  }
  answer(q, a) {
    if (!this.game.respond(q.player, a)) { sfx.error(); toast('Так нельзя'); this.ui.setPending(this.game.pending); return; }
    this.pump();
  }
  remoteAnswer(a) {
    const q = this.game.pending;
    if (!q || q.player !== 1 || this.controllers[1] !== 'remote') return;
    if (!this.game.respond(1, a)) { this.flushRemote(); return; }
    this.pump();
  }
  close() { if (this.remote) this.remote.close(); }
}

let current = null;
function startBoard(session) {
  show('game');
  const themes = ['160', '8', '33', '5', '125', '130', '116'];
  const theme = themes.includes(String(opt.board)) ? String(opt.board) : themes[Math.floor(Math.random() * themes.length)];
  const ui = new BoardUI($('#stage'), {
    me: session.me, theme,
    onAnswer: (q, a) => session.answer(q, a),
    onMenu: (force) => {
      if (force || confirm('Выйти в меню? Партия будет потеряна.')) { session.close(); ui.destroy(); current = null; show('menu'); }
    },
  });
  session.attach(ui);
  ui.noTips = session.controllers ? session.controllers[session.me] !== 'human' : false;
  ui.onEmote = (text) => { if (session.remote) session.remote.send({ t: 'emote', text }); if (session.conn) session.conn.send({ t: 'emote', text }); };
  ui.onGameEnd = (winner, view, played) => {
    if (session.controllers && session.controllers[session.me] !== 'human') return; // bot vs bot
    if (session.hotseat) return;
    const me = session.me, P = view.players;
    recordGame({
      mode: session.remote || session.conn ? 'online' : 'bot',
      myLeader: P[me].leader.id, oppLeader: P[1 - me].leader.id, oppName: P[1 - me].name,
      result: winner === 'draw' ? 'draw' : winner === me ? 'win' : 'loss', rounds: view.round, played,
    });
    // World ranking (draws are not sent).
    if (winner !== 'draw') {
      const titleOf = (i) => session.cfgPlayers?.[i]?.title || Object.values(DECKS).find((d) => d.leader === P[i].leader.id)?.title || CARDS[P[i].leader.id]?.name;
      submitResult({ name: myName(), deck: titleOf(me), leader: P[me].leader.id, oppName: P[1 - me].name, oppDeck: titleOf(1 - me),
        mode: session.remote || session.conn ? 'online' : 'bot', won: winner === me, rounds: view.round });
    }
  };
  const wire = () => {
    const spd = $('#btn-speed'), snd = $('#btn-sound'), fst = $('#btn-fast'), mus = $('#btn-music');
    const ap = () => session.game?.cfg.options.autoPass;
    const drawFast = () => { const on = ap() ? !ap()[session.me] : !session.autoPass; fst.style.opacity = on ? '1' : '.4'; };
    fst.onclick = () => {
      if (!session.game && session.conn) { session.autoPass = !session.autoPass; session.conn.send({ t: 'autopass', on: session.autoPass }); drawFast(); toast(session.autoPass ? 'Авто-пас включён: игра не будет спрашивать про Опережение' : 'Игра будет предлагать Опережение', 1800); return; }
      const a = ap(); if (!a) return;
      a[session.me] = !a[session.me];
      opt.autopass = a[session.me]; store.set('autopass', opt.autopass); $('#opt-autopass').checked = opt.autopass;
      drawFast(); toast(a[session.me] ? 'Авто-пас включён: игра не будет спрашивать про Опережение' : 'Игра будет предлагать сыграть Опережение', 1800);
      const q = session.game?.pending;
      if (a[session.me] && q && q.type === 'priority' && q.player === session.me) session.answer(q, 'pass');
    };
    drawFast();
    const speeds = [1, 1.6, 2.5];
    const spdTxt = () => { spd.textContent = `⏩ Скорость: ×${opt.speed}`; };
    spdTxt();
    spd.onclick = () => { opt.speed = speeds[(speeds.indexOf(opt.speed) + 1) % speeds.length] || 1; FX.setSpeed(opt.speed); store.set('speed', opt.speed); spdTxt(); };
    const musTxt = () => { mus.textContent = `🎵 Музыка: ${opt.music ? 'вкл' : 'выкл'}`; };
    musTxt();
    mus.onclick = () => { opt.music = !opt.music; setMusic(opt.music); store.set('music', opt.music); musTxt(); $('#opt-music').checked = opt.music; };
    const sndTxt = () => { snd.textContent = `${opt.sound ? '🔊' : '🔇'} Звук: ${opt.sound ? 'вкл' : 'выкл'}`; };
    sndTxt();
    snd.onclick = () => { opt.sound = !opt.sound; setSound(opt.sound); store.set('sound', opt.sound); sndTxt(); $('#opt-sound').checked = opt.sound; };
  };
  wire();
  ui.onRebuild = wire;
  current = session;
  window.__session = session;
  session.pump();
}
const playerCfg = (d, name) => ({ name, leader: d.leader, deck: d.cards, title: d.title });

async function startBot() {
  const r = await pickDecks([{ title: 'Ваша колода' }, { title: 'Колода компьютера', allowRandom: true }]);
  if (!r) return;
  const [mine, bot] = r;
  const s = new Session({ players: [playerCfg(mine, myName()), playerCfg(bot, `Компьютер (${bot.title})`)], controllers: ['human', 'bot'], me: 0 });
  startBoard(s);
}
async function startHotseat() {
  const r = await pickDecks([{ title: 'Колода игрока 1' }, { title: 'Колода игрока 2' }]);
  if (!r) return;
  const s = new Session({ players: [playerCfg(r[0], 'Игрок 1'), playerCfg(r[1], 'Игрок 2')], controllers: ['human', 'human'], me: 0, hotseat: true });
  startBoard(s);
}

// ---------- online ----------
async function startHost() {
  const r = await pickDecks([{ title: 'Ваша колода — затем отправьте ссылку другу', goLabel: 'Создать комнату' }]);
  if (!r) return;
  const mine = r[0];
  show('picker');
  $('#picker-title').textContent = 'Комната создаётся…';
  $('#picker-list').innerHTML = '';
  const ob = $('#picker-online'); ob.classList.remove('hidden');
  ob.innerHTML = 'Подключаемся к серверу встреч…';
  $('#picker-go').disabled = true;
  let session = null;
  const room = hostRoom({
    onOpen(code) {
      const url = `${location.origin}${location.pathname}?join=${code}`;
      $('#picker-title').textContent = 'Ждём друга';
      ob.innerHTML = `Отправьте другу эту ссылку. Игра начнётся, как только он откроет её и выберет колоду.
        <div class="link"><input readonly value="${url}"><button class="btn small" id="copy-link">Копировать</button>${navigator.share ? '<button class="btn small" id="share-link">Поделиться</button>' : ''}</div>
        <p style="color:var(--ink-dim);font-size:15px;margin:10px 0 0">Код комнаты: <b>${code}</b>. Не закрывайте эту вкладку.</p>`;
      $('#copy-link').onclick = () => { navigator.clipboard?.writeText(url).then(() => toast('Ссылка скопирована')); };
      $('#share-link') && ($('#share-link').onclick = () => navigator.share({ title: 'Карточные битвы ПЧК', text: 'Сыграем в Карточные битвы?', url }));
    },
    onGuest(conn, hello) {
      if (session) { // reconnect
        session.remoteQueue = [];
        room.send({ t: 'sync', view: session.game.view(1), pending: session.game.pending?.player === 1 ? session.game.pending : null, me: 1 });
        toast('Друг переподключился');
        return;
      }
      const guestDeck = { leader: hello.deck.leader, cards: hello.deck.cards, title: String(hello.deck.title || '').slice(0, 40) };
      if (!validDeck(guestDeck)) { room.send({ t: 'error', text: 'Колода не подходит' }); return; }
      session = new Session({ players: [playerCfg(mine, myName()), playerCfg(guestDeck, hello.name || 'Друг')], controllers: ['human', 'remote'], me: 0, remote: room });
      room.send({ t: 'start', me: 1 });
      startBoard(session);
    },
    onMessage(msg) {
      if (!session) return;
      if (msg.t === 'answer') session.remoteAnswer(msg.a);
      if (msg.t === 'emote' && session.ui) session.ui.showEmote(1, String(msg.text).slice(0, 160));
      if (msg.t === 'autopass') { session.game.cfg.options.autoPass[1] = !!msg.on; const q = session.game.pending; if (msg.on && q && q.player === 1 && q.type === 'priority') session.remoteAnswer('pass'); }
    },
    onClose() { toast('Друг отключился. Ждём переподключения по той же ссылке…', 5000); },
    onError(e) { ob.innerHTML = `Ошибка соединения: ${esc(e.type || e.message || e)}. Попробуйте ещё раз.`; },
  });
  $('#picker').querySelector('[data-act=back]').onclick = () => { room.close(); show('menu'); };
}
function validDeck(d) {
  if (!d || !CARDS[d.leader] || CARDS[d.leader].type !== 'leader') return false;
  if (!Array.isArray(d.cards) || d.cards.length < 40 || d.cards.length > 80) return false;
  const cnt = {};
  for (const id of d.cards) { if (!CARDS[id] || CARDS[id].type === 'leader') return false; cnt[id] = (cnt[id] || 0) + 1; if (cnt[id] > 3) return false; }
  return true;
}

class GuestSession {
  constructor(conn) { this.conn = conn; this.me = 1; this.chain = Promise.resolve(); }
  attach(ui) { this.ui = ui; ui.onAgain = () => toast('Новую партию запускает создатель комнаты'); }
  pump() {}
  answer(q, a) { this.conn.send({ t: 'answer', a }); }
  onMessage(msg) {
    if (msg.t === 'events') {
      this.chain = this.chain.then(async () => {
        this.ui.setPending(null);
        await this.ui.playEvents(msg.batch);
        if (msg.pending) this.ui.setPending(msg.pending);
        else if (msg.waiting) this.ui.setPending({ player: 0, type: 'wait', options: [] });
      });
    } else if (msg.t === 'emote') {
      this.ui?.showEmote(0, String(msg.text).slice(0, 160));
    } else if (msg.t === 'sync') {
      this.chain = this.chain.then(() => { this.ui.render(msg.view); this.ui.setPending(msg.pending); });
    }
  }
  close() { this.conn.close(); }
}
async function startJoin(code) {
  const r = await pickDecks([{ title: 'Выберите колоду для игры с другом', goLabel: 'Подключиться' }]);
  if (!r) return;
  const d = r[0];
  show('picker');
  $('#picker-title').textContent = 'Подключаемся…';
  $('#picker-list').innerHTML = '';
  const ob = $('#picker-online'); ob.classList.remove('hidden'); ob.textContent = 'Соединяемся с другом…';
  let gs = null;
  const conn = joinRoom(code, { name: myName(), deck: { leader: d.leader, cards: d.cards, title: d.title } }, {
    onOpen() { ob.textContent = 'Соединено! Ждём начала…'; },
    onMessage(msg) {
      if (msg.t === 'start' || (msg.t === 'sync' && !gs)) {
        if (!gs) { gs = new GuestSession(conn); startBoard(gs); }
        if (msg.t === 'sync') gs.onMessage(msg);
      } else if (msg.t === 'busy') { ob.textContent = 'В этой комнате уже идёт игра.'; }
      else if (msg.t === 'error') { ob.textContent = msg.text; }
      else if (gs) gs.onMessage(msg);
    },
    onClose() { toast('Соединение с хозяином комнаты потеряно', 5000); },
    onError(e) { ob.textContent = `Не удалось подключиться (${e.type || e.message || e}). Проверьте ссылку или попросите друга создать комнату заново.`; },
  });
  $('#picker').querySelector('[data-act=back]').onclick = () => { conn.close(); show('menu'); };
}

// ---------- deck builder ----------
function openBuilder({ startNew = false, back = () => show('menu') } = {}) {
  renderBuilder($('#builder'), store, back, {
    startNew,
    onPlay: (deck) => {
      const bots = Object.values(DECKS);
      const bot = bots[Math.floor(Math.random() * bots.length)];
      startBoard(new Session({ players: [playerCfg(deck, myName()), playerCfg({ leader: bot.leader, cards: bot.main }, `Компьютер (${bot.title})`)], controllers: ['human', 'bot'], me: 0 }));
    },
  });
  show('builder');
}

// ---------- tutorial ----------
function openTutorial() {
  showTutorial(() => {
    try { localStorage.removeItem('pchk_tips'); } catch { /* ignore */ }
    const mk = (d, n) => ({ name: n, leader: d.leader, deck: d.main });
    startBoard(new Session({ players: [mk(DECKS.sfinkteirion, myName()), mk(DECKS.larisa, 'Учебный бот')], controllers: ['human', 'bot'], me: 0 }));
  });
}
// First visit: offer the tutorial once (after the splash).
$('#splash').addEventListener('click', () => {
  if (store.get('tutOffered', false) || new URLSearchParams(location.search).get('join')) return;
  store.set('tutOffered', true);
  setTimeout(() => {
    const b = document.createElement('div');
    b.className = 'modal-back'; b.style.cssText = 'position:fixed;inset:0;z-index:400';
    b.innerHTML = `<div class="modal" style="max-width:520px"><h3>Впервые в «Карточных битвах»?</h3><p style="font-size:18px;line-height:1.45">Короткое обучение за 2 минуты покажет, как ходить, сражаться и отвечать «Опережением». Потом можно сыграть учебную партию с подсказками.</p><div class="row-btns"><button class="btn primary" data-y>🎓 Пройти обучение</button><button class="btn" data-n>Я уже умею</button></div></div>`;
    document.body.appendChild(b);
    b.querySelector('[data-y]').onclick = () => { b.remove(); openTutorial(); };
    b.querySelector('[data-n]').onclick = () => b.remove();
  }, 700);
});

// Test shortcut: ?screen=menu opens a screen directly.
const screenParam = new URLSearchParams(location.search).get('screen');
if (screenParam) show(screenParam);
// ---------- quick start for testing: ?quick=deckA,deckB ----------
const quick = new URLSearchParams(location.search).get('quick');
if (quick) {
  const [a, b] = quick.split(',');
  const da = DECKS[a] || DECKS.sfinkteirion, db = DECKS[b] || DECKS.larisa;
  const mk = (d, n) => ({ name: n, leader: d.leader, deck: d.main });
  const auto = new URLSearchParams(location.search).get('auto');
  startBoard(new Session({ players: [mk(da, auto ? 'Бот 1' : myName()), mk(db, 'Компьютер')], controllers: [auto ? 'bot' : 'human', 'bot'], me: 0 }));
}

// ---------- menu wiring ----------
const joinCode = new URLSearchParams(location.search).get('join');
if (joinCode) {
  const jb = $('#join-banner');
  jb.classList.remove('hidden');
  jb.innerHTML = `Вас пригласили в игру! <button class="btn primary" style="margin-left:8px">Присоединиться</button>`;
  jb.querySelector('button').addEventListener('click', () => { sfx.click(); startJoin(joinCode); });
}
document.querySelectorAll('#menu [data-act]').forEach((b) => b.addEventListener('click', () => {
  sfx.click();
  const a = b.dataset.act;
  if (a === 'bot') startBot();
  else if (a === 'hotseat') startHotseat();
  else if (a === 'host') startHost();
  else if (a === 'rules') { renderRules($('#rules'), () => show('menu')); show('rules'); }
  else if (a === 'tutorial') openTutorial();
  else if (a === 'stats' || a === 'ranking') {
    renderStats($('#stats'), () => show('menu'), { tab: a === 'ranking' ? 'world' : 'mine', name: () => opt.name, setName: (v) => { opt.name = v; store.set('name', v); $('#opt-name').value = v; } });
    show('stats');
  }
  else if (a === 'decks') openBuilder();
}));
window.addEventListener('beforeunload', (e) => { if (current && !current.game?.s.over) { e.preventDefault(); e.returnValue = ''; } });
