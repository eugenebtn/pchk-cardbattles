// Small vector icons (consistent game look instead of system emoji).
const svg = (body, vb = '0 0 24 24') => `<svg class="ico" viewBox="${vb}" aria-hidden="true">${body}</svg>`;
const G = (id, a, b) => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>`;

export const ICON = {
  coin: svg(`${G('gc', '#fff3b8', '#c98a12')}<circle cx="12" cy="12" r="10" fill="url(#gc)" stroke="#5a3a06" stroke-width="1.5"/><circle cx="12" cy="12" r="6.5" fill="none" stroke="#8a5a10" stroke-width="1.2"/><path d="M12 7.5l1.3 2.8 3 .3-2.3 2 .7 3-2.7-1.6-2.7 1.6.7-3-2.3-2 3-.3z" fill="#8a5a10"/>`),
  sword: svg(`<path d="M19.5 2.5l2 2-11 11-2-2z" fill="#e8eef4" stroke="#3a3f46" stroke-width="1"/><path d="M6 12.5l5.5 5.5-1.5 1.5-1.5-1-2.5 2.5-1.5-1.5 2.5-2.5-1-1.5z" fill="#c98a2a" stroke="#4a2c04" stroke-width="1"/>`),
  heart: svg(`<path d="M12 21s-8-5.2-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 10c0 5.8-8 11-8 11z" fill="#e8362a" stroke="#5a0b05" stroke-width="1.4"/><ellipse cx="8.5" cy="8.5" rx="1.8" ry="1.2" fill="#ffb3a8" opacity=".8"/>`),
  shield: svg(`<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" fill="#9aa3ad" stroke="#2b2f33" stroke-width="1.4"/><path d="M12 5l5 2v4c0 3.4-2.2 6.2-5 7.6z" fill="#c7cdd3"/>`),
  bolt: svg(`<path d="M13.5 2L4 13.5h6l-1.5 8.5L20 9.5h-6.5z" fill="#ffd84a" stroke="#6a4a00" stroke-width="1.3" stroke-linejoin="round"/>`),
  burst: svg(`<path d="M12 1.5l2.3 5.6 5.9-1.7-3 5.3 5.3 3-5.9 1.3.9 6-5.5-3.2L6.5 21l.9-6-5.9-1.3 5.3-3-3-5.3 5.9 1.7z" fill="#ff5a2a" stroke="#6a1a04" stroke-width="1.2"/>`),
  run: svg(`<circle cx="15" cy="4" r="2.4" fill="#e6d5ae"/><path d="M10 8.5l4-1 3 3.5 3 .5-.5 2-4-.8-1.5-1.7-1.5 3.5 3 2.5-1 5-2-.4.8-3.8-3.5-2.5-2 4.2H3.5l2.6-5.6 2-4.3z" fill="#e6d5ae"/>`),
  ward: svg(`<circle cx="12" cy="12" r="9" fill="none" stroke="#ffe7a0" stroke-width="2.2"/><circle cx="12" cy="12" r="5.5" fill="#fff3c8" opacity=".55"/><path d="M12 6l1.2 3.6 3.8.1-3 2.3 1.1 3.6L12 13.4 8.9 15.6 10 12l-3-2.3 3.8-.1z" fill="#ffd84a"/>`),
  skull: svg(`<path d="M12 2.5c-5 0-8 3.4-8 7.6 0 2.5 1.3 4.3 2.6 5.3V19h2.6v-2h1.4v2h2.8v-2h1.4v2h2.6v-3.6c1.3-1 2.6-2.8 2.6-5.3 0-4.2-3-7.6-8-7.6z" fill="#e8e0d0" stroke="#3a2a4a" stroke-width="1.2"/><circle cx="8.7" cy="10.5" r="2" fill="#7a2bd9"/><circle cx="15.3" cy="10.5" r="2" fill="#7a2bd9"/>`),
  drop: svg(`<path d="M12 2.5S5 10.5 5 15a7 7 0 0014 0c0-4.5-7-12.5-7-12.5z" fill="#c1121f" stroke="#4a0006" stroke-width="1.3"/><ellipse cx="9.5" cy="14" rx="1.5" ry="2.4" fill="#ff8a8a" opacity=".7"/>`),
  stone: svg(`<path d="M4 15l3-8 6-3 6 4 1 8-5 5H9z" fill="#8a8f96" stroke="#2b2f33" stroke-width="1.3"/><path d="M7 7l4 5 8-4M11 12l-2 9M11 12l9 4" stroke="#5d636a" stroke-width="1" fill="none"/>`),
  target: svg(`<circle cx="12" cy="12" r="9.5" fill="#fff" stroke="#c1121f" stroke-width="2"/><circle cx="12" cy="12" r="6" fill="#c1121f"/><circle cx="12" cy="12" r="2.6" fill="#fff"/>`),
  crate: svg(`<rect x="3" y="5" width="18" height="15" rx="1.5" fill="#b07a3a" stroke="#4a2c0a" stroke-width="1.3"/><path d="M3 10h18M3 15h18M8 5v15M16 5v15" stroke="#6b4518" stroke-width="1.1"/>`),
  star: svg(`<path d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 16.9 5.9 20.4l1.5-6.8L2.2 9l6.9-.7z" fill="#b48cff" stroke="#3a1460" stroke-width="1.2"/>`),
  web: svg(`<g stroke="#e6e6f0" stroke-width="1.1" fill="none"><path d="M12 2v20M2 12h20M4.9 4.9l14.2 14.2M19.1 4.9L4.9 19.1"/><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="9"/></g>`),
  crown: svg(`<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" fill="#ffd84a" stroke="#6a4a00" stroke-width="1.3" stroke-linejoin="round"/>`),
  help: svg(`<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9.2 9a3 3 0 115.2 2c-.9.9-2.4 1.4-2.4 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="17.5" r="1.3" fill="currentColor"/>`),
  menu: svg(`<path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>`),
  hourglass: svg(`<path d="M6 2h12M6 22h12M7 2c0 6 10 6 10 10S7 16 7 22M17 2c0 6-10 6-10 10s10 4 10 10" stroke="#e6d5ae" stroke-width="1.6" fill="none"/>`),
  swords: svg(`<path d="M3 3l9 9M21 3l-9 9M14.5 14.5L20 20M9.5 14.5L4 20" stroke="#e8eef4" stroke-width="2.4" stroke-linecap="round"/><path d="M5 17l2 2M17 19l2-2" stroke="#c98a2a" stroke-width="3" stroke-linecap="round"/>`),
};
export const KW_SVG = { breakthrough: ICON.burst, defense: ICON.shield, maneuver: ICON.run, ward: ICON.ward, fast: ICON.bolt, deathtouch: ICON.skull, bloodsucker: ICON.drop, indestructible: ICON.stone, advantage: ICON.target };
export const TOK_SVG = { blood: ICON.drop, goods: ICON.crate, star: ICON.star, web: ICON.web, coins: ICON.coin };
