// «Сообщить об ошибке / идея / отзыв»: a window for players; the report goes to the shared Supabase table.
// For a bug from a game, a snapshot of the game (leaders, round, last moves, device) is attached automatically.
import { CARDS } from '../data/cards.js';
import { playerId, isLocal } from '../net/ranking.js';

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
    const timer = setTimeout(() => { h2c = null; s.remove(); rej(new Error('timeout')); }, 8000);
    s.onload = () => { clearTimeout(timer); res(window.html2canvas); };
    s.onerror = () => { clearTimeout(timer); h2c = null; s.remove(); rej(new Error('load')); };
    document.head.appendChild(s);
  }));
}

let draft = { text: '', author: '', kind: null, shots: [], context: true }, active = null;
let feedbackOptions = () => ({});
// Registered before transient dialogs: their Escape/Enter handlers must not see our keystrokes.
export function installFeedbackControl(options) {
  feedbackOptions = options;
  if (document.querySelector('#feedback-control')) return;
  const control = document.createElement('button');
  control.id = 'feedback-control'; control.type = 'button'; control.textContent = '⚑'; control.title = 'Сообщить об ошибке';
  control.setAttribute('aria-label', 'Сообщить об ошибке');
  control.onclick = () => openFeedback(feedbackOptions()); document.body.appendChild(control);
  document.addEventListener('keydown', e => {
    if (!active) return;
    e.stopImmediatePropagation();
    if (e.key === 'Escape') { e.preventDefault(); active.close(); }
    if (e.key === 'Tab') {
      const els = [...active.back.querySelectorAll('button:not(:disabled), input, textarea')].filter(e => e.offsetWidth);
      const first = els[0], last = els.at(-1);
      if (e.shiftKey && document.activeElement === first) {e.preventDefault();last.focus();}
      else if (!e.shiftKey && document.activeElement === last) {e.preventDefault();first.focus();}
    }
  }, true);
}

