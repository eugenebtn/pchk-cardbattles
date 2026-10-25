// Rules engine for «Карточные битвы ПЧК».
// The whole game runs as one generator: every decision a player must make is `yield`ed
// as a request; `respond()` feeds the answer back. The same engine serves the bot,
// hot-seat play and the online host, and runs unchanged in Node for tests.
import { CARDS } from '../data/cards.js';
import { SCRIPTS } from '../cards/index.js';

export const REGIONS = 5;
export const HAND_LIMIT = 10;

class GameOver extends Error { constructor() { super('game over'); } }

// Small seeded RNG (mulberry32) so games can be replayed and shared.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KW_RU = {
  breakthrough: 'Прорыв', defense: 'Оборона', maneuver: 'Манёвр', ward: 'Оберег', fast: 'Опережение',
  deathtouch: 'Смертельный удар', bloodsucker: 'Кровопийца', indestructible: 'Нерушимость', created: 'Созданная',
  advantage: 'Преимущество',
};
export { KW_RU };

export function defOf(id) {
  const base = CARDS[id];
  if (!base) throw new Error('unknown card ' + id);
  return base;
}

export class Game {
  /**
   * @param {object} cfg
   *  players: [{name, leader:id, deck:[ids]}, {..}]
   *  seed: number
   *  options: { mulliganBonus: bool, first: 0|1|undefined }
   */
  constructor(cfg) {
    this.cfg = cfg;
    this.seedUsed = cfg.seed ?? (Date.now() & 0xffffffff);
    this.rand = rng(this.seedUsed);
    this.history = []; // every accepted answer, so the game can be replayed (used for previews)
    this.events = [];      // animation/log events, consumed by the UI
    this.seq = 0;
    this.listeners = [];
    const s = this.s = {
      uid: 0, round: 0, phaseId: 0, phase: 'setup', turn: null, first: 0,
      battleNo: 0, inBattle: false, battleRegion: null, battled: [],
      skipBattles: 0, stack: [], winner: null, over: false, log: [],
      players: [], cards: {},
    };
    cfg.players.forEach((pc, i) => {
      const p = {
        i, name: pc.name || `Игрок ${i + 1}`, coins: 5, deck: [], hand: [], grave: [], exile: [],
        regions: Array.from({ length: REGIONS }, () => ({ ally: null, place: null })),
        support: [], leader: null, usedThisTurn: 0, usedThisPhase: 0, freeFastPhase: -1,
        openHand: false, flags: {},
      };
      s.players.push(p);
      p.leader = this.newInst(pc.leader, i, 'leader');
      const ld = defOf(pc.leader);
      p.leader.hpNow = ld.hp;
      for (const id of pc.deck) p.deck.push(this.newInst(id, i, 'deck'));
    });
    this.gen = this.run();
    this.pending = null;
    this.step(undefined);
  }

  // ---------- instances & definitions ----------
  newInst(id, owner, zone) {
    const inst = {
      uid: ++this.s.uid, id, owner, ctrl: owner, zone, region: null, slot: null,
      dmg: 0, mods: [], kws: [], tok: {}, stunUntil: -1, created: false, equip: null,
      extraTypes: [], enteredAt: 0, x: {}, used: {},
    };
    this.s.cards[inst.uid] = inst;
    return inst;
  }
  card(uid) { return this.s.cards[uid]; }
  def(inst) { const d = defOf(inst.id); return d; }
  script(inst) { return SCRIPTS[inst.id] || {}; }
  P(i) { return this.s.players[i]; }
  opp(i) { return 1 - i; }
  name(inst) { return this.def(inst).name; }

  // ---------- driver ----------
  step(answer) {
    let r;
    try {
      r = this.gen.next(answer);
    } catch (e) {
      if (e instanceof GameOver) { this.pending = null; this.notify(); return; }
      throw e;
    }
    if (r.done) { this.pending = null; this.notify(); return; }
    this.pending = r.value;
    this.notify();
  }
  onChange(fn) { this.listeners.push(fn); }
  notify() { for (const fn of this.listeners) fn(this); }

  /** Answer the pending request. Returns false if the answer is not valid. */
  respond(player, answer) {
    // «Сдаться» is accepted at any moment from either player, and kept in the history like any answer (replays repeat it).
    if (answer && typeof answer === 'object' && !Array.isArray(answer) && answer.concede != null) return this.concede(answer.concede);
    const q = this.pending;
    if (!q || q.player !== player) return false;
    if (!this.validAnswer(q, answer)) return false;
    this.history.push(answer);
    this.step(answer);
    this.applyPre();
    return true;
  }
  // ---------- starting hands chosen at the same time ----------
  // Both hands are dealt at once; the engine still asks one player after the other, but the other player may answer
  // early (preRespond). The early answer waits here and is applied when the engine asks — so the history keeps its order.
  /** The starting-hand question a player can already answer while the other one is choosing (null if none). */
  preQuestion(player) {
    const p = this.s.players[player], q = this.pending;
    if (this.s.phase !== 'setup' || !p?.mull || this.pre?.[player] != null || (q && q.player === player)) return null;
    const keep = Math.min(5, p.mull.length), canMull = (p.mullN ?? 0) - 2 > 0;
    return { type: 'mulligan', player, pre: true, prompt: `Оставьте ${keep} карт${canMull ? ' или смените руку (муллиган)' : ''}`, options: p.mull.map((c) => ({ id: c.uid })), keep, canMull };
  }
  preRespond(player, answer) {
    const pq = this.preQuestion(player);
    if (!pq || !this.validAnswer(pq, answer)) return false;
    (this.pre ||= {})[player] = answer;
    this.applyPre();
    return true;
  }
  applyPre() {
    for (let q = this.pending; q && q.type === 'mulligan' && this.pre?.[q.player] != null; q = this.pending) {
      const a = this.pre[q.player]; delete this.pre[q.player];
      if (!this.validAnswer(q, a)) break;
      this.history.push(a); this.step(a);
    }
  }
  validAnswer(q, a) {
    if (q.type === 'mulligan') {
      if (a === 'mulligan') return q.canMull;
      if (!Array.isArray(a) || a.length !== q.keep || new Set(a).size !== a.length) return false;
      const ids = new Set(q.options.map((o) => o.id));
      return a.every((x) => ids.has(x));
    }
    if (q.type === 'multi') {
      if (!Array.isArray(a)) return false;
      if (a.length < q.min || a.length > q.max) return false;
      const ids = new Set(q.options.map((o) => o.id));
      return a.every((x) => ids.has(x)) && new Set(a).size === a.length;
    }
    if (q.type === 'order') return Array.isArray(a) && a.length === q.options.length;
    if (a === null && q.cancel) return true;
    return q.options.some((o) => o.id === a);
  }

  // A request to a player. Answer is returned from `yield`.
  *ask(player, req) {
    req.player = player;
    if (!req.type) req.type = 'pick';
    if (req.src == null && this.acting) req.src = this.acting.uid;
    if (req.srcId == null) req.srcId = this.acting && this.acting.uid === req.src ? this.acting.id : req.src != null ? this.card(req.src)?.id : undefined;
    if (req.type === 'pick' && req.options.length === 0) return null;
    if (req.type === 'pick' && req.options.length === 1 && req.auto !== false && !req.cancel) return req.options[0].id;
    return yield req;
  }

  // ---------- events for UI ----------
  emit(type, data = {}) {
    const ev = { seq: ++this.seq, type, ...data };
    this.events.push(ev);
    if (this.events.length > 4000) this.events.splice(0, 1000);
    if (data.log) {
      this.s.log.push(data.log);
      // Who acted and on whom, so the history can show the cards (kept in step with the text lines).
      const ref = (u) => { const c = u != null ? this.card(u) : null; return c ? { uid: c.uid, id: c.id, ctrl: c.ctrl } : null; };
      const src = data.src != null ? ref(data.src) : data.uid != null ? ref(data.uid) : null;
      const tgts = [data.tgt, ...(data.targets || [])].map(ref).filter(Boolean);
      if (!this.s.logRefs) this.s.logRefs = [];
      this.s.logRefs.push(src || tgts.length ? { src: src || (data.id != null ? { id: data.id, ctrl: data.player } : null), tgts, type } : null);
      if (this.s.log.length > 300) { this.s.log.shift(); this.s.logRefs.shift(); }
    }
    return ev;
  }
  log(text) { this.emit('log', { log: text }); }
  fx(name, src, tgt, extra = {}) {
    this.emit('fx', { fx: name, src: src?.uid ?? src, tgt: Array.isArray(tgt) ? tgt.map((t) => t?.uid ?? t) : (tgt?.uid ?? tgt), ...extra });
  }

  // ---------- queries ----------
  leader(p) { return this.P(p).leader; }
  allies(p = null) {
    const out = [];
    for (const pl of this.s.players) if (p == null || pl.i === p) for (const r of pl.regions) if (r.ally) out.push(r.ally);
    return out;
  }
  places(p = null) {
    const out = [];
    for (const pl of this.s.players) if (p == null || pl.i === p) for (const r of pl.regions) if (r.place) out.push(r.place);
    return out;
  }
  companions(p = null) {
    return this.s.players.filter((pl) => p == null || pl.i === p).flatMap((pl) => pl.support.filter((c) => this.cardType(c) === 'companion'));
  }
  items(p = null) {
    return this.s.players.filter((pl) => p == null || pl.i === p).flatMap((pl) => pl.support.filter((c) => this.cardType(c) === 'item'));
  }
  /** Every card on the battlefield (leader zone + regions), optionally one side. */
  field(p = null) {
    const out = [];
    for (const pl of this.s.players) {
      if (p != null && pl.i !== p) continue;
      out.push(pl.leader, ...pl.support);
      for (const r of pl.regions) { if (r.ally) out.push(r.ally); if (r.place) out.push(r.place); }
    }
    return out;
  }
  characters(p = null) {
    return this.field(p).filter((c) => ['ally', 'companion', 'leader'].includes(this.cardType(c)));
  }
  cardType(inst) { return this.def(inst).type; }
  types(inst) { return [...this.def(inst).subtypes, ...inst.extraTypes]; }
  isType(inst, t) { return this.types(inst).includes(t); }
  onField(inst) { return inst && ['field', 'support', 'leader'].includes(inst.zone); }
  regionOf(inst) { return inst.zone === 'field' ? inst.region : null; }
  adjacent(r) { return [r - 1, r + 1].filter((x) => x >= 0 && x < REGIONS); }
  allyAt(p, r) { return this.P(p).regions[r].ally; }
  placeAt(p, r) { return this.P(p).regions[r].place; }
  /** Count your cards on the battlefield with a subtype (for «Разговор с …»). */
  countType(p, t) { return this.field(p).filter((c) => this.isType(c, t)).length; }
  isLegend(inst) { return this.def(inst).legend || this.hasGranted(inst, 'legend'); }
  /** Would putting this card onto player i's field make two Legends with one name? (then don't offer it) */
  legendClash(i, inst) { return this.isLegend(inst) && this.field(i).some((x) => x !== inst && this.def(x).name === this.def(inst).name); }

