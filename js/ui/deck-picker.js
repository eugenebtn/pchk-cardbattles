import { CARDS } from '../data/cards.js';
import { DECKS } from '../data/decks.js';
import { BOT_DECKS } from '../data/botdecks.js';
import { THEME_DECKS } from '../data/themedecks.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function deckError(d) {
  if (CARDS[d?.leader]?.type !== 'leader') return 'Выберите Лидера.';
  if (!Array.isArray(d.cards) || d.cards.length < 40) return 'Нужно не меньше 40 карт.';
  if (d.cards.length > 80) return 'В колоде может быть не больше 80 карт. Уберите лишние карты перед игрой.';
  const counts = new Map();
  for (const id of d.cards) {
    if (!CARDS[id] || CARDS[id].token || CARDS[id].type === 'leader') return 'В колоде есть недоступная карта.';
    counts.set(id, (counts.get(id) || 0) + 1);
    if (counts.get(id) > 3) return 'Не больше трёх экземпляров одной карты.';
  }
  return '';
}
export function availableDecks(custom = []) {
  return [
    ...Object.values(DECKS).map(d => ({key:'off:'+d.key, deckKey:d.key, title:d.title, leader:d.leader, cards:d.main, preset:true, category:'Стартовая', desc:d.desc})),
    ...THEME_DECKS.map(d => ({...d, key:'theme:'+d.key, preset:true, category:'Тематическая'})),
    ...BOT_DECKS.map(d => ({...d, key:'bot:'+d.key, preset:true, category:'Сильная сборка'})),
    ...custom.map((d,i) => ({...d, key:'cus:'+i, title:d.name, preset:false, category:'Своя'}))
  ];
}

// A Leader is chosen first; a concrete deck is never silently upgraded or replaced.
export function chooseDecks(root, steps, {getDecks, show, create, levels, getLevel, setLevel, onCancel}) {
  return new Promise(resolve => {
    const chosen = [], picks = [];
    let step = 0, phase = 'leader';
    function draw() {
      const decks = getDecks(), st = steps[step];
      const leaders = [...new Set(decks.map(d => d.leader))];
      const pick = picks[step] ||= {leader:leaders[0], key:null};
      const list = decks.filter(d => d.leader === pick.leader);
      let selected = list.find(d => d.key === pick.key) || list[0];
      if (selected) pick.key = selected.key;
      root.innerHTML = `<div class="launch-picker">
        <header><h2>${esc(st.title)}</h2><p>${steps.length>1 ? `Шаг ${step+1} из ${steps.length} · ` : ''}${phase==='leader'?'Выберите Лидера':'Выберите колоду'}</p></header>
        <div class="launch-pick-content">${phase==='leader' ? `<div class="launch-leaders">${leaders.map(id=>`<button class="launch-leader ${pick.leader===id?'selected':''}" data-leader="${id}" aria-pressed="${pick.leader===id}"><img src="assets/leaders/face/${id}.webp" alt=""><span>${esc(CARDS[id].name)}</span></button>`).join('')}</div>${st.allowRandom?'<button class="btn" data-random>🎲 Случайный Лидер и колода</button>':''}` : `<h3>${esc(CARDS[pick.leader]?.name)}</h3><div class="launch-decks">${list.map(d=>`<button class="launch-deck ${selected===d?'selected':''}" data-deck="${esc(d.key)}" aria-pressed="${selected===d}"><b>${esc(d.title)}</b><span>${esc(d.category)} · ${d.cards.length} карт</span><small>${esc(deckError(d)||d.desc||'')}</small></button>`).join('')}</div><button class="btn" data-create>＋ Собрать свою колоду</button>`}
        ${st.level?`<div class="launch-level"><label>Сложность компьютера <select data-level>${levels.map(([k,t])=>`<option value="${k}" ${getLevel()===k?'selected':''}>${esc(t)}</option>`).join('')}</select></label><small>Сложность меняет решения компьютера. Он играет выбранной колодой.</small></div>`:''}</div>
        <footer><button class="btn" data-back>← Назад</button><button class="btn primary" data-go ${phase==='deck'&&(!selected||deckError(selected))?'disabled':''}>${phase==='leader'?'Выбрать колоду':esc(step===steps.length-1?(st.goLabel||'В бой!'):'Далее')}</button></footer></div>`;
      root.querySelectorAll('[data-leader]').forEach(b=>b.onclick=()=>{pick.leader=Number(b.dataset.leader);pick.key=null;draw();});
      root.querySelectorAll('[data-deck]').forEach(b=>b.onclick=()=>{pick.key=b.dataset.deck;draw();});
      root.querySelector('[data-level]')?.addEventListener('change',e=>setLevel(e.target.value));
      root.querySelector('[data-create]')?.addEventListener('click',()=>create(pick.leader,()=>{show('heroes');draw();}));
      root.querySelector('[data-random]')?.addEventListener('click',()=>{
        const valid=decks.filter(d=>d.preset&&!deckError(d));
        const d=valid[Math.floor(Math.random()*valid.length)];
        if(d){pick.leader=d.leader;pick.key=d.key;phase='deck';draw();}
      });
      root.querySelector('[data-back]').onclick=()=>{
        if(phase==='deck'){phase='leader';draw();}
        else if(step){step--;chosen.pop();phase='deck';draw();}
        else {resolve(null);if(onCancel)onCancel();else show('menu');}
      };
      root.querySelector('[data-go]').onclick=()=>{
        if(phase==='leader'){phase='deck';draw();return;}
        if(!selected||deckError(selected))return;
        chosen.push({...selected,cards:[...selected.cards]});step++;
        if(step===steps.length){resolve(chosen);return;}
        phase='leader';draw();
      };
    }
    show('heroes');draw();
  });
}
