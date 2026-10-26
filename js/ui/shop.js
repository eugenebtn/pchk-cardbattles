// «Магазин» (draft, hidden behind FEATURES.shop): showcase of decks. Upcoming decks are «Скоро» with «Напомнить»;
// the six starter decks are free and already «Ваши». No payments yet — «Купить» only says so.
import { SHOP } from '../data/shop.js';
import { DECKS } from '../data/decks.js';
import { CARDS } from '../data/cards.js';
import { esc } from './board.js';

const RKEY = 'pchk_shop_remind';
const reminded = () => { try { return JSON.parse(localStorage.getItem(RKEY) || '[]'); } catch { return []; } };
const setReminded = (a) => { try { localStorage.setItem(RKEY, JSON.stringify(a)); } catch { /* private mode */ } };
const rub = (p) => `${p.toLocaleString('ru-RU')} ₽`;

export function renderShop(root, onBack, { onPlay, onDecks, toast } = {}) {
  const item = (x) => {
    const on = reminded().includes(x.key);
    const btn = x.state === 'soon'
      ? `<button class="btn small ${on ? '' : 'primary'}" data-remind="${x.key}">${on ? '✓ Напомним' : '🔔 Напомнить'}</button>`
      : `<button class="btn small primary" data-buy="${x.key}">Купить · ${rub(x.price)}</button>`;
    return `<div class="shop-item soon"><div class="shop-art"><span>?</span></div><div class="shop-tx">
      <span class="shop-tag">Скоро</span><b>${esc(x.title)}</b><p>${esc(x.note)}</p></div><div class="shop-act">${btn}</div></div>`;
  };
  const starter = (d) => `<div class="shop-item own"><div class="shop-art" style="background-image:url('assets/leaders/${d.leader}.webp')"></div><div class="shop-tx">
      <span class="shop-tag own">Ваша · бесплатно</span><b>${esc(d.title || CARDS[d.leader]?.name || d.key)}</b><p>Лидер ${esc(CARDS[d.leader]?.name || '')}. ${d.main.length} карт${d.side?.length ? ` + ${d.side.length} в запасе` : ''}.</p></div>
      <div class="shop-act"><button class="btn small" data-play="${d.key}">Играть</button></div></div>`;
  const draw = () => {
    root.innerHTML = `<div class="shop-box legal-box">
      <button class="btn small" data-back>← Назад</button>
      <h2>Магазин</h2>
      <p class="shop-draft">Черновик: оплата не подключена, страница видна только для проверки.</p>
      <h3>Скоро</h3><div class="shop-list">${SHOP.map(item).join('')}</div>
      <h3>Уже у вас</h3><div class="shop-list">${Object.values(DECKS).map(starter).join('')}</div>
      <p class="shop-foot">Покупки привязываются к аккаунту и открывают карты набора в конструкторе. Оплата — картой или СБП на странице платёжной системы, данные карты сайт не видит.<br>
      <button class="btn small" data-restore>Восстановить покупки</button> <button class="btn small" data-decks>Мои колоды</button></p>
    </div>`;
    root.querySelector('[data-back]').onclick = onBack;
    root.querySelector('[data-decks]').onclick = () => onDecks && onDecks();
    root.querySelector('[data-restore]').onclick = () => toast && toast('Покупок пока нет — магазин ещё не запущен');
    root.querySelectorAll('[data-remind]').forEach((b) => b.onclick = () => {
      const k = b.dataset.remind, a = reminded();
      setReminded(a.includes(k) ? a.filter((x) => x !== k) : [...a, k]);
      if (!a.includes(k)) toast && toast('Напомним в меню, когда колода выйдет');
      draw();
    });
    root.querySelectorAll('[data-buy]').forEach((b) => b.onclick = () => toast && toast('Оплата пока не подключена', 3500));
    root.querySelectorAll('[data-play]').forEach((b) => b.onclick = () => onPlay && onPlay(b.dataset.play));
  };
  draw();
}
