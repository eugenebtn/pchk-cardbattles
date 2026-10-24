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

export const PORT = {
  name: 'port', W: 900, H: 1600,
  colX: (k) => 6 + k * 178, colW: 176,
  ally: { w: 166, h: 210, dx: 5 }, place: { w: 166, h: 92, dx: 5 }, small: { w: 108, h: 136 }, leaderSize: { w: 186, h: 204 },
  y: { oppPlace: 306, oppAlly: 404, myAlly: 716, myPlace: 934 },
  mats: { opp: [2, 298, 896, 322], me: [2, 708, 896, 322] },
  field: [0, 286, 900, 756],
  midY: 662,
  leader: { me: { x: 14, y: 1040 }, opp: { x: 14, y: 82 } },
  support: { me: { x: 216, y: 1046, max: 440 }, opp: { x: 216, y: 112, max: 440 } },
  piles: { myDeck: { x: 676, y: 1048 }, myGrave: { x: 786, y: 1048 }, oppDeck: { x: 676, y: 112 }, oppGrave: { x: 786, y: 112 } },
  names: { me: { x: 216, y: 1196 }, opp: { x: 216, y: 12 } },
  coins: { me: { x: 470, y: 1186 }, opp: { x: 216, y: 52 } },
  round: { x: 8, y: 632 },
  end: { x: 680, y: 626 },
  powers: { x: 604, y: 1176, w: 290, emote: { x: 160, y: 1032 } },
  hint: { x: 10, y: 1252, w: 880, h: 0 },
  log: null,
  hand: { y: 1322, cardW: 200, cardH: 279, width: 860, cx: 450, step: 212 },
  oppHand: { y: -96, cx: 520, step: 30, width: 160 },
  stageCard: { x: 300, y: 420 },
  torches: [],
  bannerY: 560,
  regionLabel: false,
};

// Tall phones get a taller stage: the board moves down a little, my side and the hand more.
const portCache = new Map();
function makePort(H) {
  if (portCache.has(H)) return portCache.get(H);
  const ex = H - 1600, a = Math.round(ex * 0.3), b = Math.round(ex * 0.75);
  const sh = (o, d) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { ...v, y: v.y + d }]));
  const L = {
    ...PORT, H,
    y: Object.fromEntries(Object.entries(PORT.y).map(([k, v]) => [k, v + a])),
    mats: { opp: [PORT.mats.opp[0], PORT.mats.opp[1] + a, PORT.mats.opp[2], PORT.mats.opp[3]], me: [PORT.mats.me[0], PORT.mats.me[1] + a, PORT.mats.me[2], PORT.mats.me[3]] },
    field: [PORT.field[0], PORT.field[1] + a, PORT.field[2], PORT.field[3]],
    midY: PORT.midY + a, round: { ...PORT.round, y: PORT.round.y + a }, end: { ...PORT.end, y: PORT.end.y + a },
    stageCard: { ...PORT.stageCard, y: PORT.stageCard.y + a }, bannerY: PORT.bannerY + a,
    leader: { me: { ...PORT.leader.me, y: PORT.leader.me.y + b }, opp: PORT.leader.opp },
    support: { me: { ...PORT.support.me, y: PORT.support.me.y + b }, opp: PORT.support.opp },
    piles: { ...PORT.piles, myDeck: { ...PORT.piles.myDeck, y: PORT.piles.myDeck.y + b }, myGrave: { ...PORT.piles.myGrave, y: PORT.piles.myGrave.y + b } },
    names: { me: { ...PORT.names.me, y: PORT.names.me.y + b }, opp: PORT.names.opp },
    coins: { me: { ...PORT.coins.me, y: PORT.coins.me.y + b }, opp: PORT.coins.opp },
    hint: { ...PORT.hint, y: PORT.hint.y + b },
    powers: { ...PORT.powers, y: PORT.powers.y + b, emote: { ...PORT.powers.emote, y: PORT.powers.emote.y + b } },
    hand: { ...PORT.hand, y: PORT.hand.y + b + Math.round((ex - b) * 0.3), cardW: PORT.hand.cardW, cardH: PORT.hand.cardH },
  };
  void sh;
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
