// Looks a player picks in the profile: the avatar (a Leader or a legendary character) and the card back.
// Kept in this browser (pchk_avatar, pchk_back) and in the account profile; sent to the online opponent.
import { CARDS } from '../data/cards.js';

const LEADERS = [20, 41, 62, 63, 117, 118];
// Legendary characters whose card art makes a good round portrait (assets/avatars/<id>.webp, cut from the card art).
const LEGENDS = [3, 4, 15, 16, 30, 31, 42, 43, 44, 69, 77, 84, 86, 87, 88, 93, 97, 98, 101, 112, 113, 119, 121, 123, 127, 129, 137, 139, 146, 153, 156, 158, 164, 166, 167, 174, 175];
export const AVATARS = [...LEADERS.map((id) => `L${id}`), ...LEGENDS.map((id) => `C${id}`)];
export const BACKS = [
  { id: 'classic', name: 'Щит и мечи', file: 'assets/ui/cardback.webp' },
  { id: 'royal', name: 'Корона', file: 'assets/ui/backs/royal.webp' },
  { id: 'vampire', name: 'Кровавая луна', file: 'assets/ui/backs/vampire.webp' },
  { id: 'forest', name: 'Лесной дуб', file: 'assets/ui/backs/forest.webp' },
  { id: 'skull', name: 'Подземелье', file: 'assets/ui/backs/skull.webp' },
];
const abs = (p) => new URL(p, location.href).href;
const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

export const avatarFile = (key) => (/^L\d+$/.test(key || '') ? `assets/leaders/face/${key.slice(1)}.webp` : /^C\d+$/.test(key || '') ? `assets/avatars/${key.slice(1)}.webp` : null);
export const avatarName = (key) => CARDS[Number(String(key).slice(1))]?.name.split(',')[0] || '';
export const backFile = (id) => (BACKS.find((b) => b.id === id) || BACKS[0]).file;
/** My avatar key, or null (then the menu shows the favourite Leader). */
export const myAvatar = () => (AVATARS.includes(read('pchk_avatar')) ? read('pchk_avatar') : null);
export const myBack = () => (BACKS.some((b) => b.id === read('pchk_back')) ? read('pchk_back') : 'classic');
export const setAvatar = (key) => write('pchk_avatar', key);
export const setBack = (id) => write('pchk_back', id);
/** CSS value for a back: an absolute url (a relative one inside a custom property would point at the css folder). */
export const backCss = (id) => `url('${abs(backFile(id))}')`;
/** What I send to the online opponent. */
export const myLooks = () => ({ avatar: myAvatar(), back: myBack() });
/** Only known values from the opponent are used. */
export const cleanLooks = (o) => ({ avatar: AVATARS.includes(o?.avatar) ? o.avatar : null, back: BACKS.some((b) => b.id === o?.back) ? o.back : 'classic' });

/** The «Внешний вид» part of the profile: avatar grid and card backs; onChange after a pick. */
export function looksHtml() {
  const a = myAvatar(), b = myBack();
  // Canvas «Статистика и профиль»: the avatars are folded — the current one and «Сменить», the full set opens on demand.
  return `<div class="pf-looks"><details class="lk-fold"><summary><h3>Аватарка</h3><span class="lk-cur" style="background-image:url('${avatarFile(a) || ''}')"></span><span class="lk-open">Сменить · ${AVATARS.length}</span></summary><div class="lk-avas">${AVATARS.map((k) => `<button class="lk-ava ${k === a ? 'on' : ''}" data-ava="${k}" data-tip="${avatarName(k)}" aria-label="${avatarName(k)}" style="background-image:url('${avatarFile(k)}')"></button>`).join('')}</div></details>
    <h3>Рубашка карт</h3><div class="lk-backs">${BACKS.map((x) => `<button class="lk-back ${x.id === b ? 'on' : ''}" data-cback="${x.id}"><i style="background-image:url('${x.file}')"></i><span>${x.name}</span></button>`).join('')}</div>
    <p class="lk-note">Рубашку видно на вашей колоде, а в партии с живым соперником — и ему. Аватарка видна в меню и сопернику онлайн.</p></div>`;
}
export function bindLooks(root, onChange) {
  root.querySelectorAll('[data-ava]').forEach((x) => { x.onclick = () => { setAvatar(x.dataset.ava); root.querySelectorAll('[data-ava]').forEach((y) => y.classList.toggle('on', y === x)); const cur = root.querySelector('.lk-cur'); if (cur) cur.style.backgroundImage = x.style.backgroundImage; onChange?.(); }; });
  root.querySelectorAll('[data-cback]').forEach((x) => { x.onclick = () => { setBack(x.dataset.cback); root.querySelectorAll('[data-cback]').forEach((y) => y.classList.toggle('on', y === x)); onChange?.(); }; });
}
