// Move coach: for each of your decisions asks the rule bot what it would do and shows it.
//  mode 'tutorial' — a pointing hand on the card or button and a short explanation (the learning game);
//  mode 'hint'     — one line «Совет: …» at the top of the hint panel (normal games, can be turned off).
import { CARDS } from '../data/cards.js';
import { botAnswer } from '../engine/bot.js';
import { esc } from './board.js';

const nm = (id) => `«${(CARDS[id]?.name || '').split(',')[0]}»`;

/** What the rule bot would answer, and a plain sentence why. Returns null when there is nothing to advise. */
export function advise(g, q) {
  let a;
  try { a = botAnswer(g, q, () => 0.5); } catch { return null; }
  if (a === undefined || a === null) return null;
  const me = q.player, P = g.P(me);
  switch (q.type) {
    case 'main': {
      if (a === 'end') return { a, text: 'Полезных ходов больше нет — завершите ход.' };
      const o = q.options.find((x) => x.id === a);
      if (!o) return null;
      if (o.kind === 'ability') return { a, uid: o.uid, text: `Используйте свойство «${o.label}» карты ${nm(g.card(o.uid).id)}.` };
      const d = CARDS[o.side];
      const why = d.type === 'ally' ? 'союзник встанет на поле и будет сражаться' : d.type === 'place' ? 'Место усиливает регион и часто приносит монеты' : d.type === 'item' || d.type === 'companion' ? 'эта карта будет помогать всю партию' : 'её эффект сработает сразу';
      return { a, uid: o.uid, text: `Разыграйте ${nm(o.side)} за ${o.cost ?? d.cost} 💰 — ${why}.` };
    }
    case 'draw': return { a, text: a === 'card' ? `Возьмите карту: в руке ${P.hand.length} — нужно больше вариантов ходов.` : P.coins <= 3 ? `Возьмите монету: у вас всего ${P.coins} 💰, без монет карты не разыграть.` : `Возьмите монету: будет ${P.coins + 1} 💰 — хватит на сильную карту.` };
    case 'region': {
      const e = g.allyAt(1 - me, a);
      return { a, region: a, row: q.row || 'ally', side: q.side ?? me, text: q.row === 'place' ? `Положите Место в регион ${a + 1}.` : e ? `Регион ${a + 1}: напротив ${nm(e.id)} — ваш союзник с ним сразится.` : `Регион ${a + 1}: напротив пусто — в бою союзник ударит прямо по вражескому Лидеру.` };
    }
    case 'target': {
      const c = g.card(a); if (!c) return null;
      return { a, uid: a, text: c.ctrl === me ? `Выберите свою карту ${nm(c.id)}.` : `Выберите ${nm(c.id)} у соперника${g.cardType(c) === 'leader' ? ' — прямо по Лидеру' : ''}.` };
    }
    case 'pick': {
      const k = q.options.findIndex((x) => x.id === a);
      return k < 0 ? null : { a, pick: k, text: `Выберите «${q.options[k].label ?? q.options[k].id}».` };
    }
    case 'priority': {
      if (a === 'pass') return { a, text: 'Отвечать сейчас не обязательно — можно пропустить.' };
      const o = q.options.find((x) => x.id === a);
      return o ? { a, text: o.kind === 'play' ? `Можно ответить картой ${nm(o.side)} — она сработает раньше.` : `Можно ответить свойством «${o.label}».` } : null;
    }
    case 'mulligan': return Array.isArray(a) ? { a, text: 'Оставьте дешёвые карты (1–3 монеты) и союзников — с ними легко начать.' } : null;
    default: return null;
  }
}

export function createCoach(ui, getGame, mode = 'hint') {
  let hand = null, bubble = null;
  const clear = () => { hand?.remove(); bubble?.remove(); hand = bubble = null; if (ui.coachText) { ui.coachText = null; ui.updateHint(); } };
  const targetEl = (tip, q) => {
    if (q.type === 'main') return tip.uid != null ? ui.els.get(tip.uid) : ui.endBtn;
    if (q.type === 'region') return ui.slots?.[tip.row]?.[tip.side]?.[tip.region];
    if (q.type === 'target') return ui.els.get(tip.uid) || document.querySelector(`#game .mcard[data-uid="${tip.uid}"]`);
    if (q.type === 'draw') return document.querySelector(`#game .draw-opt[data-id="${tip.a}"]`);
    if (q.type === 'pick') return document.querySelector(`#game .pick-opt[data-k="${tip.pick}"]`);
    if (q.type === 'priority') return tip.a === 'pass' ? document.querySelector('#game .priority-panel [data-pass], #game .priority-panel .btn.primary') : document.querySelector(`#game .priority-panel [data-id="${tip.a}"]`);
    return null;
  };
  return {
    mode,
    update(q) {
      clear();
      const g = getGame();
      if (!mode || mode === 'off' || !g || !q || q.player !== ui.me || g.s.over) return;
      const tip = advise(g, q);
      if (!tip) return;
      if (mode === 'hint') { ui.coachText = tip.text; ui.updateHint(); return; }
      // Tutorial: point at the thing to press (after the windows of this question have opened).
      setTimeout(() => {
        if (ui.q !== q) return;
        const el = targetEl(tip, q);
        bubble = document.createElement('div');
        bubble.className = 'coach-bubble';
        bubble.innerHTML = `<b>Подсказка</b>${esc(tip.text)}`;
        document.body.appendChild(bubble);
        if (el) {
          const r = el.getBoundingClientRect();
          hand = document.createElement('div');
          hand.className = 'coach-hand';
          // Below the thing when there is room, otherwise above it, pointing down.
          const below = r.bottom + 70 < innerHeight;
          hand.textContent = below ? '👆' : '👇';
          hand.style.left = `${r.left + r.width / 2 - 24}px`;
          hand.style.top = `${below ? r.bottom - 6 : Math.max(4, r.top - 60)}px`;
          document.body.appendChild(hand);
          el.classList.add('coach-glow');
          setTimeout(() => el.classList.remove('coach-glow'), 6000);
        }
      }, 120);
    },
    clear,
    destroy() { clear(); },
  };
}
