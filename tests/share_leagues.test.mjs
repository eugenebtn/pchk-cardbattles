// node tests/share_leagues.test.mjs — the deck code (share a deck by link) and the league points.
import { test, eq, ok, done } from './helpers.mjs';

globalThis.btoa ??= (s) => Buffer.from(s, 'binary').toString('base64');
globalThis.atob ??= (s) => Buffer.from(s, 'base64').toString('binary');
const { encodeDeck, decodeDeck } = await import('../js/net/deckcode.js');
const { DECKS } = await import('../js/data/decks.js');
const { pointsOf, leagueOf, rankPlayers, nextLeague, LEAGUES } = await import('../js/ui/leagues.js');

const same = (a, b) => [...a].sort((x, y) => x - y).join() === [...b].sort((x, y) => x - y).join();

test('Код колоды: каждая стартовая колода возвращается точно такой же', () => {
  for (const d of Object.values(DECKS)) {
    const back = decodeDeck(encodeDeck({ leader: d.leader, cards: d.main }));
    ok(back && back.leader === d.leader && same(back.cards, d.main), d.key);
  }
});
test('Код колоды: работает и целая ссылка, а мусор и чужие номера карт отвергаются', () => {
  const code = encodeDeck({ leader: 20, cards: [7, 7, 6] });
  ok(same(decodeDeck(`http://pchk-battles.ru/?deck=${code}&dn=Моя`).cards, [7, 7, 6]));
  eq(decodeDeck('Kмусор'), null); eq(decodeDeck(''), null); eq(decodeDeck('hello'), null);
  eq(decodeDeck(encodeDeck({ leader: 7, cards: [7] })), null, 'a non-Leader as Leader');
});
test('Лиги: очки от онлайна и от компьютера, лиги по порогам', () => {
  eq(pointsOf([]), 1000);
  eq(pointsOf([{ mode: 'online', wins: 4, games: 5 }]), 1000 + 100 - 20);
  eq(pointsOf([{ mode: 'bot', wins: 10, games: 10 }]), 1080);
  eq(leagueOf(1099).key, 'bronze'); eq(leagueOf(1100).key, 'silver'); eq(leagueOf(1300).key, 'gold'); eq(leagueOf(1500).key, 'platinum');
  eq(leagueOf(1700).key, 'platinum', 'Челленджер — только для десятки лучших'); eq(leagueOf(1700, 3).key, 'challenger');
  eq(nextLeague(1175, LEAGUES[1]).need, 75);
});
test('Лиги: игрок с двумя режимами считается один раз, лучшие сверху', () => {
  const rows = [
    { player_id: 'a', player_name: 'А', mode: 'online', wins: 30, games: 30, last_game: '2026-10-01' },
    { player_id: 'a', player_name: 'А', mode: 'bot', wins: 5, games: 5, last_game: '2026-10-02' },
    { player_id: 'b', player_name: 'Б', mode: 'bot', wins: 1, games: 3, last_game: '2026-10-03' },
  ];
  const list = rankPlayers(rows);
  eq(list.length, 2); eq(list[0].player_id, 'a'); eq(list[0].points, 1000 + 750 + 40); eq(list[0].league.key, 'challenger'); eq(list[1].league.key, 'bronze');
});

done();
