// Two board layouts: wide (computer, tablet, phone held sideways) and tall (phone held upright).
// All numbers are stage pixels; the stage is scaled to fit the window.

export const LAND = {
  name: 'land', W: 1600, H: 900,
  colX: (k) => 394 + k * 164, colW: 158,
  ally: { w: 140, h: 178, dx: 9 }, place: { w: 150, h: 84, dx: 4 }, small: { w: 84, h: 106 }, leaderSize: { w: 160, h: 176 },
  y: { oppPlace: 102, oppAlly: 194, myAlly: 474, myPlace: 664 },
  mats: { opp: [384, 96, 832, 290], me: [384, 468, 832, 290] },
  midY: 428,
  leader: { me: { x: 30, y: 700 }, opp: { x: 30, y: 20 } },
  support: { me: { x: 20, y: 556, max: 330 }, opp: { x: 20, y: 196, max: 330 } },
  piles: { myDeck: { x: 1236, y: 726 }, myGrave: { x: 1350, y: 726 }, oppDeck: { x: 1236, y: 64 }, oppGrave: { x: 1350, y: 64 } },
  names: { me: { x: 200, y: 716 }, opp: { x: 200, y: 26 } },
  coins: { me: { x: 200, y: 756 }, opp: { x: 200, y: 64 } },
  round: { x: 1236, y: 396 },
  end: { x: 1356, y: 388 },
  powers: { x: 196, y: 800, w: 190, emote: { x: 150, y: 700 } },
  hint: { x: 14, y: 312, w: 356, h: 0 },
  log: { x: 14, y: 430, w: 356, h: 112 },
  hand: { y: 760, cardW: 160, cardH: 223, width: 800, cx: 800, step: 124 },
  oppHand: { y: -80, cx: 800, step: 64, width: 520 },
  stageCard: { x: 1050, y: 210 },
  torches: [[346, 60], [1218, 60], [346, 700], [1218, 700]],
  bannerY: 330,
  regionLabel: true,
};

export const PORT = {
  name: 'port', W: 900, H: 1600,
  colX: (k) => 6 + k * 178, colW: 176,
  ally: { w: 166, h: 210, dx: 5 }, place: { w: 166, h: 92, dx: 5 }, small: { w: 108, h: 136 }, leaderSize: { w: 186, h: 204 },
  y: { oppPlace: 306, oppAlly: 404, myAlly: 716, myPlace: 934 },
  mats: { opp: [2, 298, 896, 322], me: [2, 708, 896, 322] },
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
