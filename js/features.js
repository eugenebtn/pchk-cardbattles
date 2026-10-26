// Features that take the game beyond a circle of friends stay off until the game's authors agree.
// To try them: open the site with ?features=all (remembered in this browser; ?features=off forgets).
const ON = { community: false, tournaments: false, shop: false }; // shop: draft for real-money decks, needs the authors' OK and payments

function load() {
  try {
    const q = new URLSearchParams(location.search).get('features');
    if (q === 'off') localStorage.removeItem('pchk_features');
    else if (q === 'all') localStorage.setItem('pchk_features', 'all');
    return localStorage.getItem('pchk_features') === 'all';
  } catch { return false; }
}
const all = load();
export const FEATURES = { community: ON.community || all, tournaments: ON.tournaments || all, shop: ON.shop || all };
