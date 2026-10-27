// Our own confirm and prompt windows (canvas «Подтверждение «Сдаться?»»), instead of the browser's grey ones.
// askConfirm({ title, text, yes, no, danger, icon }) → Promise<boolean>; askText({ title, text, value, placeholder, yes, readonly }) → Promise<string|null>.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function open(html, onKey) {
  const prev = document.activeElement;
  const b = document.createElement('div');
  b.className = 'modal-back k-dialog'; b.style.cssText = 'position:fixed;inset:0;z-index:950';
  b.innerHTML = `<div class="modal win-k" role="dialog" aria-modal="true" style="max-width:480px;width:94vw">${html}</div>`;
  document.body.appendChild(b);
  const close = () => { b.remove(); document.removeEventListener('keydown', key, true); prev?.focus?.(); };
  const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onKey('esc'); } else if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); e.stopPropagation(); onKey('enter'); } };
  document.addEventListener('keydown', key, true);
  return { b, close };
}

/** Yes / no. «danger» makes the yes button red (only for what cannot be undone); otherwise it is gold. */
export function askConfirm({ title = 'Вы уверены?', text = '', yes = 'Да', no = 'Отмена', danger = false, icon = '' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; d.close(); resolve(v); };
    const d = open(`<div class="k-dlg-head">${icon ? `<div class="k-dlg-ico">${icon}</div>` : ''}<h3>${esc(title)}</h3></div>
      ${text ? `<p class="k-dlg-text">${esc(text)}</p>` : ''}
      <div class="k-dlg-btns"><button class="btn" data-no>${esc(no)}</button><button class="btn ${danger ? 'danger' : 'primary'}" data-yes>${esc(yes)}</button></div>`,
    (k) => finish(k === 'enter'));
    d.b.querySelector('[data-no]').onclick = () => finish(false);
    d.b.querySelector('[data-yes]').onclick = () => finish(true);
    d.b.addEventListener('click', (e) => { if (e.target === d.b) finish(false); });
    (danger ? d.b.querySelector('[data-no]') : d.b.querySelector('[data-yes]')).focus();
  });
}

/** A text field. With readonly it shows a value to copy by hand (selected) and resolves null when closed. */
export function askText({ title = '', text = '', value = '', placeholder = '', yes = 'Готово', no = 'Отмена', readonly = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; d.close(); resolve(v); };
    const d = open(`<div class="k-dlg-head"><h3>${esc(title)}</h3></div>
      ${text ? `<p class="k-dlg-text">${esc(text)}</p>` : ''}
      <input type="text" class="k-dlg-input" value="${esc(value)}" placeholder="${esc(placeholder)}" ${readonly ? 'readonly' : ''} autocomplete="off" spellcheck="false">
      <div class="k-dlg-btns">${readonly ? `<button class="btn primary" data-no>Закрыть</button>` : `<button class="btn" data-no>${esc(no)}</button><button class="btn primary" data-yes>${esc(yes)}</button>`}</div>`,
    (k) => finish(k === 'enter' && !readonly ? d.b.querySelector('input').value : null));
    const inp = d.b.querySelector('input');
    d.b.querySelector('[data-no]').onclick = () => finish(null);
    d.b.querySelector('[data-yes]')?.addEventListener('click', () => finish(inp.value));
    d.b.addEventListener('click', (e) => { if (e.target === d.b) finish(null); });
    inp.focus(); if (readonly) inp.select();
  });
}

/** The white flag on a grey Leader face — for «Сдаться?» and «Выйти из партии?». */
export const FLAG_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 22V3M5 4c4-2 7 2 11 0 2-1 3-1 3-1v9s-1 0-3 1c-4 2-7-2-11 0"/></svg>';