  /**
   * What an ally would look like in region r (attack, health, keywords from Places and other always-on effects),
   * found by putting it there for a moment and reading the numbers. Nothing is triggered.
   */
  previewAlly(i, c, side, r) {
    const p = this.P(i), save = { id: c.id, zone: c.zone, region: c.region, slot: c.slot, ctrl: c.ctrl }, prev = p.regions[r].ally;
    try {
      c.id = side; c.zone = 'field'; c.region = r; c.slot = 'ally'; c.ctrl = i; p.regions[r].ally = c;
      const d = defOf(side);
      const kws = Object.keys(KW_RU).filter((k) => this.has(c, k) && !d.kw.includes(k));
      const place = this.placeAt(i, r);
      return { atk: this.atk(c), hp: this.maxHp(c), baseAtk: d.atk ?? 0, baseHp: d.hp ?? 0, kws, place: place ? place.id : null };
    } catch { return null; } finally {
      p.regions[r].ally = prev; Object.assign(c, save);
    }
  }
  /**
   * Exact preview: replay the whole game in a copy (it is deterministic: same seed, same answers), put the ally
   * into region r, let its «when it enters» effects run (default answers), and read its attack, health, keywords.
   */
  replayPreview(i, c, side, r) {
    try {
      const g2 = new Game({ ...this.cfg, seed: this.seedUsed, options: { ...this.cfg.options, previews: false } });
      for (const a of this.history) { if (!g2.pending || !g2.respond(g2.pending.player, a)) return null; }
      if (g2.pending?.type !== 'region') return null;
      // If the outcome depends on chance or on hidden cards (deck, hands), the preview would give it away:
      // then fall back to the plain «always-on bonuses» preview.
      const fake = g2.cfg.options; if (fake) fake.fakeStops = null;
      let chance = false; const rnd = g2.rand; g2.rand = () => { chance = true; return rnd(); };
      const hidden = () => g2.s.players.map((p) => [p.deck.length, p.deck[0]?.uid, ...p.hand.map((x) => x.uid).filter((u) => u !== c.uid)].join(',')).join('|');
      const before = hidden();
      if (!g2.respond(i, r)) return null;
      for (let k = 0; k < 300 && g2.pending && !g2.s.over; k++) {
        const q = g2.pending;
        if (q.type === 'main' && g2.s.stack.length === 0) break;
        let a;
        if (q.type === 'priority') a = 'pass';
        else if (q.type === 'multi') a = q.options.slice(0, q.min).map((o) => o.id);
        else if (q.type === 'mulligan' || q.type === 'draw' || q.type === 'main') return null;
        else a = q.options[0]?.id ?? null;
        if (!g2.respond(q.player, a) && !(q.cancel && g2.respond(q.player, null))) return null;
      }
      const c2 = g2.card(c.uid);
      if (!c2 || !g2.onField(c2)) return null;
      if (chance || hidden() !== before) return null;
      const d = defOf(side);
      const kws = Object.keys(KW_RU).filter((k) => g2.has(c2, k) && !d.kw.includes(k));
      const place = g2.placeAt(i, r);
      return { atk: g2.atk(c2), hp: g2.maxHp(c2), baseAtk: d.atk ?? 0, baseHp: d.hp ?? 0, kws, place: place ? place.id : null };
    } catch { return null; }
  }
  statics() {
    // [{inst, s}] for every card on the battlefield with a static block, plus equipment.
    const out = [];
    for (const c of this.field()) { const sc = this.script(c); if (sc.static) out.push({ inst: c, s: sc.static }); }
    return out;
  }
  atk(inst) {
    const d = this.def(inst);
    let a = (d.atk ?? 0);
    for (const m of inst.mods) a += m.atk || 0;
    for (const { inst: src, s } of this.statics()) if (s.atk) a += s.atk(this, src, inst) || 0;
    if (inst.x.doubleAtk === this.s.phaseId) a *= 2;
    return Math.max(0, a);
  }
  maxHp(inst) {
    if (this.cardType(inst) === 'leader') return this.def(inst).hp;
    const d = this.def(inst);
    let h = (d.hp ?? 0);
    for (const m of inst.mods) h += m.hp || 0;
    for (const { inst: src, s } of this.statics()) if (s.hp) h += s.hp(this, src, inst) || 0;
    return h;
  }
  hp(inst) { return this.cardType(inst) === 'leader' ? inst.hpNow : this.maxHp(inst) - inst.dmg; }
  hasGranted(inst, kw) { return inst.kws.some((k) => k.kw === kw); }
  has(inst, kw) {
    if (!inst) return false;
    if (this.def(inst).kw.includes(kw) || this.hasGranted(inst, kw)) return true;
    for (const { inst: src, s } of this.statics()) if (s.kw && s.kw(this, src, inst, kw)) return true;
    return false;
  }
  stunned(inst) { return inst.stunUntil >= this.s.battleNo + (this.s.inBattle ? 0 : 1); }
  tokens(inst, t) { return inst.tok[t] || 0; }

  // ---------- durations ----------
  // until: 'perm' | 'phase' | 'battle' | 'nextTurn' (start of controller's next turn)
  untilTag(until, inst) {
    if (until === 'phase') return { phase: this.s.phaseId };
    if (until === 'battle') return { battle: this.s.battleNo, phase: this.s.inBattle ? this.s.phaseId : null };
    if (until === 'nextTurn') return { turnOf: inst ? inst.ctrl : this.s.turn };
    return null;
  }
  expire(pred) {
    for (const c of Object.values(this.s.cards)) {
      const ends = c.mods.filter((m) => m.until && pred(m.until));
      // Temporary health is spent first (house rule, 2026-10-25): when a temporary bonus ends, the wounds it absorbed go with it,
      // so a card never dies only because its bonus ran out.
      const tmp = ends.reduce((n, m) => n + Math.max(0, m.hp || 0), 0);
      if (tmp > 0 && c.dmg > 0 && ['ally', 'companion'].includes(this.cardType(c))) c.dmg = Math.max(0, c.dmg - tmp);
      c.mods = c.mods.filter((m) => !(m.until && pred(m.until)));
      c.kws = c.kws.filter((k) => !(k.until && pred(k.until)));
    }
  }

