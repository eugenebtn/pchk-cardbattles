import { deckError } from './deck-picker.js';

// Retain the existing storage format. A failed browser write must not look like a save.
export function saveCustomDeck(store, current, editIndex = -1, original = null) {
  const error = deckError(current);
  if (error) return { ok: false, error };
  const deck = { name: String(current.name || 'Моя колода').trim() || 'Моя колода', leader: current.leader, cards: [...current.cards] };
  try {
    const stored = store.get('decks', []);
    if (!Array.isArray(stored)) throw Error('storage');
    const list = [...stored];
    const signature = d => JSON.stringify([d?.name, d?.leader, d?.cards]);
    const same = d => signature(d) === signature(deck);
    let index;
    if (editIndex >= 0) {
      index = original ? list.findIndex(d => signature(d) === signature(original)) : -1;
      if (index < 0) return {ok:false,error:'Исходная колода изменилась или исчезла в другом окне. Текущий состав остался в редакторе; соседние колоды не изменены.'};
    } else index = list.findIndex(same);
    if (index < 0) { index = list.length; list.push(deck); } else list[index] = deck;
    store.set('decks', list);
    if (JSON.stringify(store.get('decks', [])) !== JSON.stringify(list)) throw Error('storage');
    return { ok: true, deck, index, list };
  } catch { return { ok: false, error: 'Не удалось сохранить колоду в браузере. Проверьте свободное место и разрешение на хранение данных.' }; }
}