export function openFeedback({ui = null, name = '', kind = null} = {}) {
  if (active) { active.back.querySelector('textarea')?.focus(); return; }
  const prev = document.activeElement, back = document.createElement('div');
  back.className = 'fb-back';
  const inGame = !!ui?.view;
  const initial = gameSnapshot(ui);
  const screen = document.querySelector('.screen.active')?.id || 'unknown';
  if (!draft.author) draft.author = name;
  if (!draft.kind) draft.kind = kind || (inGame ? 'bug' : 'review');
  back.innerHTML = `<div class="fb-win" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
    <div class="win-head"><h3 id="feedback-title">Написать разработчику</h3><button class="win-x" data-close aria-label="Закрыть">✕</button></div>
    <div class="fb-kinds">${KINDS.map(([k,t,h])=>`<label class="fb-kind" title="${esc(t)}"><input type="radio" name="fbk" value="${k}" ${draft.kind===k?'checked':''}><b>${esc(KIND_SHORT[k] || t)}</b></label>`).join('')}</div>
    <textarea maxlength="4000" aria-label="Текст сообщения" placeholder="Что случилось, что вы сделали и чего ожидали?">${esc(draft.text)}</textarea>
    <input class="fb-author" maxlength="60" aria-label="Имя или контакт" placeholder="Имя или контакт (необязательно)" value="${esc(draft.author)}">
    <p>До 4000 символов и 3 снимков. PNG, JPEG или WebP, до 5 МБ каждый. Не прикладывайте личные данные.</p>
    <label class="btn fb-upload">Добавить снимки<input type="file" accept="image/png,image/jpeg,image/webp" multiple></label>
    <button class="btn" data-capture>Снять текущий экран</button><div class="fb-attachments"></div>
    ${inGame?`<label class="fb-ctx"><input type="checkbox" ${draft.context?'checked':''}> Приложить ход партии на момент открытия формы</label>`:''}
    <div class="fb-msg" role="status" aria-live="polite"></div>
    <div class="fb-btns"><button class="fb-btn quiet" data-close>Закрыть</button><button class="fb-btn" data-send>Отправить</button></div></div>`;
  // Keep the original screen and modal nodes intact, including scroll and draft values.
  const locked = [...document.body.children].filter(el=>el instanceof HTMLElement && !['SCRIPT','STYLE','LINK'].includes(el.tagName)).map(el=>[el,el.inert]);
  locked.forEach(([el])=>el.inert=true);
  document.body.appendChild(back);
  const ta=back.querySelector('textarea'), author=back.querySelector('.fb-author'), msg=back.querySelector('.fb-msg');
  let busy=false, closed=false;
  const save=()=>{draft.text=ta.value;draft.author=author.value;draft.kind=back.querySelector('[name=fbk]:checked')?.value;draft.context=back.querySelector('.fb-ctx input')?.checked ?? true;};
  const close=()=>{if(busy)return;save();closed=true;back.remove();locked.forEach(([el,inert])=>el.inert=inert);active=null;prev?.focus?.();};
  active={back,close};
  back.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);
  back.addEventListener('input',save);back.onclick=e=>{if(e.target===back)close();};
  const attachments=()=>{const box=back.querySelector('.fb-attachments');box.replaceChildren();draft.shots.forEach((src,i)=>{const item=document.createElement('div'),img=new Image(),b=document.createElement('button');img.src=src;img.alt='Снимок '+(i+1);b.className='btn';b.textContent='Убрать '+(i+1);b.onclick=()=>{if(busy)return;draft.shots.splice(i,1);attachments();};item.append(img,b);box.append(item);});};
  attachments();
  const normalize=async file=>{
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024)throw Error('Нужен PNG, JPEG или WebP не больше 5 МБ.');
    const url=globalThis.URL.createObjectURL(file),img=new Image();
    try{img.src=url;await img.decode();const k=Math.min(1,1280/Math.max(img.width,img.height));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*k));c.height=Math.max(1,Math.round(img.height*k));c.getContext('2d').drawImage(img,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.72);}finally{globalThis.URL.revokeObjectURL(url);}
  };
  back.querySelector('[type=file]').onchange=async e=>{
    if(busy)return;busy=true;
    try{for(const file of e.target.files){if(draft.shots.length>=3)throw Error('Можно приложить не больше трёх снимков.');draft.shots.push(await normalize(file));}msg.textContent='Снимки добавлены.';}catch(err){msg.textContent=err.message;}finally{busy=false;e.target.value='';attachments();}
  };
  back.querySelector('[data-capture]').onclick=async()=>{
    if(busy)return;if(draft.shots.length>=3){msg.textContent='Можно приложить не больше трёх снимков.';return;}
    busy=true;back.style.visibility='hidden';
    try{const shot=await screenshot();if(shot){draft.shots.push(shot);msg.textContent='Снимок добавлен.';}else msg.textContent='Не удалось снять экран. Добавьте снимок вручную или отправьте текст.';}finally{back.style.visibility='';busy=false;attachments();}
  };
  back.querySelector('[data-send]').onclick=async()=>{
    if(busy)return;save();if(draft.text.trim().length<3){msg.textContent='Напишите хотя бы пару слов.';ta.focus();return;}
    busy=true;const btn=back.querySelector('[data-send]');btn.disabled=true;btn.textContent='Отправляем…';
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{
      const res=await fetch(URL,{method:'POST',signal:controller.signal,headers:{apikey:KEY,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({kind:draft.kind,text:draft.text.trim(),author:draft.author.trim()||null,player_id:playerId(),context:{url:location.origin+location.pathname,screen,viewport:`${innerWidth}x${innerHeight}`,ua:navigator.userAgent,game:draft.context?initial:null,shot:draft.shots[0]||null,shots:draft.shots}})});
      if(!res.ok)throw Error(String(res.status));
      draft={text:'',author:draft.author,kind:null,shots:[],context:true};
      busy=false;back.remove();locked.forEach(([el,inert])=>el.inert=inert);active=null;closed=true;prev?.focus?.();
      const done=document.createElement('div');done.className='toast';done.textContent='Спасибо! Сообщение отправлено.';document.body.append(done);setTimeout(()=>done.remove(),4000);
    }catch(err){if(!closed){msg.textContent=err.message==='413'?'Снимки слишком большие. Уберите один и повторите.':err.message==='429'?'Слишком много запросов. Подождите немного и повторите.':'Не удалось отправить. Черновик сохранён: проверьте связь и повторите.';btn.disabled=false;btn.textContent='Повторить отправку';}}finally{clearTimeout(timer);busy=false;}
  };
  ta.focus();
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
  if (isLocal()) return;
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