  // ---------- main flow ----------
  *run() {
    try {
      yield* this.setup();
      for (;;) {
        this.s.round++;
        const f = this.s.first;
        this.emit('round', { round: this.s.round, first: f, log: `Раунд ${this.s.round}. Первым ходит ${this.P(f).name}.` });
        yield* this.playerTurn(f);
        yield* this.playerTurn(1 - f);
        if (this.s.skipBattles > 0) {
          this.s.skipBattles--;
          this.emit('battleSkipped', { log: 'Сражение пропущено.' });
        } else {
          yield* this.battlePhase();
        }
        this.s.first = 1 - this.s.first;
      }
    } catch (e) {
      if (e instanceof GameOver) return;
      throw e;
    }
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(this.rand() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }

  *setup() {
    const s = this.s;
    s.phase = 'setup';
    for (const p of s.players) this.shuffle(p.deck);
    s.first = this.cfg.options?.first ?? (this.rand() < 0.5 ? 0 : 1);
    if (this.cfg.options?.skipSetup) {
      // Tests set up the position first, then answer 'go'.
      yield* this.ask(s.first, { type: 'pick', prompt: 'Начать', options: [{ id: 'go' }], auto: false, begin: true });
      this.emit('ready', {}); return;
    }
    const roll = [1 + Math.floor(this.rand() * 20), 1 + Math.floor(this.rand() * 20)];
    this.emit('setup', { first: s.first, log: `Бросок d20. Первым ходит ${this.P(s.first).name}.` });
    // Both starting hands are dealt at once, so both players can choose at the same time (see preQuestion).
    const deal = (p, n) => { const drawn = p.deck.splice(0, Math.min(n, p.deck.length)); drawn.forEach((c) => { c.zone = 'mull'; }); p.mull = drawn; p.mullN = n; };
    for (const i of [s.first, 1 - s.first]) deal(this.P(i), i === s.first ? 12 : 10);
    for (const i of [s.first, 1 - s.first]) {
      const p = this.P(i);
      let n = p.mullN;
      for (;;) {
        const drawn = p.mull;
        const keep = Math.min(5, drawn.length);
        const canMull = n - 2 > 0;
        const ans = yield* this.ask(i, {
          type: 'mulligan', prompt: `Оставьте ${keep} карт${canMull ? ' или смените руку (муллиган)' : ''}`,
          options: drawn.map((c) => ({ id: c.uid })), keep, canMull,
        });
        if (ans === 'mulligan' && canMull) {
          p.deck.push(...drawn); drawn.forEach((c) => { c.zone = 'deck'; });
          p.mull = null; this.shuffle(p.deck); n -= 2;
          this.log(`${p.name} меняет стартовую руку.`);
          deal(p, n);
          continue;
        }
        const kept = new Set(ans);
        for (const c of drawn) {
          if (kept.has(c.uid)) { c.zone = 'hand'; p.hand.push(c); } else { c.zone = 'deck'; p.deck.push(c); }
        }
        p.mull = null;
        this.shuffle(p.deck);
        if (this.cfg.options?.mulliganBonus && p.hand.length < 5) p.coins += 5 - p.hand.length;
        break;
      }
    }
    this.emit('ready', { log: 'Игра началась!' });
  }
  validMulligan(q, a) { return true; }

  newPhase(kind, player = null) {
    const s = this.s;
    s.phaseId++;
    s.phase = kind; s.turn = player;
    for (const p of s.players) p.usedThisPhase = 0;
  }
  *endPhase() {
    const id = this.s.phaseId;
    this.expire((u) => u.phase === id && u.battle == null);
    yield* this.checkDeaths();
  }

  *playerTurn(i) {
    const s = this.s, p = this.P(i);
    this.newPhase('turn', i);
    p.usedThisTurn = 0;
    s.turnStamp = ++s.uid;
    // Effects lasting "until the start of your next turn" end now.
    this.expire((u) => u.turnOf === i);
    yield* this.checkDeaths();
    this.emit('turnStart', { player: i, log: `Ход: ${p.name}.` });
    yield* this.window(1 - i, 'turnStart');
    // «В начале вашего хода…» — snapshot so that cards arriving now wait until next turn.
    const starters = this.field().filter((c) => this.script(c).on?.turnStart);
    for (const c of starters) {
      if (!this.onField(c)) continue;
      yield* this.script(c).on.turnStart(this, c, { player: i });
      yield* this.checkDeaths();
    }
    // Take two: cards or coins.
    for (let k = 0; k < 2; k++) {
      const canDraw = p.deck.length > 0;
      const a = yield* this.ask(i, {
        type: 'draw', prompt: `Возьмите ${k === 0 ? 'первое' : 'второе'}: карту или монету`,
        options: [...(canDraw ? [{ id: 'card', label: 'Карта' }] : []), { id: 'coin', label: 'Монета' }], auto: false,
      });
      if (a === 'card') yield* this.draw(i, 1); else yield* this.gainCoins(i, 1, null, { noMods: true });
    }
    // Main phase.
    for (;;) {
      const opts = this.mainOptions(i);
      const a = yield* this.ask(i, { type: 'main', prompt: 'Ваш ход', options: opts, auto: false });
      if (a === 'end') break;
      const o = opts.find((x) => x.id === a);
      yield* this.doAction(i, o);
    }
    yield* this.window(1 - i, 'turnEnd');
    const enders = this.field().filter((c) => this.script(c).on?.turnEnd);
    for (const c of enders) {
      if (!this.onField(c)) continue;
      yield* this.script(c).on.turnEnd(this, c, { player: i });
      yield* this.checkDeaths();
    }
    for (const pl of [i]) {
      const P = this.P(pl);
      if (P.hand.length > HAND_LIMIT) {
        const n = P.hand.length - HAND_LIMIT;
        const pick = yield* this.ask(pl, { type: 'multi', min: n, max: n, prompt: `В руке больше 10 карт. Выберите ${n}, ${n === 1 ? "которая уйдёт" : "которые уйдут"} на кладбище`, options: P.hand.map((c) => ({ id: c.uid })) });
        for (const uid of pick) yield* this.discard(pl, this.card(uid));
      }
    }
    yield* this.endPhase();
    this.emit('turnEnd', { player: i });
  }

  // ---------- playable options ----------
  mainOptions(i) {
    const opts = [];
    for (const c of this.P(i).hand) {
      for (const side of this.sidesOf(c)) {
        if (this.canPlay(i, c, side, { main: true })) opts.push({ id: `play:${c.uid}:${side}`, kind: 'play', uid: c.uid, side, cost: this.costOf(i, c, side) });
      }
    }
    for (const c of this.P(i).grave) {
      if (this.script(c).playFromGrave && this.canPlay(i, c, c.id, { main: true, fromGrave: true })) opts.push({ id: `play:${c.uid}:${c.id}`, kind: 'play', uid: c.uid, side: c.id, cost: this.costOf(i, c, c.id), fromGrave: true });
    }
    for (const c of this.field(i)) {
      (this.script(c).abilities || []).forEach((ab, k) => {
        if (this.canUseAbility(i, c, k, { main: true })) opts.push({ id: `ab:${c.uid}:${k}`, kind: 'ability', uid: c.uid, ab: k, label: ab.name, abCost: this.abilityCost(c, ab), fast: !!ab.fast });
      });
    }
    opts.push({ id: 'end', kind: 'end', label: 'Завершить ход' });
    return opts;
  }
  fastOptions(i) {
    const opts = [];
    for (const c of this.P(i).hand) {
      for (const side of this.sidesOf(c)) {
        if (this.canPlay(i, c, side, { main: false })) opts.push({ id: `play:${c.uid}:${side}`, kind: 'play', uid: c.uid, side, cost: this.costOf(i, c, side) });
      }
    }
    for (const c of this.field(i)) {
      (this.script(c).abilities || []).forEach((ab, k) => {
        if (this.canUseAbility(i, c, k, { main: false })) opts.push({ id: `ab:${c.uid}:${k}`, kind: 'ability', uid: c.uid, ab: k, label: ab.name, abCost: this.abilityCost(c, ab), fast: true });
      });
    }
    return opts;
  }
  sidesOf(c) {
    const d = this.def(c);
    return d.alt ? [c.id, d.alt] : [c.id];
  }

  /** Can player i use card c (as face `side`) right now? */
  canPlay(i, c, side, { main, fromGrave = false }) {
    const s = this.s, p = this.P(i);
    const d = defOf(side), sc = SCRIPTS[side] || {};
    if (d.type === 'leader' || d.type === 'token' && !d.cost && d.cost !== 0) return false;
    // Timing.
    let fast = d.kw.includes('fast');
    for (const { inst: src, s: st } of this.statics()) if (st.grantFast && st.grantFast(this, src, i, c, d)) fast = true;
    const myMain = main && s.turn === i && s.phase === 'turn' && s.stack.length === 0;
    if (!myMain) {
      const eric = this.isLeader(i, 117) && s.turn !== i && p.freeFastPhase !== s.phaseId;
      if (!fast && !eric) return false;
    }
    // Restrictions from statics (Альбо, Стены змия…).
    for (const { inst: src, s: st } of this.statics()) if (st.forbidPlay && st.forbidPlay(this, src, i, c, d, { fast, myMain })) return false;
    if (sc.canPlay && !sc.canPlay(this, i, c)) return false;
    if (d.legend && this.field(i).some((x) => this.def(x).name === d.name)) return false;
    const cost = this.costOf(i, c, side);
    if (cost !== 'X' && cost > p.coins) return false;
    if (d.type === 'ally' && this.allyRegions(i, c, side).length === 0) return false;
    if (d.type === 'place' && this.placeRegions(i).length === 0) return false;
    if (sc.targets && !this.targetsAvailable(i, c, sc.targets)) return false;
    return true;
  }
  isLeader(i, id) { return this.leader(i).id === id; }
  /** Was this card usable only thanks to Eric's leader ability? (marks it used) */
  markOffTurnUse(i, c, d) {
    const s = this.s, p = this.P(i);
    const myMain = s.turn === i && s.phase === 'turn' && s.stack.length === 0;
    if (myMain) return;
    let fast = d.kw.includes('fast');
    for (const { inst: src, s: st } of this.statics()) if (st.grantFast && st.grantFast(this, src, i, c, d)) fast = true;
    if (!fast) p.freeFastPhase = s.phaseId;
  }
  allyRegions(i, c, side) {
    const out = [];
    for (let r = 0; r < REGIONS; r++) {
      if (this.P(i).regions[r].ally) continue;
      let ok = true;
      for (const { inst: src, s: st } of this.statics()) if (st.forbidRegion && st.forbidRegion(this, src, i, r, c)) ok = false;
      if (ok) out.push(r);
    }
    return out;
  }
  placeRegions(i) { return [...Array(REGIONS).keys()].filter((r) => !this.P(i).regions[r].place); }

  costOf(i, c, side = c.id) {
    const d = defOf(side), sc = SCRIPTS[side] || {};
    if (d.cost === 'X') return 'X';
    let cost = d.cost ?? 0;
    if (sc.cost) cost = sc.cost(this, i, c, cost);
    const talk = [...d.talk];
    // Лариса: первая карта за ход получает Разговор с Животными.
    if (this.isLeader(i, 41) && this.s.turn === i && this.s.phase === 'turn' && this.P(i).usedThisTurn === 0) talk.push('ЖИВОТНЫМИ');
    const TALK = { 'ЖИВОТНЫМИ': 'ЖИВОТНОЕ', 'ВОИНАМИ': 'ВОИН', 'ВАМПИРАМИ': 'ВАМПИР', 'ТОРГОВЦАМИ': 'ТОРГОВЕЦ' };
    if (talk.length) {
      const tset = talk.map((t) => TALK[t] || t);
      const n = this.field(i).filter((x) => tset.some((t) => this.isType(x, t))).length;
      cost -= n;
    }
    for (const { inst: src, s: st } of this.statics()) if (st.costMod) cost += st.costMod(this, src, i, c, d, cost) || 0;
    return Math.max(0, cost);
  }

  targetsAvailable(i, c, specs) {
    const first = Array.isArray(specs) ? specs[0] : specs;
    if (!first || first.optional) return true;
    return this.targetCandidates(i, first).length > 0;
  }
  /**
   * Target spec: { kind: 'ally'|'companion'|'character'|'place'|'item'|'card'|'allyOrCompanion'|'leader',
   *   side: 'enemy'|'own'|'any', filter?: (g, inst, i) => bool }
   */
  targetCandidates(i, spec) {
    const side = spec.side || 'any';
    let pool = [];
    const sides = side === 'enemy' ? [1 - i] : side === 'own' ? [i] : [0, 1];
    for (const p of sides) {
      const k = spec.kind;
      if (k === 'ally' || k === 'allyOrCompanion' || k === 'character' || k === 'card') pool.push(...this.allies(p));
      if (k === 'companion' || k === 'allyOrCompanion' || k === 'character' || k === 'card') pool.push(...this.companions(p));
      if (k === 'leader' || k === 'character' || k === 'leaderOrCompanion') pool.push(this.leader(p));
      if (k === 'leaderOrCompanion') pool.push(...this.companions(p));
      if (k === 'place' || k === 'card') pool.push(...this.places(p));
      if (k === 'item' || k === 'card') pool.push(...this.items(p));
      if (k === 'allyCompanionItem') pool.push(...this.allies(p), ...this.companions(p), ...this.items(p));
      if (k === 'cardNotLeader') pool.push(...this.allies(p), ...this.companions(p), ...this.places(p), ...this.items(p));
    }
    pool = pool.filter((t) => !(t.ctrl !== i && this.has(t, 'ward')));
    if (spec.filter) pool = pool.filter((t) => spec.filter(this, t, i));
    return pool;
  }

  canUseAbility(i, c, k, { main }) {
    const s = this.s;
    const ab = (this.script(c).abilities || [])[k];
    if (!ab || c.ctrl !== i) return false;
    const myMain = main && s.turn === i && s.phase === 'turn' && s.stack.length === 0;
    if (!myMain && !ab.fast) return false;
    if (ab.myTurnOnly && s.turn !== i) return false;
    if (ab.limit) {
      const key = ab.limit === 'phase' ? s.phaseId : ab.limit === 'turn' ? (s.turn === i ? s.turnStamp : -1) : 'game';
      if (c.used[k] === key) return false;
    }
    const cost = this.abilityCost(c, ab);
    if ((cost.coins || 0) > this.P(i).coins) return false;
    if (cost.blood && this.bloodAvailable(c) < cost.blood) return false;
    if (cost.goods && this.tokens(c, 'goods') < cost.goods) return false;
    if (cost.star && this.tokens(c, 'star') < cost.star) return false;
    if (ab.can && !ab.can(this, c)) return false;
    if (ab.targets && !this.targetsAvailable(i, c, ab.targets)) return false;
    return true;
  }
  abilityCost(c, ab) { return (typeof ab.cost === 'function' ? ab.cost(this, c) : ab.cost) || {}; }
  bloodAvailable(c) {
    let n = this.tokens(c, 'blood');
    // Дан Балан: кровь с Лидера можно тратить на свойства ваших Вампиров.
    const L = this.leader(c.ctrl);
    if (L.id === 62 && L !== c && this.isType(c, 'ВАМПИР')) n += this.tokens(L, 'blood');
    return n;
  }
  *payBlood(c, n) {
    const own = Math.min(this.tokens(c, 'blood'), n);
    c.tok.blood = this.tokens(c, 'blood') - own;
    n -= own;
    if (n > 0) { const L = this.leader(c.ctrl); L.tok.blood -= n; }
    this.emit('tokens', { uid: c.uid });
  }

  // ---------- declaring & the stack ----------
  *doAction(i, o) {
    if (o.kind === 'play') return yield* this.declareCard(i, this.card(o.uid), o.side);
    if (o.kind === 'ability') return yield* this.declareAbility(i, this.card(o.uid), o.ab);
  }

  /** Collect choices for a card, pay, put it on the stack and resolve the stack. */
  // The card whose choices are being asked right now, so the request can show its picture.
  *withActing(uid, id, gen) {
    const prev = this.acting;
    this.acting = { uid, id };
    try { return yield* gen; } finally { this.acting = prev; }
  }
  *declareCard(i, c, side, opts = {}) { return yield* this.withActing(c.uid, side, this.declareCardInner(i, c, side, opts)); }
  *declareCardInner(i, c, side, { free = false, noCancel = false } = {}) {
    const p = this.P(i);
    const d = defOf(side), sc = SCRIPTS[side] || {};
    const ctx = { player: i, self: c, side, targets: [], specs: [], cancel: !noCancel, free };
    // Alternative side chosen: switch the card's identity now.
    // Region.
    if (d.type === 'ally') {
      const regs = this.allyRegions(i, c, side);
      const prev = this.cfg.options?.previews ? (x) => this.replayPreview(i, c, side, x) ?? this.previewAlly(i, c, side, x) : () => null;
      const r = yield* this.ask(i, { type: 'region', prompt: `Куда положить «${d.name}»?`, options: regs.map((x) => ({ id: x, preview: prev(x) })), cancel: !noCancel, auto: false, uid: c.uid, row: 'ally' });
      if (r === null) return;
      ctx.region = r;
    } else if (d.type === 'place') {
      const regs = this.placeRegions(i);
      const r = yield* this.ask(i, { type: 'region', prompt: `Куда положить «${d.name}»?`, options: regs.map((x) => ({ id: x })), cancel: !noCancel, auto: false, uid: c.uid, row: 'place' });
      if (r === null) return;
      ctx.region = r;
    }
    let cost = free ? 0 : this.costOf(i, c, side);
    if (cost === 'X') {
      const max = p.coins;
      const x = yield* this.ask(i, { type: 'pick', prompt: `Сколько монет потратить (X)?`, options: [...Array(max + 1).keys()].map((n) => ({ id: n, label: String(n) })), cancel: !noCancel, auto: false });
      if (x === null) return;
      ctx.X = x; cost = x;
    }
    if (sc.plan) {
      const ok = yield* sc.plan(this, ctx);
      if (ok === false) return;
    } else if (sc.targets) {
      for (const spec of [].concat(sc.targets)) {
        const t = yield* this.chooseTarget(ctx, spec);
        if (t === null && !spec.optional) return;
      }
    }
    if (ctx.cancelled) return;
    // Pay.
    if (cost > p.coins) return;
    p.coins -= cost;
    if (!free) this.markOffTurnUse(i, c, d);
    if (side !== c.id) { if (!c.origId) c.origId = c.id; c.id = side; }
    // Remove from hand/grave.
    this.removeFromZone(c);
    c.zone = 'stack';
    p.usedThisTurn += this.s.turn === i ? 1 : 0;
    p.usedThisPhase++;
    const item = { kind: 'card', player: i, inst: c, ctx, label: d.name, offTurn: this.s.turn !== i };
    this.s.stack.push(item);
    this.emit('declare', { player: i, uid: c.uid, id: c.id, cost, log: `${p.name} разыгрывает «${d.name}»${cost ? ` (${cost} 💰)` : ''}.`, targets: ctx.targets });
    // «Когда … использует карту» triggers apply before the card resolves.
    yield* this.trigger('cardUsed', { player: i, inst: c, def: d, offTurn: item.offTurn });
    yield* this.checkDeaths();
    yield* this.resolveStack();
  }

  *declareAbility(i, c, k) { return yield* this.withActing(c.uid, c.id, this.declareAbilityInner(i, c, k)); }
  *declareAbilityInner(i, c, k) {
    const ab = this.script(c).abilities[k];
    const ctx = { player: i, self: c, targets: [], specs: [], ab: k, cancel: true };
    if (ab.plan) {
      const ok = yield* ab.plan(this, ctx);
      if (ok === false) return;
    } else if (ab.targets) {
      for (const spec of [].concat(ab.targets)) {
        const t = yield* this.chooseTarget(ctx, spec);
        if (t === null && !spec.optional) return;
      }
    }
    if (ctx.cancelled) return;
    const cost = this.abilityCost(c, ab);
    const p = this.P(i);
    if ((cost.coins || 0) > p.coins) return;
    p.coins -= cost.coins || 0;
    if (cost.blood) yield* this.payBlood(c, cost.blood);
    if (cost.goods) { c.tok.goods -= cost.goods; this.emit('tokens', { uid: c.uid }); }
    if (cost.star) { c.tok.star -= cost.star; this.emit('tokens', { uid: c.uid }); }
    if (ab.limit) c.used[k] = ab.limit === 'phase' ? this.s.phaseId : ab.limit === 'turn' ? this.s.turnStamp : 'game';
    // Гнездо кукушки: blood abilities of vampires in its region resolve twice.
    let times = 1;
    if (cost.blood && this.isType(c, 'ВАМПИР') && c.zone === 'field' && this.placeAt(c.ctrl, c.region)?.id === 94) times = 2;
    if (cost.selfDestroy) yield* this.destroy(c, c, { cost: true });
    const item = { kind: 'ability', player: i, inst: c, ctx, ab: k, label: `${this.name(c)}: ${ab.name}`, times };
    this.s.stack.push(item);
    this.emit('declareAbility', { player: i, uid: c.uid, ab: k, name: ab.name, log: `${p.name}: «${this.name(c)}» — ${ab.name}.`, targets: ctx.targets });
    yield* this.resolveStack();
  }

  /** Opponent of the top item's controller gets priority before it resolves. */
  *resolveStack() {
    const s = this.s;
    while (s.stack.length) {
      const top = s.stack[s.stack.length - 1];
      if (yield* this.offerPriority(1 - top.player)) continue;
      s.stack.pop();
      yield* this.resolveItem(top);
      yield* this.checkDeaths();
    }
  }
  /**
   * A priority window outside the stack (phase boundaries).
   * By default only the useful windows are offered (start of the Сражение and the start of a
   * fight in a region where someone stands); options.allWindows = true offers every window.
   */
  *window(i, kind = 'other') {
    if (!this.cfg.options?.allWindows) {
      if (kind === 'regionStart' && !this.allyAt(0, this.s.battleRegion) && !this.allyAt(1, this.s.battleRegion)) return;
    }
    // Quiet moments: only ask when a card from hand can be played (abilities alone don't open them).
    const quiet = !this.cfg.options?.allWindows && ['turnStart', 'turnEnd', 'maneuver', 'regionEnd', 'battleEnd'].includes(kind);
    for (;;) {
      if (quiet && !this.fastOptions(i).some((o) => o.kind === 'play')) { this.fakeStop(i); return; }
      if (!(yield* this.offerPriority(i, kind))) return;
    }
  }
  /**
   * Online games: when a player is NOT asked (nothing to answer with), sometimes still show the opponent a short
   * «может ответить» pause, so a real stop does not give away that they hold a card with Опережение.
   */
  fakeStop(i) {
    if (!this.cfg.options?.fakeStops?.[i] || this.s.over) return;
    if (this.rand() < 0.22) this.emit('pause', { player: i, ms: Math.round(500 + this.rand() * 800) });
  }
  *offerPriority(i, kind = 'stack') {
    if (this.s.over) return false;
    const opts = this.fastOptions(i);
    if (!opts.length) { this.fakeStop(i); return false; }
    // autoPass: true = never ask; 'smart' = ask only when the opponent's card or ability aims at this player's cards.
    const ap = this.cfg.options?.autoPass?.[i];
    if (ap === true) return false;
    if (ap === 'smart') {
      const top = this.s.stack[this.s.stack.length - 1];
      const aimed = top && top.player !== i && top.ctx.targets.some((u) => this.card(u)?.ctrl === i);
      if (!aimed) { this.fakeStop(i); return false; }
    }
    // Answering the stack: by default ask only when a card from hand can be played, or when the item
    // targets this player's cards (then a Leader ability like a buff or protection matters).
    if (kind === 'stack' && !this.cfg.options?.allWindows && !opts.some((o) => o.kind === 'play')) {
      const top = this.s.stack[this.s.stack.length - 1];
      const mine = top && top.ctx.targets.some((u) => this.card(u)?.ctrl === i);
      if (!mine) { this.fakeStop(i); return false; }
    }
    const a = yield* this.ask(i, {
      type: 'priority', prompt: this.s.stack.length ? `Опередить «${this.s.stack[this.s.stack.length - 1].label}»?` : 'Можно сыграть карту с Опережением',
      options: [{ id: 'pass', kind: 'pass', label: 'Пас' }, ...opts], auto: false, context: this.priorityContext(kind),
    });
    if (a === 'pass' || a == null) return false;
    const o = opts.find((x) => x.id === a);
    const before = this.s.stack.length;
    yield* this.doAction(i, o);
    return this.s.stack.length !== before || true;
  }

  /** What the player is being offered to respond to (for the UI). */
  priorityContext(kind) {
    const s = this.s;
    if (s.stack.length) {
      const top = s.stack[s.stack.length - 1];
      return { kind: 'stack', label: top.label, by: top.player, id: top.inst.id, targets: top.ctx.targets.map((u) => { const t = this.card(u); return t ? { uid: u, id: t.id, ctrl: t.ctrl } : null; }).filter(Boolean) };
    }
    return { kind, region: s.battleRegion, turn: s.turn, phase: s.phase };
  }
  /** Re-check that a stack item can still legally resolve. */
  legal(item) {
    const { ctx } = item;
    for (let k = 0; k < ctx.targets.length; k++) {
      const t = this.card(ctx.targets[k]); const spec = ctx.specs[k];
      if (!t || !this.onField(t) && spec?.zone !== 'grave' && spec?.zone !== 'hand') return false;
      if (spec?.zone === 'grave' && t.zone !== 'grave') return false;
      if (spec?.uidZone && t.zone !== spec.uidZone) return false;
      if (t.ctrl !== item.player && this.has(t, 'ward') && spec?.zone == null) return false;
      if (spec && spec.kind && this.onField(t) && !this.targetCandidates(item.player, { ...spec, filter: spec.filter }).includes(t)) return false;
    }
    if (item.kind === 'card') {
      const d = this.def(item.inst);
      if (d.type === 'ally') {
        if (this.allyAt(item.player, ctx.region)) return false;
        if (!this.allyRegions(item.player, item.inst, item.inst.id).includes(ctx.region)) return false;
      }
      if (d.type === 'place' && this.placeAt(item.player, ctx.region)) return false;
      if (d.legend && this.field(item.player).some((x) => this.def(x).name === d.name)) return false;
    }
    return true;
  }

  *resolveItem(item) { return yield* this.withActing(item.inst.uid, item.inst.id, this.resolveItemInner(item)); }
  *resolveItemInner(item) {
    const { ctx } = item;
    if (!this.legal(item)) {
      this.emit('fizzle', { uid: item.inst.uid, log: `«${item.label}» не срабатывает: цель или место больше недоступны.` });
      if (item.kind === 'card') yield* this.toGrave(item.inst);
      return;
    }
    if (item.kind === 'ability') {
      const ab = this.script(item.inst).abilities[item.ab];
      for (let t = 0; t < (item.times || 1); t++) {
        this.emit('ability', { uid: item.inst.uid, ab: item.ab, name: ab.name });
        yield* ab.effect(this, ctx);
        yield* this.checkDeaths();
      }
      return;
    }
    const c = item.inst, d = this.def(c), sc = this.script(c);
    this.emit('resolve', { uid: c.uid, id: c.id, player: item.player });
    if (d.type === 'action') {
      c.zone = 'resolving';
      if (sc.effect) yield* sc.effect(this, ctx);
      yield* this.checkDeaths();
      if (c.zone === 'resolving') yield* this.toGrave(c);
      return;
    }
    if (d.type === 'ally' || d.type === 'place') {
      yield* this.putOnField(c, item.player, ctx.region, { fromHand: true, ctx });
    } else {
      yield* this.putOnField(c, item.player, null, { fromHand: true, ctx });
    }
  }

  // ---------- target helpers ----------
  /** Ask the player to pick a target according to spec; records it on ctx for legality checks. */
  *chooseTarget(ctx, spec) {
    const i = ctx.player;
    let cands = spec.candidates ? spec.candidates(this, ctx) : this.targetCandidates(i, spec);
    if (spec.exclude) cands = cands.filter((t) => !spec.exclude(this, ctx, t));
    if (!cands.length) return null;
    const a = yield* this.ask(i, {
      type: 'target', prompt: spec.prompt || 'Выберите цель', hint: spec.hint || 'harm',
      options: cands.map((t) => ({ id: t.uid })), cancel: ctx.cancel && !spec.noCancel, auto: false, src: ctx.self?.uid,
    });
    if (a === null) { ctx.cancelled = true; return null; }
    const t = this.card(a);
    ctx.targets.push(t.uid); ctx.specs.push(spec.zone ? spec : { kind: spec.kind, side: spec.side, filter: spec.filter, zone: spec.zone });
    if (spec.key) ctx[spec.key] = t;
    return t;
  }
  /** A choice that is not a target (made during resolution). */
  *pickCard(i, cards, prompt, hint = 'harm', { optional = false } = {}) {
    if (!cards.length) return null;
    const opts = cards.map((t) => ({ id: t.uid }));
    const a = yield* this.ask(i, { type: 'target', prompt, hint, options: opts, cancel: optional, auto: !optional });
    return a == null ? null : this.card(a);
  }
  *pickOption(i, labels, prompt) {
    const a = yield* this.ask(i, { type: 'pick', prompt, options: labels.map((l, k) => ({ id: k, label: l })), auto: false });
    return a;
  }
  *yesNo(i, prompt, hint = 'yes') {
    const a = yield* this.ask(i, { type: 'pick', prompt, hint, options: [{ id: 1, label: 'Да' }, { id: 0, label: 'Нет' }], auto: false });
    return a === 1;
  }
  *pickRegion(i, regions, prompt, row = 'ally', { optional = false, focus = null } = {}) {
    if (!regions.length) return null;
    // focus: uid of the card being moved — the UI highlights it, so with two equal cards it is clear which one.
    const a = yield* this.ask(i, { type: 'region', prompt, options: regions.map((r) => ({ id: r })), row, cancel: optional, auto: !optional, side: i, focus });
    return a;
  }
  /** Choose some cards from a hidden/private list (deck search, plan, hand). */
  *pickFrom(i, cards, { min = 1, max = 1, prompt, reveal = true } = {}) {
    if (!cards.length) return [];
    const a = yield* this.ask(i, { type: 'multi', min: Math.min(min, cards.length), max: Math.min(max, cards.length), prompt, options: cards.map((c) => ({ id: c.uid, cardId: c.id })), reveal });
    return a.map((u) => this.card(u));
  }

  // ---------- triggers ----------
  *trigger(name, ev) {
    // First player's cards first, then the second player's.
    const f = this.s.first;
    const list = [...this.field(f), ...this.field(1 - f)].filter((c) => this.script(c).on?.[name]);
    for (const c of list) {
      if (!this.onField(c) && !(ev.inst === c && name === 'leave')) continue;
      yield* this.script(c).on[name](this, c, ev);
    }
    // Equipment adds triggers to the equipped ally.
    for (const it of this.items()) {
      const sc = this.script(it);
      if (it.equip && sc.equipOn?.[name]) yield* sc.equipOn[name](this, it, this.card(it.equip), ev);
    }
  }

  // ---------- zone moves ----------
  removeFromZone(c) {
    const p = this.P(c.ctrl), o = this.P(c.owner);
    for (const pl of [p, o]) {
      for (const k of ['hand', 'deck', 'grave', 'support', 'exile']) {
        const ix = pl[k].indexOf(c); if (ix >= 0) pl[k].splice(ix, 1);
      }
      for (const r of pl.regions) { if (r.ally === c) r.ally = null; if (r.place === c) r.place = null; }
    }
    const si = this.s.stack.findIndex((x) => x.inst === c && x.kind === 'card');
    if (si >= 0 && c.zone !== 'stack') this.s.stack.splice(si, 1);
  }
  resetInst(c) {
    c.dmg = 0; c.mods = []; c.kws = []; c.tok = {}; c.stunUntil = -1; c.equip = null; c.extraTypes = [];
    c.x = {}; c.used = {}; c.region = null; c.slot = null;
    if (c.faceId) { c.id = c.faceId; c.faceId = null; }
    if (c.origId) { c.id = c.origId; c.origId = null; }
    c.ctrl = c.owner;
  }
  *leaveField(c, to) {
    const wasOn = this.onField(c);
    if (!wasOn) return;
    const region = c.region, ctrl = c.ctrl;
    // Equipment on this ally goes back to the leader zone.
    for (const it of this.items()) if (it.equip === c.uid) { it.equip = null; this.emit('unequip', { uid: it.uid }); }
    if (this.cardType(c) === 'item' && c.equip) c.equip = null;
    this.removeFromZone(c);
    c.zone = 'limbo';
    this.emit('leave', { uid: c.uid, to, region, player: ctrl });
    const sc = this.script(c);
    if (sc.onLeave) yield* sc.onLeave(this, c, { region, ctrl, to });
    yield* this.trigger('leave', { inst: c, region, ctrl, to });
  }
  *toGrave(c, { by = null, destroyed = false } = {}) {
    const region = c.region, ctrl = c.ctrl;
    const from = c.zone;
    if (this.onField(c)) yield* this.leaveField(c, 'grave');
    else this.removeFromZone(c);
    if (c.created) { this.resetInst(c); c.zone = 'exile'; this.emit('exiled', { uid: c.uid }); return; }
    this.resetInst(c);
    c.zone = 'grave';
    this.P(c.owner).grave.push(c);
    this.emit('toGrave', { uid: c.uid, player: c.owner, from });
  }
  *exile(c) {
    if (this.onField(c)) yield* this.leaveField(c, 'exile');
    else this.removeFromZone(c);
    this.resetInst(c);
    c.zone = 'exile';
    if (!c.created) this.P(c.owner).exile.push(c);
    this.emit('exiled', { uid: c.uid, log: `«${this.name(c)}» убран(а) из игры.` });
  }
  *toHand(c) {
    if (this.onField(c)) yield* this.leaveField(c, 'hand');
    else this.removeFromZone(c);
    if (c.created) { this.resetInst(c); c.zone = 'exile'; this.emit('exiled', { uid: c.uid }); return; }
    this.resetInst(c);
    c.zone = 'hand';
    this.P(c.owner).hand.push(c);
    this.emit('toHand', { uid: c.uid, player: c.owner, log: `«${this.name(c)}» возвращается в руку.` });
  }
  *toDeckBottom(c) {
    if (this.onField(c)) yield* this.leaveField(c, 'deck');
    else this.removeFromZone(c);
    if (c.created) { this.resetInst(c); c.zone = 'exile'; return; }
    this.resetInst(c);
    c.zone = 'deck';
    this.P(c.owner).deck.push(c);
    this.emit('toDeck', { uid: c.uid, player: c.owner });
  }

  /** Put a card onto the battlefield (played, put, created). */
  *putOnField(c, i, region, { fromHand = false, ctx = null, created = false, silent = false } = {}) {
    const d = this.def(c), p = this.P(i);
    if (c.zone !== 'stack') this.removeFromZone(c);
    c.ctrl = i;
    c.enteredAt = ++this.s.uid;
    if (d.type === 'ally' || d.type === 'place') {
      if (region == null) { yield* this.toGrave(c); return false; }
      const slot = d.type === 'ally' ? 'ally' : 'place';
      if (p.regions[region][slot]) { yield* this.toGrave(c); return false; }
      p.regions[region][slot] = c;
      c.zone = 'field'; c.region = region; c.slot = slot;
    } else {
      c.zone = 'support'; c.region = null; c.slot = null;
      p.support.push(c);
    }
    if (created) c.created = true;
    this.emit('enter', { uid: c.uid, id: c.id, player: i, region: c.region, created, fromHand, log: silent ? undefined : `«${d.name}» появляется на поле.` });
    // Legend rule.
    if (this.isLegend(c)) {
      const same = this.field(i).filter((x) => x !== c && this.def(x).name === d.name);
      if (same.length) {
        const keep = yield* this.pickCard(i, [c, ...same], `На поле не может быть двух Легенд «${d.name}». Выберите, какую оставить — другая уйдёт на кладбище`, 'buff');
        for (const x of [c, ...same]) if (x !== keep) yield* this.toGrave(x);
        if (keep !== c) return false;
      }
    }
    const sc = this.script(c);
    if (sc.enterTokens) for (const [t, n] of Object.entries(sc.enterTokens)) c.tok[t] = n;
    yield* this.trigger('enter', { inst: c, player: i, fromHand, created });
    if (!this.onField(c)) return true;
    if (sc.onEnter) yield* sc.onEnter(this, c, { fromHand, ctx, created });
    yield* this.checkDeaths();
    return true;
  }

  /** Create a token / new card by definition id. */
  *create(i, id, region = null, { silent = false } = {}) {
    const d = defOf(id);
    const c = this.newInst(id, i, 'limbo');
    c.created = true;
    if (d.type === 'ally') {
      if (region == null) {
        const regs = this.allyRegions(i, c, id).filter((r) => !this.allyAt(i, r));
        if (!regs.length) { c.zone = 'exile'; return null; }
        region = yield* this.pickRegion(i, regs, `Куда поставить «${d.name}»?`);
      }
      if (this.allyAt(i, region) || !this.allyRegions(i, c, id).includes(region)) { c.zone = 'exile'; return null; }
    }
    if (d.type === 'place' && (region == null || this.placeAt(i, region))) {
      const regs = this.placeRegions(i);
      if (!regs.length) { c.zone = 'exile'; return null; }
      region = yield* this.pickRegion(i, regs, `Куда положить «${d.name}»?`, 'place');
    }
    yield* this.putOnField(c, i, region, { created: true, silent });
    return this.onField(c) ? c : null;
  }
  /** Copy of a card on the battlefield (Ворон Барон). */
  *createCopy(i, orig, extraTypes = []) {
    const d = this.def(orig);
    const c = this.newInst(orig.id, i, 'limbo');
    c.created = true; c.extraTypes = [...extraTypes];
    c.tok = { ...orig.tok }; c.dmg = orig.dmg; c.mods = orig.mods.map((m) => ({ ...m })); c.kws = orig.kws.map((k) => ({ ...k }));
    let region = null;
    if (d.type === 'place') {
      const regs = this.placeRegions(i);
      if (!regs.length) return null;
      region = yield* this.pickRegion(i, regs, `Куда положить копию «${d.name}»?`, 'place');
    } else if (d.type === 'ally') {
      const regs = this.allyRegions(i, c, c.id);
      if (!regs.length) return null;
      region = yield* this.pickRegion(i, regs, `Куда положить копию «${d.name}»?`);
    }
    yield* this.putOnField(c, i, region, { created: true });
    this.fx('copy', orig, c);
    return c;
  }

  // ---------- deaths (special action) ----------
  *checkDeaths() {
    for (let guard = 0; guard < 50; guard++) {
      for (const p of this.s.players) {
        if (p.leader.hpNow <= 0) this.gameOver();
      }
      const dying = this.characters().filter((c) => this.cardType(c) !== 'leader' && this.maxHp(c) - c.dmg <= 0);
      if (!dying.length) return;
      for (const c of dying) if (this.onField(c)) yield* this.dies(c, c.x.killer ? this.card(c.x.killer) : null);
    }
  }
  concede(player) {
    if (this.s.over || ![0, 1].includes(player)) return false;
    this.history.push({ concede: player });
    this.s.over = true; this.s.winner = 1 - player; this.s.phase = 'over'; this.pending = null;
    this.emit('gameOver', { winner: this.s.winner, conceded: player, log: `${this.P(player).name} сдаётся. Победа: ${this.P(1 - player).name}!` });
    this.notify();
    return true;
  }
  gameOver() {
    const a = this.s.players[0].leader.hpNow <= 0, b = this.s.players[1].leader.hpNow <= 0;
    this.s.over = true;
    this.s.winner = a && b ? 'draw' : a ? 1 : 0;
    this.s.phase = 'over';
    this.emit('gameOver', { winner: this.s.winner, log: this.s.winner === 'draw' ? 'Ничья!' : `Победа: ${this.P(this.s.winner).name}!` });
    throw new GameOver();
  }
  *dies(c, by) {
    const sc = this.script(c);
    const info = { inst: c, by, region: c.region, ctrl: c.ctrl, atk: this.atk(c), cost: this.def(c).cost, baseHp: this.def(c).hp };
    this.emit('death', { uid: c.uid, log: `«${this.name(c)}» погибает.` });
    if (sc.beforeDestroyed) { const r = yield* sc.beforeDestroyed(this, c, info); if (r === 'prevented') return; }
    if (c.x.exileOnDeath) { yield* this.exile(c); info.exiled = true; }
    else yield* this.toGrave(c, { by, destroyed: true });
    if (sc.onDestroyed) yield* sc.onDestroyed(this, c, info);
    yield* this.trigger('destroyed', info);
  }
  /** «Уничтожьте…» — blocked by Нерушимость. */
  *destroy(c, src = null, { cost = false } = {}) {
    if (!this.onField(c)) return false;
    if (this.cardType(c) === 'leader') return false;
    if (!cost && this.has(c, 'indestructible')) { this.emit('blocked', { uid: c.uid, log: `«${this.name(c)}» не может быть уничтожен(а).` }); return false; }
    if (src) this.fx('destroy', src, c);
    if (['ally', 'companion'].includes(this.cardType(c))) yield* this.dies(c, src);
    else {
      const info = { inst: c, by: src, region: c.region, ctrl: c.ctrl, cost: this.def(c).cost };
      const sc = this.script(c);
      this.emit('death', { uid: c.uid, log: `«${this.name(c)}» уничтожен(а).` });
      if (sc.beforeDestroyed) { const r = yield* sc.beforeDestroyed(this, c, info); if (r === 'prevented') return false; }
      yield* this.toGrave(c, { by: src, destroyed: true });
      if (sc.onDestroyed) yield* sc.onDestroyed(this, c, info);
      yield* this.trigger('destroyed', info);
    }
    return true;
  }

  // ---------- damage & healing ----------
  /**
   * Deal damage. Returns amount actually dealt (a character cannot take more wounds than its health).
   * opts: { combat, fight, defer:[] } — with defer, 'damage' triggers are queued for the battle sequence.
   */
  *damage(src, tgt, amount, opts = {}) {
    if (!tgt || !this.onField(tgt) || amount <= 0) return 0;
    const type = this.cardType(tgt);
    if (!['ally', 'companion', 'leader'].includes(type)) return 0;
    let dealt;
    if (type === 'leader') {
      dealt = Math.min(amount, Math.max(0, tgt.hpNow));
      tgt.hpNow -= dealt;
    } else {
      dealt = Math.min(amount, Math.max(0, this.hp(tgt)));
      tgt.dmg += dealt;
      if (src && this.hp(tgt) <= 0) tgt.x.killer = src.uid;
    }
    const ev = { src, tgt, amount: dealt, combat: !!opts.combat, fight: !!opts.fight, srcCtrl: src?.ctrl, tgtCtrl: tgt.ctrl };
    this.emit('damage', { src: src?.uid, tgt: tgt.uid, amount: dealt, combat: !!opts.combat, fxName: opts.fx, log: `${src ? `«${this.name(src)}»` : 'Эффект'} наносит ${dealt} ран «${this.name(tgt)}».` });
    // Deathtouch (only from combat/fight damage of an ally with the keyword).
    if (src && dealt > 0 && type !== 'leader' && (opts.combat || opts.fight) && this.has(src, 'deathtouch') && !this.has(tgt, 'indestructible')) tgt.x.deathMark = true;
    if (opts.defer) opts.defer.push(ev);
    else {
      yield* this.trigger('damage', ev);
      const sc = src ? this.script(src) : null;
      yield* this.checkDeaths();
    }
    return dealt;
  }
  *heal(tgt, n, src = null) {
    if (!tgt || !this.onField(tgt) || n <= 0) return 0;
    let healed;
    if (this.cardType(tgt) === 'leader') {
      const max = this.def(tgt).hp;
      const over = this.field(tgt.ctrl).some((c) => c.id === 156); // Верховный жрец Гуди
      const cap = over ? Infinity : max;
      healed = Math.max(0, Math.min(n, cap - tgt.hpNow));
      tgt.hpNow += healed;
    } else {
      healed = Math.min(n, tgt.dmg);
      tgt.dmg -= healed;
    }
    if (healed > 0) this.emit('heal', { uid: tgt.uid, amount: healed, src: src?.uid, log: `«${this.name(tgt)}» исцеляется на ${healed}.` });
    yield* this.trigger('heal', { tgt, amount: healed, src });
    return healed;
  }
  /** +X/+Y. until: 'perm' | 'phase' | 'nextTurn' | 'battle' */
  *buff(tgt, atk, hp, until = 'perm', src = null) {
    if (!tgt || !this.onField(tgt)) return;
    tgt.mods.push({ atk, hp, until: this.untilTag(until, src || tgt), src: src?.uid });
    this.emit('buff', { uid: tgt.uid, atk, hp, src: src?.uid, log: `«${this.name(tgt)}» получает ${atk >= 0 ? '+' : ''}${atk}/${hp >= 0 ? '+' : ''}${hp}.` });
    yield* this.checkDeaths();
  }
  grant(tgt, kw, until = 'phase', src = null) {
    if (!tgt || !this.onField(tgt)) return;
    tgt.kws.push({ kw, until: this.untilTag(until, src || tgt) });
    this.emit('grant', { uid: tgt.uid, kw, log: `«${this.name(tgt)}» получает ${KW_RU[kw] || kw}.` });
  }
  stun(tgt, src = null) {
    if (!tgt || !this.onField(tgt)) return;
    const s = this.s;
    let until;
    if (!s.inBattle) until = s.battleNo + 1 + s.skipBattles * 0;
    else until = (tgt.x.struckBattle === s.battleNo || s.battled.includes(tgt.region)) ? s.battleNo + 1 : s.battleNo;
    tgt.stunUntil = Math.max(tgt.stunUntil, until);
    this.emit('stun', { uid: tgt.uid, src: src?.uid, log: `«${this.name(tgt)}» оглушён(а).` });
  }

  // ---------- resources ----------
  *gainCoins(i, n, src = null, { noMods = false } = {}) {
    if (n <= 0) return 0;
    let amount = n;
    if (!noMods && src) {
      for (const { inst: st, s } of this.statics()) if (s.income) amount += s.income(this, st, src, i, amount) || 0;
    }
    let stolen = 0;
    // Портовый попрошайка: забирает 1 монету у вражеской карты в своём регионе.
    if (!noMods && src && src.zone === 'field' && amount > 1) {
      const thief = this.allyAt(1 - i, src.region);
      if (thief && this.script(thief).stealIncome) { stolen = 1; amount -= 1; }
    }
    this.P(i).coins += amount;
    this.emit('coins', { player: i, amount, src: src?.uid, log: src ? `«${this.name(src)}» приносит ${amount} 💰.` : undefined });
    if (stolen) {
      const thief = this.allyAt(1 - i, src.region);
      this.P(1 - i).coins += 1;
      this.emit('coins', { player: 1 - i, amount: 1, src: thief.uid, log: `«${this.name(thief)}» забирает 1 💰.` });
    }
    yield* this.trigger('coinsGained', { player: i, amount, src });
    return amount;
  }
  *addTokens(c, type, n = 1, src = null) {
    if (!c || n <= 0 || !this.onField(c)) return;
    // Димитар: ваш Вампир получает на 1 кровь больше.
    if (type === 'blood' && this.isType(c, 'ВАМПИР') && this.field(c.ctrl).some((x) => x.id === 101)) n += 1;
    c.tok[type] = (c.tok[type] || 0) + n;
    this.emit('tokens', { uid: c.uid, tok: type, n, log: `«${this.name(c)}»: +${n} ${type === 'blood' ? '🩸' : type === 'goods' ? '📦' : type === 'star' ? '✨' : type === 'coins' ? '💰' : type}.` });
    yield* this.trigger('tokensGained', { inst: c, type, n });
  }
  *supply(i, times = 1) {
    for (let k = 0; k < times; k++) {
      const cands = this.field(i).filter((c) => Object.values(c.tok).some((v) => v > 0));
      if (!cands.length) return;
      const c = yield* this.pickCard(i, cands, 'Снабжение: выберите вашу карту с фишками', 'buff');
      const types = Object.keys(c.tok).filter((t) => c.tok[t] > 0);
      let t = types[0];
      if (types.length > 1) t = types[yield* this.pickOption(i, types, 'Какую фишку добавить?')];
      yield* this.addTokens(c, t, 1);
    }
  }

  // ---------- cards in hand/deck ----------
  *draw(i, n = 1) {
    const p = this.P(i);
    for (let k = 0; k < n; k++) {
      const c = p.deck.shift();
      if (!c) { this.log(`У ${p.name} закончилась Скрижаль.`); return; }
      c.zone = 'hand'; p.hand.push(c);
      this.emit('draw', { player: i, uid: c.uid });
    }
  }
  *discard(i, c) {
    const p = this.P(i);
    if (!c || c.zone !== 'hand') return;
    this.removeFromZone(c); c.zone = 'grave'; p.grave.push(c);
    this.emit('discard', { player: i, uid: c.uid, log: `${p.name} сбрасывает «${this.name(c)}».` });
    yield* this.trigger('discard', { player: i, inst: c });
  }
  *discardChoice(i, n = 1, prompt = 'Сбросьте карту') {
    const p = this.P(i);
    const k = Math.min(n, p.hand.length);
    if (!k) return [];
    const pick = yield* this.ask(i, { type: 'multi', min: k, max: k, prompt, options: p.hand.map((c) => ({ id: c.uid })) });
    const out = pick.map((u) => this.card(u));
    for (const c of out) yield* this.discard(i, c);
    return out;
  }
  *discardRandom(i, n = 1) {
    for (let k = 0; k < n; k++) {
      const p = this.P(i);
      if (!p.hand.length) return;
      const c = p.hand[Math.floor(this.rand() * p.hand.length)];
      yield* this.discard(i, c);
    }
  }
  /** «Запланировать N»: look at top N, put any into the graveyard, rest back on top. */
  *plan(i, n = 1) {
    const p = this.P(i);
    const top = p.deck.slice(0, n);
    if (!top.length) return;
    const toGrave = yield* this.ask(i, { type: 'multi', min: 0, max: top.length, prompt: `Запланировать: выберите карты, которые отправить на кладбище (остальные останутся сверху)`, options: top.map((c) => ({ id: c.uid, cardId: c.id })), reveal: true, plan: true });
    for (const uid of toGrave) {
      const c = this.card(uid);
      this.removeFromZone(c); c.zone = 'grave'; p.grave.push(c);
      this.emit('mill', { player: i, uid });
    }
    this.emit('plan', { player: i, n: top.length, log: `${p.name} планирует ${top.length} карт(у).` });
  }
  *burn(i, n) {
    const p = this.P(i);
    for (let k = 0; k < n; k++) {
      const c = p.deck.shift(); if (!c) return;
      c.zone = 'grave'; p.grave.push(c); this.emit('mill', { player: i, uid: c.uid });
    }
  }
  shuffleDeck(i) { this.shuffle(this.P(i).deck); this.emit('shuffle', { player: i }); }
  *searchDeck(i, filter = () => true, prompt = 'Найдите карту в Скрижали') {
    const cands = this.P(i).deck.filter((c) => filter(this, c));
    if (!cands.length) { this.shuffleDeck(i); return null; }
    const [c] = yield* this.pickFrom(i, cands, { min: 1, max: 1, prompt });
    return c || null;
  }

  // ---------- control, flip, fight ----------
  *takeControl(c, i) {
    if (!this.onField(c) || c.ctrl === i) return false;
    const d = this.def(c);
    const from = this.P(c.ctrl), to = this.P(i);
    if (c.zone === 'field') {
      const slot = c.slot;
      if (to.regions[c.region][slot]) return false;
      from.regions[c.region][slot] = null;
      to.regions[c.region][slot] = c;
    } else {
      from.support.splice(from.support.indexOf(c), 1);
      to.support.push(c);
    }
    c.ctrl = i;
    this.emit('control', { uid: c.uid, player: i, log: `${to.name} завладевает «${d.name}».` });
    return true;
  }
  /** Flip a double-sided card. Wounds stay. Back side may need a region (companion → ally). */
  *flip(c, toId) {
    const p = this.P(c.ctrl);
    const nd = defOf(toId), od = this.def(c);
    if (nd.type === 'ally' && od.type !== 'ally') {
      const regs = this.allyRegions(c.ctrl, c, toId);
      if (!regs.length) return false;
      const r = yield* this.pickRegion(c.ctrl, regs, `Куда положить «${nd.name}»?`);
      this.removeFromZone(c);
      p.regions[r].ally = c; c.zone = 'field'; c.region = r; c.slot = 'ally';
    } else if (nd.type === 'companion' && od.type === 'ally') {
      this.removeFromZone(c);
      p.support.push(c); c.zone = 'support'; c.region = null; c.slot = null;
    } else if (nd.type === 'ally' && od.type === 'place') {
      // Монастырь → Бьянка: любой свободный регион.
      const regs = this.allyRegions(c.ctrl, c, toId);
      if (!regs.length) return false;
      const r = yield* this.pickRegion(c.ctrl, regs, `Куда положить «${nd.name}»?`);
      this.removeFromZone(c);
      p.regions[r].ally = c; c.zone = 'field'; c.region = r; c.slot = 'ally';
    }
    const base = c.faceId || c.id;
    c.faceId = toId === base ? null : base;
    c.id = toId;
    c.tok = toId === 107 ? {} : c.tok;
    this.emit('flip', { uid: c.uid, id: toId, log: `«${od.name}» переворачивается: «${nd.name}».` });
    const sc = this.script(c);
    if (nd.type === 'ally' && od.type !== 'ally') {
      // A card turning into a Союзник appears on the field (Монастырь → Бьянка, Квирк → коза).
      yield* this.trigger('enter', { inst: c, player: c.ctrl, fromHand: false, created: false, flipped: true });
      if (sc.onEnter && this.onField(c)) yield* sc.onEnter(this, c, { flipped: true });
    }
    else if (sc.onFlipIn) yield* sc.onFlipIn(this, c);
    yield* this.checkDeaths();
    return true;
  }
  /** Two characters deal damage equal to their attack to each other (Медведь-шатун). */
  *fight(a, b) {
    this.fx('fight', a, b);
    const da = this.atk(a), db = this.atk(b);
    const defer = [];
    yield* this.damage(a, b, da, { fight: true, defer });
    yield* this.damage(b, a, db, { fight: true, defer });
    yield* this.applyDeathMarks();
    yield* this.checkDeaths();
    yield* this.afterStrikes(defer);
  }
  /** Combat/fight wounds were placed and deaths handled: Кровопийца, then «при нанесении ран» triggers. */
  *afterStrikes(defer) {
    for (const ev of defer) {
      if (ev.src && ev.amount > 0 && this.onField(ev.src) && this.has(ev.src, 'bloodsucker')) {
        yield* this.addTokens(ev.src, 'blood', this.onField(ev.tgt) ? 1 : 2, ev.src);
      }
    }
    for (const ev of defer) yield* this.trigger('damage', ev);
    yield* this.checkDeaths();
  }
  *applyDeathMarks() {
    for (const c of this.characters()) if (c.x.deathMark) { c.x.deathMark = false; if (this.onField(c)) yield* this.dies(c, null); }
  }

  // ---------- battle ----------
  *battlePhase() {
    const s = this.s;
    this.newPhase('battle', null);
    s.inBattle = true; s.battleNo++; s.battled = [];
    const f = s.first;
    this.emit('battleStart', { log: '⚔️ Сражение!' });
    for (const p of [f, 1 - f]) {
      const list = this.field(p).filter((c) => this.script(c).on?.battleStart);
      for (const c of list) { if (this.onField(c)) { yield* this.script(c).on.battleStart(this, c, { player: p }); yield* this.checkDeaths(); } }
      for (const it of this.items(p)) {
        const sc = this.script(it);
        if (it.equip && sc.equipOn?.battleStart) yield* sc.equipOn.battleStart(this, it, this.card(it.equip), { player: p });
      }
    }
    yield* this.window(f, 'battleStart'); yield* this.window(1 - f, 'battleStart');
    // Manoeuvres.
    for (const p of [f, 1 - f]) yield* this.maneuvers(p);
    yield* this.window(f, 'maneuver'); yield* this.window(1 - f, 'maneuver');
    const order = f === 0 ? [0, 1, 2, 3, 4] : [4, 3, 2, 1, 0];
    for (const r of order) {
      yield* this.regionBattle(r);
      s.battled.push(r);
    }
    s.battleRegion = null;
    for (const p of [f, 1 - f]) {
      const list = this.field(p).filter((c) => this.script(c).on?.battleEnd);
      for (const c of list) { if (this.onField(c)) { yield* this.script(c).on.battleEnd(this, c, { player: p }); yield* this.checkDeaths(); } }
    }
    yield* this.window(f, 'battleEnd'); yield* this.window(1 - f, 'battleEnd');
    const id = s.phaseId;
    this.expire((u) => u.phase === id || (u.battle != null && u.battle <= s.battleNo));
    s.inBattle = false;
    yield* this.checkDeaths();
    this.emit('battleEnd', {});
  }
  *maneuvers(p) {
    const moved = new Set();
    for (;;) {
      const free = [...Array(REGIONS).keys()].filter((r) => !this.allyAt(p, r));
      const cands = this.allies(p).filter((a) => this.has(a, 'maneuver') && !moved.has(a.uid));
      if (!free.length || !cands.length) return;
      const a = yield* this.ask(p, { type: 'target', prompt: 'Манёвр: выберите союзника для перемещения (или пропустите)', hint: 'maneuver', options: cands.map((c) => ({ id: c.uid })), cancel: true, auto: false, maneuver: true });
      if (a == null) return;
      const c = this.card(a);
      const r = yield* this.pickRegion(p, free, `Манёвр: куда переместить подсвеченного «${this.name(c)}»?`, 'ally', { optional: true, focus: c.uid });
      if (r == null) { moved.add(c.uid); continue; }
      this.moveAlly(c, r);
      moved.add(c.uid);
    }
  }
  moveAlly(c, r) {
    const p = this.P(c.ctrl);
    const from = c.region;
    p.regions[from].ally = null; p.regions[r].ally = c; c.region = r;
    this.emit('move', { uid: c.uid, from, to: r, log: `«${this.name(c)}» перемещается.` });
  }

  *regionBattle(r) {
    const s = this.s, f = s.first;
    s.battleRegion = r;
    this.emit('regionStart', { region: r });
    for (const p of [f, 1 - f]) {
      const list = this.field(p).filter((c) => this.script(c).on?.regionStart);
      for (const c of list) if (this.onField(c)) yield* this.script(c).on.regionStart(this, c, { region: r, player: p });
    }
    yield* this.window(f, 'regionStart'); yield* this.window(1 - f, 'regionStart');
    // Strike steps: advantage first, then the rest.
    const struck = new Set();
    for (const adv of [true, false]) {
      const units = [this.allyAt(f, r), this.allyAt(1 - f, r)].filter(Boolean);
      const attackers = units.filter((u) => this.onField(u) && u.region === r && !struck.has(u.uid) && (adv ? this.has(u, 'advantage') : true));
      if (!attackers.length) continue;
      // Determine all strikes first (simultaneous), then apply.
      const plans = [];
      for (const a of attackers) {
        struck.add(a.uid);
        a.x.struckBattle = s.battleNo;
        if (this.stunned(a)) { this.emit('stunnedSkip', { uid: a.uid, log: `«${this.name(a)}» оглушён(а) и не атакует.` }); continue; }
        const atk = this.atk(a);
        if (atk <= 0) continue;
        const enemy = this.allyAt(1 - a.ctrl, r);
        plans.push({ a, atk, enemy });
      }
      const defer = [];
      for (const pl of plans) {
        if (!this.onField(pl.a)) continue;
        this.emit('attack', { src: pl.a.uid, tgt: pl.enemy?.uid ?? null, region: r });
        if (pl.enemy && this.onField(pl.enemy)) yield* this.strikeAlly(pl.a, pl.enemy, pl.atk, defer);
        else yield* this.strikeFace(pl.a, 1 - pl.a.ctrl, pl.atk, defer, { fromBT: false });
      }
      // Wounds placed → deaths (and on-destroy triggers) → on-damage triggers.
      yield* this.applyDeathMarks();
      yield* this.checkDeaths();
      yield* this.afterStrikes(defer);
    }
    for (const p of [f, 1 - f]) {
      const list = this.field(p).filter((c) => this.script(c).on?.regionEnd);
      for (const c of list) if (this.onField(c)) yield* this.script(c).on.regionEnd(this, c, { region: r, player: p });
    }
    yield* this.window(f, 'regionEnd'); yield* this.window(1 - f, 'regionEnd');
  }
  *strikeAlly(a, e, atk, defer) {
    const bt = this.has(a, 'breakthrough');
    const dt = this.has(a, 'deathtouch');
    if (bt && dt && !this.has(e, 'indestructible')) {
      yield* this.damage(a, e, 1, { combat: true, defer });
      e.x.deathMark = true;
      if (atk - 1 > 0) yield* this.strikeFace(a, e.ctrl, atk - 1, defer, { fromBT: true });
      return;
    }
    const rem = this.hp(e);
    const dealt = yield* this.damage(a, e, atk, { combat: true, defer });
    const excess = atk - Math.max(0, rem);
    if (bt && excess > 0) yield* this.strikeFace(a, e.ctrl, excess, defer, { fromBT: true });
  }
  /** Combat wounds to the enemy Leader or a Companion (attacker's choice), with Оборона redirects. */
  *strikeFace(a, side, amount, defer, { fromBT }) {
    const L = this.leader(side);
    const comps = this.companions(side);
    let target = L;
    if (comps.length) {
      target = yield* this.pickCard(a.ctrl, [L, ...comps], `«${this.name(a)}» атакует: Лидера или Напарника?`, 'face');
    }
    // Оборона. A card with Прорыв pushes the rest through to the Leader even after a redirect (17.5.1).
    const bt = fromBT || this.has(a, 'breakthrough');
    let left = amount;
    const used = new Set();
    for (;;) {
      const defenders = this.characters(side).filter((c) => c !== target && this.cardType(c) !== 'leader' && this.has(c, 'defense') && this.onField(c) && !used.has(c.uid) && this.hp(c) > 0);
      if (!defenders.length || left <= 0) break;
      const d = yield* this.ask(side, { type: 'target', prompt: `Оборона: перенаправить ${left} ран(ы) с «${this.name(target)}»?`, hint: 'defense', options: defenders.map((c) => ({ id: c.uid })), cancel: true, auto: false, defense: true });
      if (d == null) break;
      const dc = this.card(d);
      used.add(dc.uid);
      this.fx('defense', dc, target);
      const rem = this.hp(dc);
      yield* this.damage(a, dc, left, { combat: true, defer });
      left = left - Math.max(0, rem);
      if (!bt) { left = 0; break; }
    }
    if (left > 0) {
      const t = (bt && used.size) ? L : target;
      yield* this.damage(a, t, left, { combat: true, defer });
      // Пырей etc. react to breakthrough hits via 'damage' trigger with ev.bt.
      if (defer.length) defer[defer.length - 1].bt = fromBT;
    }
  }

  // ---------- views ----------
  /** Plain object describing the game for a viewer (hides opponent's hand and decks). */
  view(viewer = null) {
    const s = this.s;
    const ci = (c, hidden = false) => {
      if (!c) return null;
      if (hidden) return { uid: c.uid, hidden: true };
      const d = this.def(c);
      const o = { uid: c.uid, id: c.id, owner: c.owner, ctrl: c.ctrl, zone: c.zone };
      if (['field', 'support', 'leader'].includes(c.zone)) {
        Object.assign(o, {
          atk: d.type === 'ally' ? this.atk(c) : null, hp: ['ally', 'companion', 'leader'].includes(d.type) ? this.hp(c) : null,
          maxHp: ['ally', 'companion'].includes(d.type) ? this.maxHp(c) : d.type === 'leader' ? d.hp : null,
          baseAtk: d.atk, baseHp: d.hp, dmg: c.dmg, tok: { ...c.tok }, stunned: this.stunned(c), created: c.created,
          kws: Object.keys(KW_RU).filter((k) => this.has(c, k)), equip: c.equip, region: c.region,
          abilities: d.type === 'leader' ? (this.script(c).abilities || []).map((ab) => ({ name: ab.name, cost: this.abilityCost(c, ab), fast: !!ab.fast })) : undefined,
          extraTypes: c.extraTypes,
          tmpHp: c.mods.filter((m) => m.until).reduce((n, m) => n + (m.hp || 0), 0), tmpAtk: c.mods.filter((m) => m.until).reduce((n, m) => n + (m.atk || 0), 0),
        });
      } else if (c.zone === 'hand') {
        o.cost = this.costOf(c.ctrl, c);
      }
      return o;
    };
    return {
      round: s.round, phase: s.phase, turn: s.turn, first: s.first, over: s.over, winner: s.winner,
      battleRegion: s.battleRegion, inBattle: s.inBattle, skipBattles: s.skipBattles,
      stack: s.stack.map((it) => ({ kind: it.kind, player: it.player, uid: it.inst.uid, id: it.inst.id, label: it.label, targets: it.ctx.targets })),
      players: s.players.map((p) => {
        const hide = viewer != null && viewer !== p.i && !p.openHand && !this.field(1 - p.i).some((c) => c.id === 146);
        return {
          i: p.i, name: p.name, coins: p.coins, deckCount: p.deck.length,
          hand: p.hand.map((c) => ci(c, hide)), handCount: p.hand.length,
          grave: p.grave.map((c) => ci(c)), exileCount: p.exile.length,
          leader: ci(p.leader), support: p.support.map((c) => ci(c)),
          regions: p.regions.map((r) => ({ ally: ci(r.ally), place: ci(r.place) })),
          mull: p.mull ? p.mull.map((c) => ci(c, viewer != null && viewer !== p.i)) : null,
        };
      }),
      log: s.log.slice(-60),
      logRefs: (s.logRefs || []).slice(-60),
    };
  }
}
