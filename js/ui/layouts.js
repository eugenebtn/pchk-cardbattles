// Two board layouts: wide (computer, tablet, phone held sideways) and tall (phone held upright).
// All numbers are stage pixels; the stage is scaled to fit the window.

// Board «Таверна В» (approved 2026-10-27, assets/ui/table_tavern.webp): every element stands in the socket painted for it —
// the field in the big frame, Leaders in the round rings, companions and items on the shelves, decks and graveyards
// in the card slots, the round ribbon and the turn seal in the right column, the log in its frame, abilities bottom left.
export const LAND = {
  name: 'land', W: 1600, H: 900,
  colX: (k) => 319 + k * 178, colW: 170,
  ally: { w: 150, h: 182, dx: 13 }, place: { w: 160, h: 78, dx: 8 }, small: { w: 68, h: 76 }, leaderSize: { w: 170, h: 200 },
  y: { oppPlace: 84, oppAlly: 168, myAlly: 358, myPlace: 546 },
  // The battlefield is drawn as one big Place card inside the painted frame.
  field: [315, 75, 888, 553],
  mats: { opp: [325, 82, 868, 266], me: [325, 356, 868, 266] },
  midY: 352,
  leader: { me: { x: 78, y: 468 }, opp: { x: 78, y: 105 } },
  support: { me: { x: 44, y: 381, max: 220 }, opp: { x: 44, y: 296, max: 220 } },
  piles: { myDeck: { x: 1281, y: 655 }, myGrave: { x: 1400, y: 655 }, oppDeck: { x: 1281, y: 95 }, oppGrave: { x: 1400, y: 95 } },
  names: { me: { x: 70, y: 456 }, opp: { x: 70, y: 272 } },
  coins: { me: { x: 250, y: 584 }, opp: { x: 250, y: 222 } },
  round: { x: 1396, y: 234, seal: true }, // «Печать и ступени»: the round ribbon above the turn seal, the order of the round under it
  end: { x: 1334, y: 281 },
  powers: { x: 24, y: 664, w: 266, emote: { x: 262, y: 478 } },
  hint: { x: 1265, y: 470, w: 275, h: 0 },
  log: { x: 1265, y: 481, w: 275, h: 144 }, // the battle log in its painted frame
  hand: { y: 712, cardW: 160, cardH: 223, width: 780, cx: 759, step: 120 },
  oppHand: { y: -92, cx: 1130, step: 26, width: 160 },
  stageCard: { x: 600, y: 180 }, // the played card is shown in the middle of the field, clear of the right column
  torches: [],
  bannerY: 330,
  regionLabel: false,
};

// Phone held upright (390×844 and similar): compact bars for the two Leaders, the whole field in the middle
// with bigger cards, the round and the end-turn button in one row, and a big hand at the bottom.
export const PORT = {
  name: 'port', W: 900, H: 1600,
  colX: (k) => 6 + k * 178, colW: 176,
  ally: { w: 166, h: 236, dx: 5 }, place: { w: 166, h: 76, dx: 5 }, small: { w: 76, h: 96 }, leaderSize: { w: 112, h: 126 },
  y: { oppPlace: 150, oppAlly: 236, myAlly: 512, myPlace: 760 },
  field: [0, 130, 900, 720],
  mats: { opp: [2, 142, 896, 334], me: [2, 504, 896, 334] },
  midY: 494,
  leader: { me: { x: 12, y: 958 }, opp: { x: 12, y: 4 } },
  support: { me: { x: 470, y: 968, max: 200 }, opp: { x: 470, y: 18, max: 120 } },
  piles: { myDeck: { x: 706, y: 960 }, myGrave: { x: 800, y: 960 }, oppDeck: { x: 616, y: 66 }, oppGrave: { x: 676, y: 66 } },
  names: { me: { x: 150, y: 966 }, opp: { x: 150, y: 12 } },
  coins: { me: { x: 150, y: 1010 }, opp: { x: 150, y: 56 } },
  round: { x: 10, y: 868 },
  end: { x: 650, y: 866 },
  powers: { x: 136, y: 1052, w: 330, emote: { x: 396, y: 1004 } },
  hint: { x: 10, y: 1098, w: 880, h: 0 },
  log: null,
  hand: { y: 1232, cardW: 250, cardH: 348, width: 880, cx: 450, step: 190 },
  oppHand: { y: -140, cx: 520, step: 30, width: 160 },
  stageCard: { x: 300, y: 260 },
  torches: [],
  bannerY: 470,
  regionLabel: false,
};

// Taller phones: the field and its cards grow a little, the hand gets the rest of the height.
const portCache = new Map();
function makePort(H) {
  if (portCache.has(H)) return portCache.get(H);
  const ex = Math.max(0, H - 1600);
  const g = Math.min(150, Math.round(ex * 0.34)); // extra height of each ally row
  const f = 2 * g; // the field grows by both rows
  // The hand sits at the bottom edge; its cards grow with what is left.
  const hw = Math.min(310, 250 + Math.round((ex - f) * 0.25)), hh = Math.round(hw * 1.39), hy = H - hh - 18;
  // Whatever is still free between my bar and the hand is split: half above the round row, half below my bar.
  const o = Math.max(0, Math.round((hy - (PORT.hint.y + 60 + f) - 20) / 2));
  const d1 = f + o; // everything under the field moves down by this
  const down = (p, d) => ({ ...p, y: p.y + d });
  const L = {
    ...PORT, H,
    ally: { ...PORT.ally, h: PORT.ally.h + g },
    y: { oppPlace: PORT.y.oppPlace, oppAlly: PORT.y.oppAlly, myAlly: PORT.y.myAlly + g, myPlace: PORT.y.myPlace + f },
    field: [PORT.field[0], PORT.field[1], PORT.field[2], PORT.field[3] + f],
    mats: { opp: [2, 142, 896, 334 + g], me: [2, 504 + g, 896, 334 + g] },
    midY: PORT.midY + g, bannerY: PORT.bannerY + g, stageCard: down(PORT.stageCard, g),
    round: down(PORT.round, d1), end: down(PORT.end, d1),
    leader: { me: down(PORT.leader.me, d1), opp: PORT.leader.opp },
    support: { me: down(PORT.support.me, d1), opp: PORT.support.opp },
    piles: { ...PORT.piles, myDeck: down(PORT.piles.myDeck, d1), myGrave: down(PORT.piles.myGrave, d1) },
    names: { me: down(PORT.names.me, d1), opp: PORT.names.opp },
    coins: { me: down(PORT.coins.me, d1), opp: PORT.coins.opp },
    powers: { ...down(PORT.powers, d1), emote: down(PORT.powers.emote, d1) },
    hint: down(PORT.hint, d1),
    hand: { ...PORT.hand, cardW: hw, cardH: hh, y: hy },
  };
  portCache.set(H, L);
  return L;
}
export function pickLayout() {
  if (window.innerHeight > window.innerWidth * 1.15) {
    const H = Math.round(Math.max(1600, Math.min(2050, 900 * window.innerHeight / window.innerWidth)) / 10) * 10;
    return makePort(H);
  }
  return LAND;
}
