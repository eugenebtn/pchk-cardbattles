// App shell: menu, deck choice, game sessions (bot, hot-seat, online host/guest), builder, rules.
import { playIntro, introDone, preloadIntro } from './ui/intro.js';
import { Game } from './engine/game.js';
import { botAnswer, randomAnswer } from './engine/bot.js';
import { checkAchievements } from './ui/achievements.js';
import { createChat, cleanChat } from './ui/watch.js';
import { createCoach } from './ui/coach.js';
import { autoReport } from './ui/feedback.js';
import { saveReplay, loadReplays, replayLink, readReplayParam } from './ui/replay.js';
import { checkDaily, dailyState } from './ui/daily.js';
import { levelAnswer, LEVEL_RU, adaptiveLevel, adaptiveAfterGame } from './engine/botlevels.js';
import { CARDS } from './data/cards.js';
import { DECKS } from './data/decks.js';
import { BoardUI, esc } from './ui/board.js';
import { sfx, setSound, setMusic, playMusic, unlockAudio, setVolumes, playAmbient, voiceSoon } from './ui/sound.js';
import * as FX from './ui/fx.js';
import { hostRoom, joinRoom } from './net/online.js';
import { serverOn, newRoomCode, connectRoom, findMatch, connectTour } from './net/server.js';
import { FEATURES } from './features.js';
import { renderRules } from './ui/rules.js';
import { renderBuilder, loadCustomDecks } from './ui/builder.js';
import { installTooltips, linkTerms } from './ui/glossary.js';
import { renderStats, recordGame, loadGames, loginDialog } from './ui/stats.js';
import { unlocked, ACH } from './ui/achievements.js';
import { currentUser } from './net/account.js';
import { submitResult, loadPlayers, playerId } from './net/ranking.js';
import { openFeedback } from './ui/feedback.js';
import { renderLegal } from './ui/legal.js';
import { showTutorial } from './ui/tutorial.js';
installTooltips();

