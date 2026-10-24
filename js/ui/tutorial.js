// Optional illustrated tutorial (offered on the first visit, also in the menu).
import { CARDS } from '../data/cards.js';
import { ICON } from './icons.js';
import { sfx } from './sound.js';

const img = (id) => CARDS[id]?.img || '';
const card = (id, x, y, r = 0, extra = '') => `<div class="tc" style="background-image:url('${img(id)}');transform:translate(${x}px,${y}px) rotate(${r}deg);--r:${r}deg;animation:tfloat ${3 + Math.random()}s ease-in-out infinite;${extra}"></div>`;
const gem = (cls, n) => `<span style="display:inline-grid;place-items:center;width:30px;height:30px;border-radius:50%;font-family:var(--font-title);color:#fff;text-shadow:0 1px 2px #000;${cls === 'atk' ? 'background:radial-gradient(circle at 38% 30%,#fff6c6,#f3c53e 40%,#b27411)' : 'background:radial-gradient(circle at 38% 30%,#ffd2c6,#f04a32 40%,#a3140a)'}">${n}</span>`;

const STEPS = [
  { title: 'Добро пожаловать в Понию!', art: card(20, -70, 0, -8) + card(41, 70, 10, 8),
    text: `Это дуэль двух <b>Лидеров</b>. Ваша цель — довести здоровье вражеского Лидера до нуля. Здоровье — число в красной капле на портрете (у Сфинктериона 28, у Ларисы 25).` },
  { title: 'Начало хода: карта или монета', art: `<div style="display:flex;gap:18px;font-size:70px">🂠${ICON.coin}</div>`,
    text: `В начале каждого хода вы берёте <b>две вещи</b>: карту из колоды или монету — в любом сочетании. Монеты ${ICON.coin} нужны, чтобы разыгрывать карты, и не сгорают между ходами. Места на поле приносят монеты каждый ход.` },
  { title: 'Разыгрываем карты', art: card(9, -80, 10, -6) + card(11, 0, -10, 0) + card(7, 80, 10, 6),
    text: `Цена карты — в кружке слева вверху. Карты, которые можно сыграть, светятся <b style="color:#6fe08a">зелёным</b>. <b>Союзники</b> встают в ближний ряд и сражаются. <b>Места</b> — в дальний, приносят монеты. <b>Действия</b> срабатывают сразу. <b>Напарники и Предметы</b> помогают Лидеру.` },
  { title: 'Поле: 5 регионов', art: `<div style="display:grid;grid-template-columns:repeat(5,44px);gap:6px">${Array.from({ length: 10 }, (_, k) => `<div style="height:${k < 5 ? 56 : 30}px;border-radius:${k < 5 ? '50%/46%' : '6px'};background:rgba(255,230,180,.15);border:1px dashed #c8a058"></div>`).join('')}</div>`,
    text: `Поле разделено на <b>5 регионов</b>. В каждом у вас одна ячейка для Союзника и одна для Места. Союзник бьётся с тем, кто стоит <b>прямо напротив</b>. Если напротив пусто — он бьёт вражеского Лидера.` },
  { title: '⚔ Сражение', art: card(15, -60, 0, -6) + card(28, 60, 0, 6),
    text: `Раунд — это ход первого игрока, ход второго и <b>Сражение</b>. В бою союзники напротив друг друга бьют одновременно: жёлтое число ${gem('atk', 3)} — атака, красное ${gem('hp', 4)} — здоровье. Раны остаются между ходами. После раунда очерёдность меняется.` },
  { title: '⚡ Опережение', art: card(21, -50, 0, -6) + card(23, 50, 0, 6),
    text: `Карты и свойства со значком <b>⚡ Опережение</b> можно играть в ход соперника — в ответ на его карту или в бою. Ваш ответ сработает <b>раньше</b>. Игра сама покажет окно «Можно ответить», а кнопка ⚡ сверху отключает эти вопросы.` },
  { title: 'Подсказки всегда рядом', art: `<div style="display:grid;gap:10px;font-size:18px;text-align:left"><span>💡 Строка подсказки: что делать сейчас</span><span>🖱 Наведите на слово или значок — объяснение</span><span>👆 Нажмите на карту — крупно и с кнопками</span><span>🗣 Нажмите на своего Лидера — реплики</span></div>`,
    text: `Внизу всегда есть <b>строка-подсказка</b>. Наведите мышку на любое подчёркнутое слово (например, «Легенда») или значок — появится объяснение. Кнопка ${ICON.help} в игре открывает правила.` },
];

/** Shows the tutorial in a modal. onPlay() starts a practice game. */
export function showTutorial(onPlay, onClose) {
  let k = 0;
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.style.cssText = 'position:fixed;inset:0;z-index:400';
  document.body.appendChild(back);
  const draw = () => {
    const s = STEPS[k];
    back.innerHTML = `<div class="modal tut"><h3>${s.title}</h3><div class="tut-step">Шаг ${k + 1} из ${STEPS.length}</div>
      <div class="tut-body"><div class="tut-art">${s.art}</div><div class="tut-text">${s.text}</div></div>
      <div class="tut-dots">${STEPS.map((_, i) => `<span class="${i === k ? 'on' : ''}"></span>`).join('')}</div>
      <div class="row-btns">${k > 0 ? '<button class="btn" data-prev>← Назад</button>' : '<button class="btn small" data-skip>В меню</button><button class="btn" data-play>Сразу играть с подсказками</button>'}
      ${k < STEPS.length - 1 ? '<button class="btn primary" data-next>Дальше →</button>' : '<button class="btn primary" data-play>⚔ Сыграть учебную партию</button><button class="btn" data-skip>В меню</button>'}</div></div>`;
    back.querySelector('[data-next]')?.addEventListener('click', () => { sfx.select(); k++; draw(); });
    back.querySelector('[data-prev]')?.addEventListener('click', () => { sfx.click(); k--; draw(); });
    back.querySelectorAll('[data-skip]').forEach((b) => b.addEventListener('click', () => { sfx.click(); back.remove(); onClose && onClose(); }));
    back.querySelectorAll('[data-play]').forEach((b) => b.addEventListener('click', () => { sfx.confirm(); back.remove(); onPlay && onPlay(); }));
  };
  draw();
}
