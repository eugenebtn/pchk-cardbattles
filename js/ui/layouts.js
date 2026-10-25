// Two board layouts: wide (computer, tablet, phone held sideways) and tall (phone held upright).
// All numbers are stage pixels; the stage is scaled to fit the window.

export const LAND = {
  name: 'land', W: 1600, H: 900,
  colX: (k) => 324 + k * 184, colW: 176,
  ally: { w: 150, h: 182, dx: 13 }, place: { w: 160, h: 78, dx: 8 }, small: { w: 84, h: 106 }, leaderSize: { w: 170, h: 200 },
  y: { oppPlace: 60, oppAlly: 146, myAlly: 382, myPlace: 578 },
  // The battlefield is drawn as one big Place card around both sides.
  field: [300, 44, 960, 640],
  mats: { opp: [312, 56, 936, 300], me: [312, 372, 936, 300] },
  midY: 355,
  leader: { me: { x: 56, y: 524 }, opp: { x: 56, y: 14 } },
  support: { me: { x: 24, y: 384, max: 256 }, opp: { x: 24, y: 266, max: 256 } },
  piles: { myDeck: { x: 1300, y: 690 }, myGrave: { x: 1432, y: 690 }, oppDeck: { x: 1300, y: 104 }, oppGrave: { x: 1432, y: 104 } },
  names: { me: { x: 60, y: 494 }, opp: { x: 92, y: 234 } },
  coins: { me: { x: 30, y: 688 }, opp: { x: 30, y: 178 } },
  round: { x: 1296, y: 284 },
  end: { x: 1300, y: 372 },
  powers: { x: 20, y: 756, w: 270, emote: { x: 238, y: 528 } },
  hint: { x: 1296, y: 466, w: 284, h: 0 },
  log: { x: 1296, y: 574, w: 284, h: 96 },
  hand: { y: 712, cardW: 160, cardH: 223, width: 780, cx: 780, step: 120 },
  oppHand: { y: -92, cx: 1130, step: 26, width: 160 },
  stageCard: { x: 630, y: 160 }, // the played card is shown in the middle of the field, clear of the right column
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