const $ = (s, r = document) => r.querySelector(s);
const store = {
  get(k, d) { try { const v = localStorage.getItem('pchk_' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('pchk_' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};

// ---------- screens ----------
function show(id) {
  document.querySelectorAll('.screen').forEach((s) => {
    const on = s.id === id;
    if (on && !s.classList.contains('active')) { s.classList.remove('screen-in'); void s.offsetWidth; s.classList.add('screen-in'); }
    s.classList.toggle('active', on);
  });
  FX.ambient(id === 'game');
  $('#scene').classList.toggle('off', id === 'game');
  if (audioStarted) playMusic(id === 'game' ? 'musicGame' : 'musicMenu'); // a game starts calm; board.js raises it to tavern and battle
  if (id === 'menu') try { drawMenuTop(); } catch (e) { console.warn(e); }
}
function toast(text, ms = 3000) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

// ---------- settings ----------
const opt = {
  sound: store.get('sound', true), bonus: store.get('bonus', false), coach: store.get('coach', true), timer: store.get('timer', 0),
  botLevel: ['auto', 'novice', 'normal', 'strong'].includes(store.get('botLevel', 'auto')) ? store.get('botLevel', 'auto') : 'auto',
  // Old versions saved true/false; false (the old «ask») becomes the new default «only when aimed at me».
  autopass: (() => { const v = store.get('autopass', 'smart'); return v === true ? true : v === 'always' ? 'always' : 'smart'; })(),
  name: store.get('name', ''), speed: store.get('speed', 1), music: store.get('music', true), board: store.get('board', 'random'),
};
setSound(opt.sound); setMusic(opt.music); FX.setSpeed(opt.speed);
// Volume sliders: music, game sounds, interface clicks (saved in this browser).
const vol = { music: 1, sfx: 1, ui: 1, ...store.get('vol', {}) };
setVolumes(vol);
document.querySelectorAll('[data-vol]').forEach((r) => {
  r.value = Math.round((vol[r.dataset.vol] ?? 1) * 100);
  r.addEventListener('input', () => { vol[r.dataset.vol] = r.value / 100; setVolumes(vol); store.set('vol', vol); });
  r.addEventListener('change', () => { if (r.dataset.vol === 'ui') sfx.click(); if (r.dataset.vol === 'sfx') sfx.hit(3); });
});
$('#opt-music').checked = opt.music;
$('#opt-music').addEventListener('change', (e) => { opt.music = e.target.checked; setMusic(opt.music); store.set('music', opt.music); });
// Quick sound window (speaker button in the menu bar and in a game): sound and music on/off, three volume sliders.
function soundBtnState() { document.querySelectorAll('.snd-btn').forEach((b) => b.classList.toggle('muted', !opt.sound)); }
function openSoundPop(anchor) {
  document.querySelector('.snd-pop')?.remove();
  const p = document.createElement('div');
  p.className = 'snd-pop';
  const row = (k, label) => `<label><span>${label}</span><input type="range" min="0" max="100" value="${Math.round((vol[k] ?? 1) * 100)}" data-k="${k}"></label>`;
  p.innerHTML = `<div class="snd-tg"><button class="btn small ${opt.sound ? 'primary' : ''}" data-t="sound">${opt.sound ? '🔊 Звук включён' : '🔇 Звук выключен'}</button>
    <button class="btn small ${opt.music ? 'primary' : ''}" data-t="music">${opt.music ? '🎵 Музыка вкл.' : '🎵 Музыка выкл.'}</button></div>
    ${row('music', 'Музыка')}${row('sfx', 'Звуки игры')}${row('ui', 'Кнопки')}`;
  document.body.appendChild(p);
  const r = anchor.getBoundingClientRect();
  p.style.top = Math.min(window.innerHeight - p.offsetHeight - 8, r.bottom + 8) + 'px';
  p.style.left = Math.max(8, Math.min(window.innerWidth - p.offsetWidth - 8, r.right - p.offsetWidth)) + 'px';
  p.querySelector('[data-t=sound]').onclick = () => { opt.sound = !opt.sound; setSound(opt.sound); store.set('sound', opt.sound); $('#opt-sound').checked = opt.sound; soundBtnState(); openSoundPop(anchor); };
  p.querySelector('[data-t=music]').onclick = () => { opt.music = !opt.music; setMusic(opt.music); store.set('music', opt.music); $('#opt-music').checked = opt.music; openSoundPop(anchor); };
  p.querySelectorAll('input[data-k]').forEach((inp) => {
    inp.oninput = () => { vol[inp.dataset.k] = inp.value / 100; setVolumes(vol); store.set('vol', vol); document.querySelectorAll(`[data-vol="${inp.dataset.k}"]`).forEach((x) => { x.value = inp.value; }); };
    inp.onchange = () => { if (inp.dataset.k === 'ui') sfx.click(); if (inp.dataset.k === 'sfx') sfx.hit(3); };
  });
  setTimeout(() => document.addEventListener('pointerdown', function off(e) { if (!p.contains(e.target) && e.target !== anchor) { p.remove(); document.removeEventListener('pointerdown', off, true); } }, true), 0);
}
document.querySelector('#menu [data-snd]')?.addEventListener('click', (e) => openSoundPop(e.currentTarget));
// Browsers allow sound only after the first click.
let audioStarted = false;
document.addEventListener('pointerdown', () => {
  if (audioStarted) return;
  audioStarted = true; unlockAudio();
  playMusic(document.querySelector('#game').classList.contains('active') ? 'musicGame' : 'musicMenu');
}, { capture: true });
$('#opt-sound').checked = opt.sound;
$('#opt-bonus').checked = opt.bonus;
$('#opt-autopass').value = opt.autopass === true ? 'never' : opt.autopass;
$('#opt-coach').checked = !!opt.coach;
$('#opt-timer').value = String(opt.timer || 0);
$('#opt-timer').addEventListener('change', (e) => { opt.timer = Number(e.target.value) || 0; store.set('timer', opt.timer); });
$('#opt-coach').addEventListener('change', (e) => { opt.coach = e.target.checked; store.set('coach', opt.coach); });
$('#opt-name').value = opt.name;
$('#opt-board').value = opt.board;
$('#opt-board').addEventListener('change', (e) => { opt.board = e.target.value; store.set('board', opt.board); });
$('#opt-sound').addEventListener('change', (e) => { opt.sound = e.target.checked; setSound(opt.sound); store.set('sound', opt.sound); soundBtnState(); });
soundBtnState();
$('#opt-bonus').addEventListener('change', (e) => { opt.bonus = e.target.checked; store.set('bonus', opt.bonus); });
$('#opt-autopass').addEventListener('change', (e) => { opt.autopass = e.target.value === 'never' ? true : e.target.value; store.set('autopass', opt.autopass); });
$('#opt-name').addEventListener('input', (e) => { opt.name = e.target.value.trim(); store.set('name', opt.name); });
const myName = () => opt.name || 'Игрок';

// Preload only what is needed: the Leaders now, the two decks of a game when it starts (saves ~10 MB on phones).
const preloaded = new Set();
const preload = (ids) => { for (const id of ids) { const img = CARDS[id]?.img; if (img && !preloaded.has(img)) { preloaded.add(img); const i = new Image(); i.src = img; } } };
setTimeout(() => preload([20, 41, 62, 63, 117, 118]), 300);

// ---------- scene behind the splash, menu and hero select: velvet, leader art slices, a fan of leader cards ----------
const LEADER_IDS = [62, 117, 41, 20, 118, 63];
(function scene() {
  $('#scene-slices').innerHTML = [20, 41, 63, 62, 117, 118].map((id) => `<div class="sl" style="background-image:url('assets/leaders/${id}.webp')"></div>`).join('');
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
// Opening clip (for now only with ?intro=studio in the address, until it is approved): plays over the menu while Lionheart greets.
const INTRO = new URLSearchParams(location.search).get('intro');
if (INTRO === 'studio') { document.body.classList.add('studio'); preloadIntro('studio'); }
$('#splash').addEventListener('click', () => {
  sfx.confirm(); show('menu');
  if (INTRO) { playIntro(INTRO); setTimeout(() => voiceSoon(20, 'Hello'), 1400); } else setTimeout(() => voiceSoon(20, 'Hello'), 900); // Lionheart greets the guest
});
$('#menu [data-act=settings]')?.addEventListener('click', () => { $('#menu-opts').classList.toggle('hidden'); });

/** Copies text to the clipboard. The modern API works only on https; on http (or if it is refused) an old-style copy
 *  through a hidden text field is used, and as a last resort the link is shown in a window to copy by hand. */
async function copyText(text, msg = 'Ссылка скопирована') {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); toast(msg); return true; } } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy'); ta.remove();
    if (ok) { toast(msg); return true; }
  } catch { /* fall through */ }
  window.prompt('Скопируйте ссылку:', text);
  return false;
}
// ---------- decks ----------
// What each Leader does, in plain words for a first game, and how hard the deck is to play.
// Where the face is on each Leader card (for round portraits).
const FOCUS = { 20: '37% 30%', 41: '31% 30%', 62: '36% 24%', 63: '40% 22%', 117: '35% 32%', 118: '34% 27%' };
// The Leader's painting alone, large and cleaned up (tools/enhance-cards.py); the face sits at the same x as on the card.
const art = (id) => `assets/leaders/${id}.webp`;
const face = (id) => `assets/leaders/face/${id}.webp`; // square, the face in the middle (round portraits)
const artFocus = (id) => (FOCUS[id] || '50%').split(' ')[0] + ' 40%';
const DIFF_RU = { 1: '★ Просто — для первой партии', 2: '★★ Средне', 3: '★★★ Сложно — для опытных' };
const LEADER_PLAIN = {
  20: { d: 1, t: ['Каждый ход получает +2 монеты', 'За 2 монеты делает союзника сильнее на +1/+1 — даже в ход соперника'] },
  41: { d: 2, t: ['В начале каждого боя призывает крысу 1/1', 'Первая карта за ход дешевле на 1 монету за каждое ваше Животное'] },
  62: { d: 3, t: ['Показывайте карты Вампиров из руки — копится кровь 🩸', 'Кровью платите за свойства Вампиров; за 4 🩸 — две Челюсти 1/1'] },
  63: { d: 2, t: ['За 3 монеты наносит 2 раны врагу — даже в ход соперника', 'Кровь 🩸 меняет на новую карту или на монету'] },
  117: { d: 3, t: ['Может сыграть карту в ход соперника — по одной за фазу', 'Его союзники, ранив вражеского Лидера, становятся сильнее'] },
  118: { d: 1, t: ['Каждый ход либо берёт карту, либо лечит себе 2 раны', 'Карты Природы стоят на 1 монету дешевле'] },
};
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
      // The opponent's step starts on «Случайный» (not on the deck you just took); each step remembers its own pick.
      draw.byStep = draw.byStep || {};
      let sel = list.find((d) => d.key === draw.byStep[step]) || (st.allowRandom ? list[0] : list.find((d) => d.key === (draw.last || '')) || list[0]);
      const paint = () => {
        const L = sel.random ? null : CARDS[sel.leader];
        root.innerHTML = `<div class="hero-select">
          ${steps.length > 1 ? `<div class="hs-step s${step}">Шаг ${step + 1} из ${steps.length}</div>` : ''}
          <div class="hs-title">${esc(st.title)}</div>
          ${chosen.length ? `<div class="hs-chosen">${chosen.map((c, k) => `<span><i class="la" style="background-image:url('${face(c.leader)}')"></i>${k === 0 ? 'Ваш выбор' : 'Выбор ' + (k + 1)}: <b>${esc(c.title)}</b> ✓</span>`).join('')}</div>` : ''}
          <div class="hs-main">
            <div class="hs-portrait art la" style="background-image:url('${art(L ? sel.leader : 63)}')${sel.random ? ';filter:brightness(.35) blur(2px)' : `;background-position:${artFocus(sel.leader)}`}">${L ? `<div class="hs-port-name">${esc(L.name.split(',')[0])}</div>` : ''}${sel.random ? '<div style="position:absolute;inset:0;display:grid;place-items:center;font-size:120px;filter:none">🎲</div>' : ''}</div>
            <div class="hs-info">
              <div class="hs-name">${esc(sel.random ? 'Случайный соперник' : L.name)}</div>
              <div class="hs-sub">${sel.random ? 'Компьютер возьмёт любую стартовую колоду' : `${esc(sel.title)} · ${sel.official ? 'стартовая скрижаль' : 'своя колода'} · ${sel.cards.length} карт`}</div>
              ${L ? `<div class="hs-row"><div class="hs-hp" data-tip="Здоровье Лидера|Если упадёт до 0 — поражение.">❤️ ${L.hp}</div>${LEADER_PLAIN[sel.leader] ? `<div class="hs-diff d${LEADER_PLAIN[sel.leader].d}">${DIFF_RU[LEADER_PLAIN[sel.leader].d]}</div>` : ''}</div>
              <div class="hs-style">${esc(DECK_STYLE[sel.deckKey] || 'Ваша собственная скрижаль.')}</div>
              ${LEADER_PLAIN[sel.leader] ? `<ul class="hs-plain">${LEADER_PLAIN[sel.leader].t.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
              ${(() => { const key = [...new Set(sel.cards)].map((id) => CARDS[id]).filter((c) => c && c.img && typeof c.cost === 'number').sort((a, b) => b.cost - a.cost).slice(0, 4); return key.length ? `<div class="hs-keys"><span>Сильные карты колоды:</span>${key.map((c) => `<i style="background-image:url('${c.img}')" data-tip="${esc(c.name)}|${esc((c.text || '').split('\n').slice(0, 2).join(' '))}"></i>`).join('')}</div>` : ''; })()}
              <details class="hs-more"><summary>Подробнее: точный текст карты</summary><div class="hs-ability">${linkTerms(esc(L.text)).replace(/\n/g, '<br>')}</div></details>` : ''}
            </div>
          </div>
          <div class="hs-roster"><div class="hs-medal newdeck" data-new><div class="m">＋</div>Своя колода<div class="tag">собрать</div></div>${list.map((d) => `<div class="hs-medal ${d === sel ? 'sel' : ''} ${d.random ? 'random' : ''}" data-key="${d.key}">
            <div class="m ${d.random ? '' : 'la'}" ${d.random ? '' : `style="background-image:url('${face(d.leader)}')"`}>${d.random ? '🎲' : ''}</div>
            ${esc(d.random ? 'Случайный' : d.title)}${!d.random && !d.official ? '<div class="tag">своя</div>' : ''}</div>`).join('')}</div>
          ${st.level ? `<div class="hs-level"><span>Сложность:</span>${['auto', 'novice', 'normal', 'strong'].map((l) => `<button class="hs-lv ${opt.botLevel === l ? 'on' : ''}" data-lv="${l}">${l === 'auto' ? `Подстраиваться <small>сейчас: ${LEVEL_RU[adaptiveLevel()]}</small>` : LEVEL_RU[l]}</button>`).join('')}<div class="hs-lv-help">${esc(LEVEL_HELP[opt.botLevel])}</div></div>` : ''}
          <div class="hs-bar"><button class="btn" data-back>← Назад</button><button class="btn hs-go" data-go>${esc(step === steps.length - 1 ? (st.goLabel || 'В бой!') : 'Далее')}</button></div>
        </div>`;
        root.querySelectorAll('.hs-medal').forEach((m) => m.addEventListener('click', () => {
          const d = list.find((x) => x.key === m.dataset.key);
          if (!d || d === sel) return; // «＋ Своя колода» has its own handler
          sel = d; draw.last = d.key; draw.byStep[step] = d.key; sfx.select(); sfx.reveal(); paint();
        }));
        root.querySelectorAll('[data-lv]').forEach((b) => b.addEventListener('click', () => { sfx.select(); opt.botLevel = b.dataset.lv; store.set('botLevel', opt.botLevel); paint(); }));
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
          if (step >= steps.length) { resolve(chosen); return; }
          // A short pause that shows the choice was taken, then the next step slides in.
          const box = root.querySelector('.hero-select');
          box.classList.add('picked');
          box.insertAdjacentHTML('beforeend', `<div class="hs-picked"><div class="hs-picked-in"><i class="la" style="background-image:url('${face(d.leader)}')"></i><span>Выбрано: <b>${esc(d.title)}</b></span><small>Теперь: ${esc(steps[step].title)}</small></div></div>`);
          root.querySelectorAll('button').forEach((b) => { b.disabled = true; });
          setTimeout(() => { draw(); root.querySelector('.hero-select')?.classList.add('step-in'); }, 1300);
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
    this.watchQueue = []; // what watchers see: both hands hidden
    this.undoMarks = [];
    this.busy = false;
    this.cfgPlayers = players;
    this.newGame();
  }
  newGame() {
    const autoPass = [false, false];
    this.controllers.forEach((c, i) => { if (c === 'human') autoPass[i] = AP_ENGINE(opt.autopass); });
    const seed = (Math.random() * 2 ** 31) | 0;
    this.game = new Game({ seed, players: this.cfgPlayers, options: { mulliganBonus: opt.bonus, autoPass, previews: true, fakeStops: this.controllers.includes('remote') ? [true, true] : null } });
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
      if (this.remote?.watcherCount) this.watchQueue.push({ ev, view: g.view(-1) });
      return ev;
    };
    // Events already emitted during construction (setup) — replay the current view.
    this.queue.push({ ev: { type: 'init' }, view: this.viewFor(this.me) });
    if (this.remote) this.remoteQueue.push({ ev: { type: 'init' }, view: g.view(1) });
    if (this.remote?.watcherCount) this.watchQueue.push({ ev: { type: 'init' }, view: g.view(-1) });
  }
  viewFor(i) { return this.game.view(i); }
  attach(ui) {
    this.ui = ui;
    ui.onAgain = () => this.again();
  }
  again() {
    this.queue = []; this.remoteQueue = []; this.watchQueue = []; this.undoMarks = [];
    this.ui.destroy();
    this.newGame();
    startBoard(this);
  }
  flushRemote() {
    if (!this.remote) return;
    const q = this.game.pending;
    const batch = this.remoteQueue.splice(0);
    batch.push({ ev: { type: 'sync' }, view: this.game.view(1) });
    this.remote.send({ t: 'events', batch, pending: q && q.player === 1 ? q : null, waiting: q && q.player !== 1 ? (q.type === 'priority' ? 'priority' : true) : false });
    // Watchers get the same moves with both hands hidden.
    const wb = this.watchQueue.splice(0);
    if (wb.length && this.remote.watcherCount) this.remote.sendWatchers({ t: 'events', batch: wb });
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
          this.botRespond(g, q);
          continue;
        }
        if (who === 'remote') { this.ui.setPending(q); break; }
        // Human.
        if (this.hotseat && q.player !== this.me) { await this.switchSeat(q.player); continue; }
        this.ui.render(this.viewFor(this.me));
        this.ui.setPending(q);
        break;
      }
    } catch (e) {
      // Never leave the game frozen: report and keep going.
      console.error('pump', e);
      autoReport(e, this.ui);
      setTimeout(() => this.pump(), 400);
    } finally { this.busy = false; }
  }
  /** The computer's answer. Never gets stuck: on an error or an invalid answer it tries simpler answers. */
  botRespond(g, q) {
    // The same request over and over in one phase means a loop (play → cancel → play …): take the way out.
    const key = `${q.player}|${q.type}|${q.prompt}|${g.s.phaseId}`;
    this.loopN = this.loopKey === key ? (this.loopN || 0) + 1 : 0; this.loopKey = key;
    const out = () => (q.type === 'priority' ? 'pass' : q.type === 'main' ? 'end' : null);
    if (this.loopN > 12) { for (const a of [out(), q.options?.[0]?.id]) if (g.pending === q && g.respond(q.player, a)) return; }
    const tries = [() => levelAnswer(g, q, this.botLevel || 'normal'), () => botAnswer(g, q), () => randomAnswer(g, q), () => (q.type === 'priority' ? 'pass' : q.type === 'main' ? 'end' : null), () => q.options?.[0]?.id];
    for (const t of tries) {
      let a;
      try { a = t(); } catch (e) { console.warn('bot', e); continue; }
      if (g.pending === q && g.respond(q.player, a)) return;
    }
    console.error('bot could not answer', q);
    autoReport(new Error(`Компьютер не смог ответить: ${q.type} «${q.prompt}»`), this.ui);
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
    // Remember where each of my free moves started, so it can be taken back (games against the computer).
    if (q.type === 'main' && this.canUndo) { const n = this.game.history.length; if (this.undoMarks.at(-1) !== n) this.undoMarks.push(n); }
    if (!this.game.respond(q.player, a)) { sfx.error(); toast('Так нельзя'); this.ui.setPending(this.game.pending); return; }
    this.pump();
  }
  get canUndo() { return !this.remote && !this.hotseat && this.controllers.includes('bot') && this.controllers[this.me] === 'human'; }
  /** Take back my last move: rebuild the game from its answers up to the start of that move. */
  undo() {
    if (!this.canUndo || this.busy || this.game.s.over) return false;
    const q = this.game.pending;
    if (!q || q.player !== this.me) return false;
    const marks = this.undoMarks.filter((n) => n < this.game.history.length);
    const to = marks.at(-1);
    if (to == null) { toast('Отменять пока нечего'); return false; }
    const old = this.game, hist = old.history.slice(0, to);
    const g = new Game({ ...old.cfg, seed: old.seedUsed });
    for (const a of hist) if (!g.pending || !g.respond(g.pending.player, a)) { toast('Не получилось отменить ход'); return false; }
    this.undoMarks = marks.slice(0, -1);
    this.game = g; this.queue = [];
    this.hook();
    this.ui.render(g.view(this.me));
    this.pump();
    toast('Ход отменён', 1500);
    return true;
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
// Опережение modes: 'smart' (only when aimed at me, default), 'always', true (never). The engine gets false for 'always'.
const AP_ENGINE = (m) => (m === 'always' ? false : m);
const AP_NEXT = { smart: 'always', always: true, true: 'smart' };
const AP_TOAST = { smart: 'Опережение: игра спросит, только когда соперник целится в ваши карты', always: 'Опережение: игра спрашивает при каждой возможности', true: 'Опережение выключено: игра не спрашивает' };
function startBoard(session) {
  preload((session.cfgPlayers || []).flatMap((p) => [p.leader, ...(p.deck || [])]));
  show('game');
  const themes = ['160', '8', '33', '5', '125', '130', '116'];
  const urlBoard = new URLSearchParams(location.search).get('board'); // fixed field for screenshots
  const theme = themes.includes(urlBoard) ? urlBoard : themes.includes(String(opt.board)) ? String(opt.board) : themes[Math.floor(Math.random() * themes.length)];
  // Dark fields (Подземный тайник, Пороховой склад) get a quiet dungeon background under the music.
  if (['125', '33'].includes(theme)) setTimeout(() => playAmbient('ambDungeon'), 1500);
  const ui = new BoardUI($('#stage'), {
    me: session.me, theme,
    onAnswer: (q, a) => session.answer(q, a),
    onMenu: (force) => {
      if (force || session.watch || confirm('Выйти в меню? Партия будет потеряна.')) { session.close(); ui.chat?.destroy(); ui.coach?.destroy(); ui.destroy(); current = null; show('menu'); }
    },
  });
  session.attach(ui);
  ui.noTips = !!session.watch || (session.controllers ? session.controllers[session.me] !== 'human' : false);
  ui.spectator = !!session.watch || (!!session.controllers && !session.controllers.includes('human') && !session.controllers.includes('remote'));
  ui.onFeedback = () => openFeedback({ ui, name: opt.name });
  ui.toast = toast;
  ui.onEmote = (text) => {
    if (session.remote) { session.remote.send({ t: 'emote', text }); session.remote.sendWatchers({ t: 'emote', side: session.me, text }); }
    if (session.conn) session.conn.send({ t: 'emote', text });
  };
  if (session.canUndo) ui.onUndo = () => session.undo();
  if (session.tour) ui.onAgain = () => { session.close(); ui.chat?.destroy(); ui.destroy(); current = null; drawTour(); };
  if (session.game && !session.replay && !session.watch) ui.onReplay = () => { const r = loadReplays().at(-1); session.close?.(); ui.chat?.destroy(); ui.coach?.destroy(); ui.destroy(); startReplay(r); };
  // Move coach: the learning game points at the best move; other local games show a «Совет» line (can be turned off).
  if (session.game && !ui.spectator && session.controllers?.[session.me] === 'human' && !session.hotseat) {
    const mode = session.coachMode || (opt.coach ? 'hint' : 'off');
    if (mode !== 'off') {
      ui.coach = createCoach(ui, () => session.game, mode);
      const orig = ui.setPending.bind(ui);
      ui.setPending = (q) => { orig(q); ui.coach?.update(q); };
    }
  }
  // Online games: a watchers' badge and their comments for players; the full chat for watchers.
  if (session.watch && !session.replay) {
    ui.chat = createChat({ watcher: true, onSend: (text) => { session.conn.send({ t: 'chat', name: myName() || 'Зритель', text }); ui.chat.add(myName() || 'Вы', text, true); } });
  } else if (session.remote || session.conn) ui.chat = createChat({ watcher: false });
  if (session.inviteCode || session.code) { ui.onInviteWatchers = () => inviteWatchers(session.inviteCode || session.code, !!session.server); document.querySelector('#btn-watch')?.classList.remove('hidden'); }
  ui.onRanking = () => { ui.onMenu(true); document.querySelector('#menu [data-act="ranking"]')?.click(); };
  ui.onGameEnd = (winner, view, played) => {
    if (session.watch || (session.controllers && session.controllers[session.me] !== 'human')) { ui.noRank = true; return; } // watchers, bot vs bot
    if (session.hotseat) { ui.noRank = true; return; }
    const me = session.me, P = view.players;
    if (session.game) saveReplay(session.game, { title: `${CARDS[P[0].leader.id]?.name.split(',')[0]} — ${CARDS[P[1].leader.id]?.name.split(',')[0]}`, mode: session.remote || session.conn ? 'online' : 'bot' });
    if (session.adaptive && !session.remote && !session.conn && winner !== 'draw') {
      const was = session.botLevel, next = adaptiveAfterGame(winner === me);
      ui.levelNote = next === was ? `Следующий компьютер: ${LEVEL_RU[next]}` : `Следующий компьютер будет ${next === 'strong' || (next === 'normal' && was === 'novice') ? 'сильнее' : 'слабее'}: ${LEVEL_RU[next]}`;
    }
    recordGame({
      mode: session.remote || session.conn ? 'online' : 'bot',
      myLeader: P[me].leader.id, oppLeader: P[1 - me].leader.id, oppName: P[1 - me].name,
      result: winner === 'draw' ? 'draw' : winner === me ? 'win' : 'loss', rounds: view.round, played, level: session.botLevel || null,
    });
    try {
      const st = ui.stats || {};
      const ctx = { won: winner === me, mode: session.remote || session.conn ? 'online' : 'bot', level: session.botLevel, myLeader: P[me].leader.id, oppLeader: P[1 - me].leader.id,
        myHp: P[me].leader.hp, round: view.round, best: st.best && st.best.side === me ? st.best.amount : 0, oppKills: st.kills ? st.kills[1 - me] : 0,
        dmg: st.dmg ? st.dmg[me] : 0, face: st.face ? st.face[me] : 0, kills: st.kills ? st.kills[me] : 0, played: played || [] };
      ui.newAch = checkAchievements(ctx);
      if (checkDaily(ctx)) { const d = dailyState(); ui.newAch = [{ icon: '📜', title: 'Задание дня выполнено', text: `${d.task.text}. Дней подряд: ${d.streak}` }, ...(ui.newAch || [])]; }
      drawDaily();

    } catch (e) { console.warn(e); }
    // World ranking (draws are not sent): place and wins before and after this game, shown on the end screen.
    if (winner === 'draw') { ui.setRankInfo('<span class="ov-wait">Ничьи в мировой рейтинг не идут.</span>'); return; }
    const titleOf = (i) => session.cfgPlayers?.[i]?.title || Object.values(DECKS).find((d) => d.leader === P[i].leader.id)?.title || CARDS[P[i].leader.id]?.name;
    const mode = session.remote || session.conn ? 'online' : 'bot';
    const mine = (list) => { const k = (list || []).findIndex((x) => x.player_id === playerId()); return k < 0 ? null : { place: k + 1, wins: list[k].wins, games: list[k].games, winrate: list[k].winrate, total: list.length }; };
    (async () => {
      let before = null; try { before = mine(await loadPlayers(mode)); } catch { /* offline */ }
      // Games on the server are recorded by the server itself (honest ranking); here we only wait for it.
      const ok = session.server ? await new Promise((r) => setTimeout(() => r(true), 2500))
        : await submitResult({ name: myName(), deck: titleOf(me), leader: P[me].leader.id, oppName: P[1 - me].name, oppDeck: titleOf(1 - me), mode, won: winner === me, rounds: view.round, cards: session.cfgPlayers?.[me]?.deck });
      let after = null; if (ok) { try { after = mine(await loadPlayers(mode)); } catch { /* offline */ } }
      const where = mode === 'online' ? 'с друзьями' : 'против компьютера';
      if (!ok || !after) { ui.setRankInfo('<span class="ov-wait">Мировой рейтинг сейчас недоступен — результат сохранён в вашей статистике.</span>'); return; }
      const move = !before ? `вы вошли в рейтинг на <b>${after.place}-е место</b>` : after.place < before.place ? `вы поднялись с ${before.place}-го на <b>${after.place}-е место</b> ▲` : after.place > before.place ? `вы опустились с ${before.place}-го на <b>${after.place}-е место</b> ▼` : `вы на <b>${after.place}-м месте</b>`;
      ui.setRankInfo(`<div class="ov-rank-in"><span class="ov-rank-place">${after.place}</span><div><b>Мировой рейтинг ${where}</b><br>${move} из ${after.total}. Побед ${after.wins}${winner === me ? ' (+1)' : ''} из ${after.games}, ${after.winrate}%.</div></div>`);
    })();
  };
  const wire = () => {
    const spd = $('#btn-speed'), snd = $('#btn-sound'), fst = $('#btn-fast'), mus = $('#btn-music');
    const vb = $('#btn-vol'); if (vb) { vb.onclick = () => openSoundPop(vb); soundBtnState(); }
    const ap = () => session.game?.cfg.options.autoPass;
    const drawFast = () => { const m = opt.autopass; fst.style.opacity = m === true ? '.4' : '1'; fst.title = AP_TOAST[m]; fst.classList.toggle('ap-always', m === 'always'); };
    fst.onclick = () => {
      opt.autopass = AP_NEXT[opt.autopass]; store.set('autopass', opt.autopass); $('#opt-autopass').value = opt.autopass === true ? 'never' : opt.autopass;
      drawFast(); toast(AP_TOAST[opt.autopass], 2200);
      if (!session.game && session.conn) { session.conn.send({ t: 'autopass', on: AP_ENGINE(opt.autopass) }); return; }
      const a = ap(); if (!a) return;
      a[session.me] = AP_ENGINE(opt.autopass);
      const q = session.game?.pending;
      if (a[session.me] === true && q && q.type === 'priority' && q.player === session.me) session.answer(q, 'pass');
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
    snd.onclick = () => { opt.sound = !opt.sound; setSound(opt.sound); store.set('sound', opt.sound); sndTxt(); $('#opt-sound').checked = opt.sound; soundBtnState(); };
  };
  wire();
  ui.onRebuild = wire;
  current = session;
  window.__session = session;
  session.pump();
}
const playerCfg = (d, name) => ({ name, leader: d.leader, deck: d.cards, title: d.title });

const LEVEL_HELP = {
  auto: 'Компьютер становится сильнее после ваших побед и слабее после поражений.',
  novice: 'Играет просто, часто ошибается и не отвечает Опережением. Для первых партий.',
  normal: 'Играет по правилам здравого смысла, иногда отвечает на ваши ходы.',
  strong: 'Перед каждым ходом просчитывает варианты до конца раунда и выбирает лучший.',
};
async function startBot() {
  const r = await pickDecks([{ title: 'Ваша колода' }, { title: 'Колода компьютера', allowRandom: true, level: true }]);
  if (!r) return;
  const [mine, bot] = r;
  const adaptive = opt.botLevel === 'auto', level = adaptive ? adaptiveLevel() : opt.botLevel;
  const s = new Session({ players: [playerCfg(mine, myName()), playerCfg(bot, `Компьютер · ${LEVEL_RU[level]}`)], controllers: ['human', 'bot'], me: 0 });
  s.botLevel = level; s.adaptive = adaptive;
  startBoard(s);
}
async function startHotseat() {
  const r = await pickDecks([{ title: 'Колода игрока 1' }, { title: 'Колода игрока 2' }]);
  if (!r) return;
  const s = new Session({ players: [playerCfg(r[0], 'Игрок 1'), playerCfg(r[1], 'Игрок 2')], controllers: ['human', 'human'], me: 0, hotseat: true });
  startBoard(s);
}

// ---------- online ----------
async function startHost(direct = false) {
  if (serverOn() && !direct) return startServerHost();
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
      $('#copy-link').onclick = () => { copyText(url); };
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
      session.game.cfg.options.autoPass[1] = hello.autopass === true ? true : hello.autopass === false ? false : 'smart';
      room.send({ t: 'start', me: 1 });
      session.inviteCode = room.code;
      startBoard(session);
      if (room.watcherCount) { room.sendWatchers({ t: 'watchStart', view: session.game.view(-1) }); session.ui?.chat?.setCount(room.watcherCount); room.send({ t: 'watchers', n: room.watcherCount }); }
    },
    onMessage(msg) {
      if (!session) return;
      if (msg.t === 'answer') session.remoteAnswer(msg.a);
      if (msg.t === 'emote' && session.ui) { session.ui.showEmote(1, String(msg.text).slice(0, 160)); room.sendWatchers({ t: 'emote', side: 1, text: String(msg.text).slice(0, 160) }); }
      if (msg.t === 'autopass') { session.game.cfg.options.autoPass[1] = msg.on === 'smart' ? 'smart' : !!msg.on; const q = session.game.pending; if (msg.on === true && q && q.player === 1 && q.type === 'priority') session.remoteAnswer('pass'); }
    },
    onClose() { toast('Друг отключился. Ждём переподключения по той же ссылке…', 5000); },
    onError(e) { ob.innerHTML = `Ошибка соединения: ${esc(e.type || e.message || e)}. Попробуйте ещё раз.`; },
    // Watchers: they get the game with both hands hidden and can comment.
    onWatcher(c, hello) {
      if (!session) { c.send({ t: 'wait' }); return; }
      c.send({ t: 'watchStart', view: session.game.view(-1) });
      c.send({ t: 'watchers', n: room.watcherCount });
      session.ui?.chat?.add('👁', `${cleanChat(hello.name, 'x').name} смотрит партию`);
    },
    onWatcherMessage(c, msg) {
      if (msg?.t !== 'chat' || !session) return;
      if (Date.now() - (c._last || 0) < 2500) return; // anti-spam
      c._last = Date.now();
      const m = cleanChat(msg.name, msg.text);
      if (!m.text) return;
      room.sendWatchers({ t: 'chat', ...m }, c);
      room.send({ t: 'chat', ...m });
      session.ui?.chat?.add(m.name, m.text);
    },
    onWatchersChange(n) { session?.ui?.chat?.setCount(n); room.send({ t: 'watchers', n }); room.sendWatchers({ t: 'watchers', n }); },
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
        else if (msg.waiting) this.ui.setPending({ player: 0, type: msg.waiting === 'priority' ? 'priority' : 'wait', options: [] });
      });
    } else if (msg.t === 'emote') {
      this.ui?.showEmote(0, String(msg.text).slice(0, 160));
    } else if (msg.t === 'chat') {
      this.ui?.chat?.add(msg.name, msg.text);
    } else if (msg.t === 'watchers') {
      this.ui?.chat?.setCount(msg.n | 0);
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
  const conn = joinRoom(code, { name: myName(), autopass: AP_ENGINE(opt.autopass), deck: { leader: d.leader, cards: d.cards, title: d.title } }, {
    onOpen() { ob.textContent = 'Соединено! Ждём начала…'; },
    onMessage(msg) {
      if (msg.t === 'start' || (msg.t === 'sync' && !gs)) {
        if (!gs) { gs = new GuestSession(conn); gs.code = code; startBoard(gs); }
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

// ---------- watching a friends' game ----------
/** The link for watchers of the current online game. */
function inviteWatchers(code, server = false) {
  const url = `${location.origin}${location.pathname}?${server ? 'watchroom' : 'watch'}=${code}`;
  const b = document.createElement('div');
  b.className = 'modal-back'; b.style.cssText = 'position:fixed;inset:0;z-index:400';
  b.innerHTML = `<div class="modal" style="max-width:560px"><h3>👁 Позвать зрителей</h3>
    <p style="font-size:17px;line-height:1.4">Отправьте эту ссылку тем, кто хочет посмотреть партию. Зрители видят поле и ходы, но <b>не видят карт в руках</b> ни у одного игрока. Они могут писать комментарии — вы увидите их слева вверху (там же их можно выключить).</p>
    <div class="link"><input readonly value="${url}" style="width:100%"></div>
    <div class="row-btns"><button class="btn primary" data-copy>Копировать ссылку</button>${navigator.share ? '<button class="btn" data-share>Поделиться</button>' : ''}<button class="btn" data-close>Закрыть</button></div></div>`;
  document.body.appendChild(b);
  b.querySelector('[data-copy]').onclick = () => copyText(url, 'Ссылка для зрителей скопирована');
  const sh = b.querySelector('[data-share]');
  if (sh) sh.onclick = () => navigator.share({ title: 'Карточные битвы ПЧК', text: 'Посмотри нашу партию!', url });
  b.querySelector('[data-close]').onclick = () => b.remove();
  b.addEventListener('click', (e) => { if (e.target === b) b.remove(); });
}
class WatchSession {
  constructor(conn) { this.conn = conn; this.watch = true; this.me = 0; this.chain = Promise.resolve(); }
  attach(ui) { this.ui = ui; ui.onAgain = () => toast('Реванш запускают игроки — вы увидите его здесь'); }
  pump() {}
  answer() {}
  onMessage(msg) {
    if (msg.t === 'events') {
      this.chain = this.chain.then(async () => {
        if (msg.batch[0]?.ev?.type === 'init') document.querySelector('#game > .over-screen')?.remove(); // a rematch
        await this.ui.playEvents(msg.batch);
      });
    } else if (msg.t === 'watchStart') {
      this.chain = this.chain.then(() => { document.querySelector('#game > .over-screen')?.remove(); this.ui.render(msg.view); this.ui.setPending(null); });
    } else if (msg.t === 'chat') this.ui?.chat?.add(msg.name, msg.text);
    else if (msg.t === 'emote') this.ui?.showEmote(msg.side ? 1 : 0, String(msg.text).slice(0, 160));
    else if (msg.t === 'watchers') this.ui?.chat?.setCount(msg.n | 0);
  }
  close() { this.conn.close(); }
}
function startWatch(code) {
  show('picker');
  $('#picker-title').textContent = 'Подключаемся к партии…';
  $('#picker-list').innerHTML = '';
  const ob = $('#picker-online'); ob.classList.remove('hidden'); ob.textContent = 'Соединяемся…';
  let ws = null;
  const conn = joinRoom(code, { watch: true, name: myName() || 'Зритель' }, {
    onOpen() { ob.textContent = 'Соединено! Получаем партию…'; },
    onMessage(msg) {
      if (msg.t === 'watchStart' && !ws) {
        ws = new WatchSession(conn);
        startBoard(ws);
        ws.ui.noIntro = true;
        ws.onMessage(msg);
      } else if (msg.t === 'wait') ob.textContent = 'Партия ещё не началась — ждём, когда второй игрок подключится…';
      else if (msg.t === 'error') ob.textContent = msg.text;
      else if (ws) ws.onMessage(msg);
    },
    onClose() { toast('Партия закончилась или хозяин комнаты закрыл её', 5000); },
    onError(e) { ob.textContent = `Не удалось подключиться (${e.type || e.message || e}). Возможно, партия уже закончилась.`; },
  });
  $('#picker').querySelector('[data-act=back]').onclick = () => { conn.close(); show('menu'); };
}
/** «Смотреть»: two computers play each other. */
async function startWatchBots() {
  const r = await pickDecks([{ title: 'Первая колода', allowRandom: true }, { title: 'Вторая колода', allowRandom: true, level: true }]);
  if (!r) return;
  const level = opt.botLevel === 'auto' ? 'strong' : opt.botLevel;
  const s = new Session({ players: [playerCfg(r[0], `Компьютер · ${r[0].title}`), playerCfg(r[1], `Компьютер · ${r[1].title}`)], controllers: ['bot', 'bot'], me: 0 });
  s.botLevel = level;
  startBoard(s);
}

// ---------- replays ----------
/** Plays a saved game again from its seed and answers, with ⏮ ◀ ⏯ ▶▶ ⏭ controls. */
class ReplaySession {
  constructor(r) { this.r = r; this.watch = true; this.replay = true; this.me = 0; this.queue = []; this.busy = false; this.paused = false; this.speed = 1; this.build(0); }
  /** A fresh game with the first k answers applied quietly. */
  build(k) {
    const g = new Game({ ...this.r.cfg, seed: this.r.seed, options: { ...this.r.cfg.options, previews: false } }); // same options as the game itself, so the dice fall the same way
    for (let i = 0; i < k && g.pending; i++) g.respond(g.pending.player, this.r.history[i]);
    this.game = g; this.pos = k; this.queue = [];
    const orig = g.emit.bind(g);
    g.emit = (type, data) => { const ev = orig(type, data); this.queue.push({ ev, view: g.view(null) }); return ev; };
  }
  attach(ui) { this.ui = ui; ui.onAgain = () => this.jump(0); }
  jump(k) {
    this.build(Math.max(0, Math.min(this.r.history.length, k)));
    document.querySelector('#game > .over-screen')?.remove();
    this.ui.render(this.game.view(null)); this.ui.setPending(null); this.drawBar();
    if (!this.paused) this.pump();
  }
  async pump() {
    if (this.busy) return;
    this.busy = true;
    try {
      for (;;) {
        if (this.queue.length) { await this.ui.playEvents(this.queue.splice(0)); continue; }
        if (this.paused || this.pos >= this.r.history.length || !this.game.pending) break;
        await FX.wait(350);
        if (this.paused) break;
        const q = this.game.pending;
        this.game.respond(q.player, this.r.history[this.pos++]);
        this.drawBar();
      }
    } finally { this.busy = false; }
  }
  drawBar() {
    let bar = document.querySelector('.replay-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'replay-bar';
      bar.innerHTML = `<b>Повтор</b><button data-r="start" title="С начала">⏮</button><button data-r="back" title="Назад">◀</button><button data-r="play" title="Пауза / дальше">⏸</button><button data-r="fast" title="Скорость">×1</button><button data-r="end" title="К концу">⏭</button><span class="rb-pos"></span><button data-r="share" title="Ссылка на повтор">🔗</button>`;
      document.body.appendChild(bar);
      bar.addEventListener('click', (e) => {
        const b = e.target.closest('[data-r]'); if (!b) return;
        const a = b.dataset.r;
        if (a === 'play') { this.paused = !this.paused; b.textContent = this.paused ? '▶' : '⏸'; if (!this.paused) this.pump(); }
        if (a === 'start') this.jump(0);
        if (a === 'back') this.jump(this.pos - 6);
        if (a === 'end') { this.paused = true; bar.querySelector('[data-r=play]').textContent = '▶'; this.jump(this.r.history.length); }
        if (a === 'fast') { this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 3.5 : 1; FX.setSpeed(this.speed * (opt.speed || 1)); b.textContent = '×' + this.speed; }
        if (a === 'share') replayLink(this.r).then((url) => copyText(url, 'Ссылка на повтор скопирована — её можно отправить в чат'));
      });
    }
    bar.querySelector('.rb-pos').textContent = `${Math.round((this.pos / Math.max(1, this.r.history.length)) * 100)}% · раунд ${this.game.s.round || 1}`;
  }
  close() { document.querySelector('.replay-bar')?.remove(); FX.setSpeed(opt.speed || 1); }
}
function startReplay(r) {
  if (!r?.history?.length) { toast('Повтор недоступен'); return; }
  const rs = new ReplaySession(r);
  startBoard(rs);
  rs.ui.noIntro = true;
  rs.ui.render(rs.game.view(null));
  rs.drawBar();
  rs.pump();
}

// Errors anywhere on the page during a game are reported automatically (no personal data, see «Правовая информация»).
window.addEventListener('error', (e) => { if (current?.ui && e.filename && e.filename.includes(location.host)) autoReport(e.error || e.message, current.ui); });
window.addEventListener('unhandledrejection', (e) => { if (current?.ui) autoReport(e.reason, current.ui); });

if (FEATURES.tournaments) document.querySelector('#menu [data-act="tour"]')?.classList.remove('hidden');
// ---------- Задание дня on the menu ----------
function drawDaily() {
  const box = $('#menu-daily'); if (!box) return;
  const d = dailyState();
  box.classList.toggle('done', d.done);
  box.innerHTML = `<span class="dl-ico">${d.done ? '✓' : '📜'}</span><span><b>Задание дня</b>${esc(d.task.text)}${d.streak > 1 ? ` · дней подряд: ${d.streak}` : ''}</span>`;
}
drawDaily();

// ---------- menu: profile bar on top and the ranking panel at the bottom right ----------
function drawMenuTop() {
  const games = loadGames(), wins = games.filter((g) => g.result === 'win').length;
  const cnt = new Map(); for (const g of games) cnt.set(g.myLeader, (cnt.get(g.myLeader) || 0) + 1);
  const fav = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const ava = $('#menu .mv-ava');
  if (ava) ava.style.backgroundImage = `url('assets/leaders/face/${[20, 41, 62, 63, 117, 118].includes(fav) ? fav : 20}.webp')`;
  const nm = $('#menu .mv-name'); if (nm) nm.textContent = opt.name || 'Игрок';
  const u = currentUser(), sub = $('#menu .mv-sub'); if (sub) sub.textContent = u ? 'Профиль сохранён' : 'Профиль';
  $('#mv-wins') && ($('#mv-wins').textContent = wins);
  $('#mv-ach') && ($('#mv-ach').textContent = `${Object.keys(unlocked()).filter((k) => ACH[k]).length}/${Object.keys(ACH).length}`);
  const side = $('#mv-side'); if (!side) return;
  side.innerHTML = `<b>Мировой рейтинг</b><span class="mv-place">Загружаем…</span>${u ? '' : '<button class="btn small" data-login>Войти, чтобы сохранить профиль</button>'}`;
  side.onclick = (e) => { if (e.target.closest('[data-login]')) { e.stopPropagation(); loginDialog(); } else document.querySelector('#menu [data-act="ranking"]')?.click(); };
  loadPlayers('all').then((list) => {
    const k = list.findIndex((x) => x.player_id === playerId()), el = side.querySelector('.mv-place');
    if (el) el.innerHTML = k < 0 ? `Сыграйте партию — и вы в рейтинге из ${list.length} игроков` : `Вы на <em>${k + 1}</em> месте из ${list.length}`;
  }).catch(() => { const el = side.querySelector('.mv-place'); if (el) el.textContent = 'Рейтинг сейчас недоступен'; });
}
drawMenuTop();
document.querySelector('#menu [data-close-opts]')?.addEventListener('click', () => $('#menu-opts').classList.add('hidden'));

// ---------- online through the game server ----------
/** Both players are clients of the server: it runs the game, we show it and send answers. */
class ServerSession {
  constructor(conn, me) { this.conn = conn; this.me = me; this.code = conn.code; this.server = true; this.chain = Promise.resolve(); }
  attach(ui) { this.ui = ui; ui.onAgain = () => { this.conn.send({ t: 'rematch' }); toast('Реванш: ждём, когда новая партия начнётся'); }; }
  pump() {}
  answer(q, a) { this.conn.send({ t: 'answer', a }); }
  onMessage(msg) {
    if (msg.t === 'events') {
      this.chain = this.chain.then(async () => {
        if (msg.batch[0]?.ev?.type === 'init') document.querySelector('#game > .over-screen')?.remove();
        this.ui.setPending(null);
        await this.ui.playEvents(msg.batch);
        this.ui.setDeadline?.(msg.deadline);
        if (msg.pending) this.ui.setPending(msg.pending);
        else if (msg.waiting) this.ui.setPending({ player: 1 - this.me, type: msg.waiting === 'priority' ? 'priority' : 'wait', options: [] });
      });
    } else if (msg.t === 'sync') {
      this.chain = this.chain.then(() => { this.ui.render(msg.view); this.ui.setDeadline?.(msg.deadline); this.ui.setPending(msg.pending); });
    } else if (msg.t === 'emote') this.ui?.showEmote(1 - this.me, String(msg.text).slice(0, 160));
    else if (msg.t === 'chat') this.ui?.chat?.add(msg.name, msg.text);
    else if (msg.t === 'watchers') this.ui?.chat?.setCount(msg.n | 0);
    else if (msg.t === 'toast') toast(msg.text, 3500);
  }
  close() { this.conn.close(); }
}
/** Join or create a room on the server with my deck; the board opens when the game starts. */
function serverPlay(code, deck, { creating = false, matched = false, tour: inTour = false } = {}) {
  show('picker');
  $('#picker-list').innerHTML = '';
  const ob = $('#picker-online'); ob.classList.remove('hidden');
  $('#picker-title').textContent = creating ? 'Ждём друга' : 'Подключаемся…';
  const url = `${location.origin}${location.pathname}?room=${code}`;
  if (creating) {
    ob.innerHTML = `Отправьте другу эту ссылку. Игра начнётся, как только он откроет её и выберет колоду.
      <div class="link"><input readonly value="${url}"><button class="btn small" id="copy-link">Копировать</button>${navigator.share ? '<button class="btn small" id="share-link">Поделиться</button>' : ''}</div>
      <p style="color:var(--ink-dim);font-size:15px;margin:10px 0 0">Партия идёт на сервере: её не потеряете, даже если закроете вкладку — откройте ссылку снова.</p>`;
    $('#copy-link').onclick = () => copyText(url);
    $('#share-link') && ($('#share-link').onclick = () => navigator.share({ title: 'Карточные битвы ПЧК', text: 'Сыграем в Карточные битвы?', url }));
  } else ob.textContent = 'Соединяемся с сервером…';
  let ss = null;
  const conn = connectRoom(code, { name: myName(), playerId: playerId(), autopass: AP_ENGINE(opt.autopass), timer: creating ? opt.timer : matched ? 90 : 0, deck: { leader: deck.leader, cards: deck.cards, title: deck.title } }, {
    onMessage(msg) {
      if ((msg.t === 'start' || msg.t === 'sync') && !ss) { ss = new ServerSession(conn, msg.me ?? 0); ss.tour = inTour; startBoard(ss); if (msg.t === 'sync') ss.onMessage(msg); return; }
      if (msg.t === 'start' && ss) { ss.me = msg.me; document.querySelector('#game > .over-screen')?.remove(); toast('Новая партия!', 1800); return; } // rematch, or a draw replayed in a tournament
      if (msg.t === 'waitOpponent' && !creating) ob.textContent = 'Подключено! Ждём второго игрока…';
      else if (msg.t === 'busy') ob.textContent = 'В этой комнате уже идёт игра. Можно посмотреть её как зритель.';
      else if (msg.t === 'error') ob.textContent = msg.text;
      else if (ss) ss.onMessage(msg);
    },
    onState(text) { if (text) toast(text, 2500); },
  });
  $('#picker').querySelector('[data-act=back]').onclick = () => { conn.close(); show('menu'); };
  return conn;
}
async function startServerHost() {
  const r = await pickDecks([{ title: 'Ваша колода — затем отправьте ссылку другу', goLabel: 'Создать комнату' }]);
  if (!r) return;
  let code; try { code = await newRoomCode(); } catch { toast('Сервер недоступен — играем напрямую'); return startHost(true); }
  serverPlay(code, r[0], { creating: true });
}
async function startServerJoin(code) {
  // Coming back to my game: the server remembers my deck, no need to choose it again.
  let mine = null; try { mine = sessionStorage.getItem('pchk_tok_' + code) || localStorage.getItem('pchk_tok_' + code); } catch { /* private mode */ }
  if (mine) { const d = Object.values(DECKS)[0]; serverPlay(code, { leader: d.leader, cards: d.main, title: d.title }); return; }
  const r = await pickDecks([{ title: 'Выберите колоду для игры с другом', goLabel: 'Подключиться' }]);
  if (!r) return;
  serverPlay(code, r[0]);
}
/** «Найти соперника»: pick a deck, wait in the queue, then play in the room the server made. */
async function startMatchmaking() {
  const r = await pickDecks([{ title: 'Ваша колода для игры со случайным соперником', goLabel: 'Искать соперника' }]);
  if (!r) return;
  show('picker');
  $('#picker-title').textContent = 'Ищем соперника…';
  $('#picker-list').innerHTML = '';
  const ob = $('#picker-online'); ob.classList.remove('hidden');
  ob.textContent = 'Ждём, когда кто-то ещё нажмёт «Найти соперника»…';
  const mm = findMatch(myName(), {
    onQueue(n) { ob.textContent = n > 1 ? `В очереди: ${n}. Сейчас подберём пару…` : 'Вы первый в очереди. Как только кто-то ещё начнёт поиск — партия начнётся.'; },
    onMatch(code, vs) { toast(`Соперник найден: ${vs}`); serverPlay(code, r[0], { matched: true }); },
    onError() { ob.textContent = 'Сервер поиска недоступен. Попробуйте позже или позовите друга по ссылке.'; },
  });
  $('#picker').querySelector('[data-act=back]').onclick = () => { mm.cancel(); show('menu'); };
}
/** «С другом»: invite by link or find a random opponent. */
function chooseOnline() {
  if (!serverOn()) { startHost(); return; }
  const b = document.createElement('div');
  b.className = 'modal-back'; b.style.cssText = 'position:fixed;inset:0;z-index:400';
  b.innerHTML = `<div class="modal" style="max-width:520px"><h3>Игра онлайн</h3>
    <div class="row-btns" style="flex-direction:column;align-items:stretch;gap:12px">
      <button class="btn primary" data-invite>🔗 Позвать друга по ссылке</button>
      <button class="btn" data-find>🎲 Найти случайного соперника</button>
      <button class="btn small" data-close>Отмена</button></div></div>`;
  document.body.appendChild(b);
  b.querySelector('[data-invite]').onclick = () => { b.remove(); startServerHost(); };
  b.querySelector('[data-find]').onclick = () => { b.remove(); startMatchmaking(); };
  b.querySelector('[data-close]').onclick = () => b.remove();
}
function startServerWatch(code) {
  show('picker');
  $('#picker-title').textContent = 'Подключаемся к партии…';
  $('#picker-list').innerHTML = '';
  const ob = $('#picker-online'); ob.classList.remove('hidden'); ob.textContent = 'Соединяемся с сервером…';
  let ws = null;
  const conn = connectRoom(code, { watch: true, name: myName() || 'Зритель' }, {
    onMessage(msg) {
      if (msg.t === 'watchStart' && !ws) { ws = new WatchSession(conn); startBoard(ws); ws.ui.noIntro = true; ws.onMessage(msg); }
      else if (msg.t === 'wait') ob.textContent = 'Партия ещё не началась — ждём игроков…';
      else if (ws) ws.onMessage(msg);
    },
  });
  $('#picker').querySelector('[data-act=back]').onclick = () => { conn.close(); show('menu'); };
}

// ---------- tournaments (on while the authors agree: features.js) ----------
let tour = null; // { conn, code, deck, me, owner, state }
function drawTour() {
  if (!tour) return;
  show('picker');
  const st = tour.state, me = tour.me;
  $('#picker-title').textContent = st?.champion != null ? 'Турнир завершён' : st?.started ? 'Турнир идёт' : 'Турнир: собираем игроков';
  $('#picker-list').innerHTML = '';
  const ob = $('#picker-online'); ob.classList.remove('hidden');
  const url = `${location.origin}${location.pathname}?tour=${tour.code}`;
  const name = (i) => (i == null ? '<i>—</i>' : `${esc(st.players[i]?.name || '?')}${i === me ? ' <small>(вы)</small>' : ''}`);
  const myMatch = st?.rounds.flat().find((m) => m.room && m.winner == null && (m.a === me || m.b === me));
  ob.innerHTML = `<div class="tour">
    ${!st?.started ? `<p>Отправьте ссылку участникам (до 8 человек). Каждый выбирает колоду и попадает в сетку.</p>
      <div class="link"><input readonly value="${url}"><button class="btn small" data-copy>Копировать</button></div>
      <h3>Участники: ${st?.players.length || 0} из 8</h3><div class="tour-players">${(st?.players || []).map((p, i) => `<span><i style="background-image:url('assets/leaders/face/${p.leader}.webp')"></i>${name(i)}</span>`).join('')}</div>
      ${tour.owner ? `<button class="btn primary" data-start ${(st?.players.length || 0) < 2 ? 'disabled' : ''}>Начать турнир</button>` : '<p>Турнир начнёт его создатель.</p>'}` : ''}
    ${st?.started ? `<div class="tour-bracket">${st.rounds.map((r, k) => `<div class="tour-round"><b>${r.length === 1 ? 'Финал' : r.length === 2 ? 'Полуфинал' : `Раунд ${k + 1}`}</b>${r.map((m) => `<div class="tour-match ${m.winner != null ? 'done' : m.room ? 'live' : ''}"><span class="${m.winner === m.a && m.a != null ? 'win' : ''}">${name(m.a)}</span><span class="${m.winner === m.b && m.b != null ? 'win' : ''}">${name(m.b)}</span>${m.room && m.winner == null ? `<button class="btn small" data-watch="${m.room}">👁</button>` : ''}</div>`).join('')}</div>`).join('')}</div>` : ''}
    ${st?.champion != null ? `<h3 class="tour-champ">🏆 Победитель: ${name(st.champion)}</h3>` : ''}
    ${myMatch ? `<button class="btn primary big" data-play="${myMatch.room}">⚔ Играть свой матч</button>` : ''}
  </div>`;
  ob.querySelector('[data-copy]')?.addEventListener('click', () => copyText(url, 'Ссылка на турнир скопирована'));
  ob.querySelector('[data-start]')?.addEventListener('click', () => tour.conn.send({ t: 'start' }));
  ob.querySelector('[data-play]')?.addEventListener('click', (e) => serverPlay(e.target.dataset.play, tour.deck, { tour: true }));
  ob.querySelectorAll('[data-watch]').forEach((b) => b.addEventListener('click', () => startServerWatch(b.dataset.watch)));
  $('#picker').querySelector('[data-act=back]').onclick = () => { show('menu'); };
}
async function startTour(code = null) {
  if (!serverOn()) { toast('Турниры работают через игровой сервер — он ещё не подключён'); return; }
  const r = await pickDecks([{ title: code ? 'Ваша колода для турнира' : 'Ваша колода — затем позовите участников', goLabel: code ? 'Войти в турнир' : 'Создать турнир' }]);
  if (!r) return;
  if (!code) { try { code = await newRoomCode(); } catch { toast('Сервер недоступен'); return; } }
  tour?.conn.close();
  tour = { code, deck: r[0], me: -1, owner: false, state: null };
  tour.conn = connectTour(code, { name: myName(), playerId: playerId(), deck: { leader: r[0].leader, cards: r[0].cards } }, (m) => {
    if (m.t === 'you') { tour.me = m.me; tour.owner = m.owner; }
    if (m.t === 'state') {
      const had = tour.state?.rounds.flat().find((x) => x.room && x.winner == null && (x.a === tour.me || x.b === tour.me));
      tour.state = m;
      const now = m.rounds.flat().find((x) => x.room && x.winner == null && (x.a === tour.me || x.b === tour.me));
      if (now && now.room !== had?.room) toast('Ваш матч готов — нажмите «Играть свой матч»', 4000);
      if (!current || $('#picker').classList.contains('active')) drawTour();
    }
  });
  drawTour();
}

// ---------- deck builder ----------
function openBuilder({ startNew = false, back = () => show('menu') } = {}) {
  renderBuilder($('#builder'), store, back, {
    startNew, author: () => myName(),
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
    const s = new Session({ players: [mk(DECKS.sfinkteirion, myName()), mk(DECKS.larisa, 'Учебный соперник')], controllers: ['human', 'bot'], me: 0 });
    s.botLevel = 'novice'; s.coachMode = 'tutorial';
    startBoard(s);
  });
}
// First visit: offer the tutorial once (after the splash).
$('#splash').addEventListener('click', () => {
  if (store.get('tutOffered', false) || new URLSearchParams(location.search).get('join')) return;
  store.set('tutOffered', true);
  introDone().then(() => setTimeout(() => {
    const b = document.createElement('div');
    b.className = 'modal-back'; b.style.cssText = 'position:fixed;inset:0;z-index:400';
    b.innerHTML = `<div class="modal" style="max-width:520px"><h3>Впервые в «Карточных битвах»?</h3><p style="font-size:18px;line-height:1.45">Короткое обучение за 2 минуты покажет, как ходить, сражаться и отвечать «Опережением». Потом можно сыграть учебную партию с подсказками.</p><div class="row-btns"><button class="btn primary" data-y>🎓 Пройти обучение</button><button class="btn" data-n>Я уже умею</button></div></div>`;
    document.body.appendChild(b);
    b.querySelector('[data-y]').onclick = () => { b.remove(); openTutorial(); };
    b.querySelector('[data-n]').onclick = () => b.remove();
  }, 700));
});

// Test shortcut: ?screen=menu opens a screen directly.
const screenParam = new URLSearchParams(location.search).get('screen');
if (screenParam) show(screenParam);
const actParam = new URLSearchParams(location.search).get('act');
if (actParam) setTimeout(() => document.querySelector(`#menu [data-act="${actParam}"]`)?.click(), 300);
// ---------- quick start for testing: ?quick=deckA,deckB ----------
const quick = new URLSearchParams(location.search).get('quick');
if (quick) {
  const [a, b] = quick.split(',');
  const da = DECKS[a] || DECKS.sfinkteirion, db = DECKS[b] || DECKS.larisa;
  const mk = (d, n) => ({ name: n, leader: d.leader, deck: d.main });
  const auto = new URLSearchParams(location.search).get('auto');
  startBoard(new Session({ players: [mk(da, auto ? `Компьютер · ${da.title}` : myName()), mk(db, auto ? `Компьютер · ${db.title}` : 'Компьютер')], controllers: [auto ? 'bot' : 'human', 'bot'], me: 0 }));
}

// ---------- menu wiring ----------
const tourParam = new URLSearchParams(location.search).get('tour');
if (tourParam && /^[a-z0-9]{4,10}$/.test(tourParam) && FEATURES.tournaments) {
  const jb = $('#join-banner');
  jb.classList.remove('hidden');
  jb.innerHTML = `Вас позвали на турнир! <button class="btn primary" style="margin-left:8px">🏆 Участвовать</button>`;
  jb.querySelector('button').addEventListener('click', () => { sfx.click(); jb.classList.add('hidden'); startTour(tourParam); });
}
const replayParam = new URLSearchParams(location.search).get('replay');
if (replayParam) {
  const jb = $('#join-banner');
  jb.classList.remove('hidden');
  jb.innerHTML = `Вам прислали повтор партии! <button class="btn primary" style="margin-left:8px">▶ Смотреть</button>`;
  jb.querySelector('button').addEventListener('click', () => { sfx.click(); jb.classList.add('hidden'); readReplayParam(replayParam).then(startReplay).catch(() => toast('Ссылка на повтор повреждена')); });
  if (new URLSearchParams(location.search).get('autoplay')) jb.querySelector('button').click(); // for recordings and screenshots
}
const roomCode = new URLSearchParams(location.search).get('room'), watchRoom = new URLSearchParams(location.search).get('watchroom');
if ((roomCode || watchRoom) && /^[a-z0-9]{4,10}$/.test(roomCode || watchRoom)) {
  const jb = $('#join-banner');
  jb.classList.remove('hidden');
  jb.innerHTML = roomCode ? `Вас пригласили в игру! <button class="btn primary" style="margin-left:8px">Присоединиться</button>` : `Вас позвали посмотреть партию! <button class="btn primary" style="margin-left:8px">👁 Смотреть</button>`;
  jb.querySelector('button').addEventListener('click', () => { sfx.click(); jb.classList.add('hidden'); if (roomCode) startServerJoin(roomCode); else startServerWatch(watchRoom); });
}
const watchCode = new URLSearchParams(location.search).get('watch');
if (watchCode && /^[a-z0-9]{4,10}$/.test(watchCode)) {
  const jb = $('#join-banner');
  jb.classList.remove('hidden');
  jb.innerHTML = `Вас позвали посмотреть партию! <button class="btn primary" style="margin-left:8px">👁 Смотреть</button>`;
  jb.querySelector('button').addEventListener('click', () => { sfx.click(); jb.classList.add('hidden'); startWatch(watchCode); });
}
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
  else if (a === 'watchbots') startWatchBots();
  else if (a === 'tour') startTour();
  else if (a === 'host') chooseOnline();
  else if (a === 'rules') { renderRules($('#rules'), () => show('menu')); show('rules'); }
  else if (a === 'tutorial') openTutorial();
  else if (a === 'feedback') openFeedback({ name: opt.name });
  else if (a === 'legal') { renderLegal($('#legal'), () => show('menu'), { onRights: () => openFeedback({ name: opt.name, kind: 'rights' }) }); show('legal'); }
  else if (a === 'stats' || a === 'ranking') {
    renderStats($('#stats'), () => show('menu'), { tab: a === 'ranking' ? 'world' : 'profile', onReplay: (r) => startReplay(r), onShareReplay: (r) => replayLink(r).then((u) => copyText(u, 'Ссылка на повтор скопирована')), name: () => opt.name, setName: (v) => { opt.name = v; store.set('name', v); $('#opt-name').value = v; } });
    show('stats');
  }
  else if (a === 'decks') openBuilder();
}));
window.addEventListener('beforeunload', (e) => { if (current && !current.game?.s.over) { e.preventDefault(); e.returnValue = ''; } });
