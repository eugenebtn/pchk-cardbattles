// Experimental show-inspired decks. IDs agreed with js/data/experimental.js.
const mine = (g, s, e) => e.player === s.ctrl;
const ally = (g, c) => g.cardType(c) === 'ally';
const price = (g, c) => typeof g.def(c).cost === 'number' ? g.def(c).cost : 0;
const undead = (g, c) => ['ДЕМОН', 'ВАМПИР', 'МЕРТВЕЦ'].some(t => g.isType(c, t));
const enemyDeath = (g, s, e) => e.ctrl !== s.ctrl && ally(g, e.inst);
const ownDeathHere = (g, s, e) => e.ctrl === s.ctrl && e.region === s.region && ally(g, e.inst);
const income = n => function* (g, s, e) { if (mine(g, s, e)) yield* g.gainCoins(s.ctrl, n, s); };
const spec = (kind = 'ally', side = 'enemy', filter) => ({ kind, side, filter });
function* pick(g, s, target, prompt) { return yield* g.pickCard(s.ctrl, g.targetCandidates(s.ctrl, target), prompt); }
function* area(g, s, region, n, both = false, exclude = null) {
  // Snapshot before damage: deaths and their triggers must not add new victims.
  const cards = g.allies().filter(c => c.region === region && (both || c.ctrl !== s.ctrl) && c !== exclude);
  for (const c of cards) if (g.onField(c)) yield* g.damage(s, c, n);
}
const enterHit = (n, filter, kind = 'ally') => ({ *onEnter(g, s) { const t = yield* pick(g, s, spec(kind, 'enemy', filter), 'Выберите вражескую цель'); if (t) yield* g.damage(s, t, n); } });
const enterStun = filter => ({ *onEnter(g, s) { const t = yield* pick(g, s, spec('ally', 'enemy', filter), 'Оглушите вражеского Союзника'); if (t) g.stun(t, s); } });
const S = {
  1001: {
    on: {
      *turnStart(g, s, e) { if (!mine(g, s, e)) return; const t = yield* pick(g, s, spec(), 'Остановить войну любовью: −1/−0'); if (t) yield* g.buff(t, -1, 0, 'nextTurn', s); },
      *heal(g, s, e) { if (e.amount > 0 && e.tgt.ctrl === s.ctrl) yield* g.addTokens(s, 'goods', 1); },
    },
    abilities: [{ name: 'Добрые дела', cost: { goods: 3 }, *effect(g, c) { yield* g.draw(c.player, 1); } }],
  },
  1002: {
    on: {
      *turnStart(g, s, e) { if (mine(g, s, e)) yield* g.addTokens(s, 'goods', 1); },
      *destroyed(g, s, e) { if (enemyDeath(g, s, e) && g.allyAt(s.ctrl, e.region)) yield* g.addTokens(s, 'goods', 1); },
    },
    abilities: [{ name: 'Хозяин горы', cost: { goods: 5 },
      *plan(g, c) { c.region = yield* g.pickRegion(c.player, [0,1,2,3,4], 'Драконье пламя: выберите регион'); },
      *effect(g, c) { yield* area(g, c.self, c.region, 3); },
    }],
  },
  1003: {
    static: { costMod(g, s, p, c, d) { return p === s.ctrl && g.s.phase === 'turn' && g.s.turn === p && s.x.demonTurn !== g.s.turnStamp && d.subtypes.includes('ДЕМОН') ? -1 : 0; } },
    on: {
      *cardUsed(g, s, e) { if (mine(g, s, e) && g.s.phase === 'turn' && g.s.turn === s.ctrl && e.def.subtypes.includes('ДЕМОН')) s.x.demonTurn = g.s.turnStamp; },
      *destroyed(g, s, e) { if (enemyDeath(g, s, e)) yield* g.addTokens(s, 'goods', 1); },
    },
    abilities: [{ name: 'Во имя Асмодея!', cost: { goods: 2 }, *effect(g, c) { yield* g.gainCoins(c.player, 3, c.self); } }],
  },
  1004: {
    on: { *destroyed(g, s, e) { if (e.ctrl === s.ctrl && ally(g, e.inst) && typeof e.cost === 'number' && e.cost <= 2) yield* g.gainCoins(s.ctrl, 1, s); } },
    abilities: [{ name: 'Экспресс-курсы жрецов', cost: { coins: 2 }, limit: 'turn', targets: spec('character', 'own'), *effect(g, c) { yield* g.heal(g.card(c.targets[0]), 2, c.self); } }],
  },
  1011: { *onEnter(g, s) { const t = yield* pick(g, s, spec('character', 'own'), 'Перо грифона: исцелите 3 раны'); if (t) yield* g.heal(t, 3, s); } },
  1012: {
    *onEnter(g, s) { const t = yield* pick(g, s, spec('ally', 'own'), 'Прикрепите меч к вашему Союзнику'); if (t) { s.equip = t.uid; g.emit('equip', { uid: s.uid, tgt: t.uid }); } },
    static: { atk: (g,s,c) => s.equip === c.uid ? 2 : 0, hp: (g,s,c) => s.equip === c.uid ? 1 : 0 },
    on: { *destroyed(g,s,e) { if (enemyDeath(g,s,e) && (e.killerEquipment?.includes(s.uid) || (s.equip && e.by?.uid === s.equip))) yield* g.heal(g.leader(s.ctrl),2,s); } },
  },
  1013: { on: { *destroyed(g,s,e) { if (enemyDeath(g,s,e)) yield* g.gainCoins(s.ctrl,1,s); } } },
  1014: enterStun((g,c) => price(g,c) <= 3),
  1015: { static: { atk(g,s,c) { const enemy = g.allyAt(1-s.ctrl,s.region); return c === s && enemy && undead(g,enemy) ? 2 : 0; } } },
  1016: { abilities: [{ name: 'Вызвать Ангела', fast: true, cost: { selfDestroy: true }, can: (g,s) => g.allyRegions(s.ctrl, { ...s, id:1091 },1091).length > 0, *effect(g,c) { yield* g.create(c.player,1091); } }] },
  1017: { on: { *enter(g,s,e) { if (e.inst.ctrl !== s.ctrl && ally(g,e.inst) && e.inst.region === s.region) yield* g.damage(s,e.inst,1); } } },
  1018: { *onEnter(g,s) {
    yield* g.draw(s.ctrl,1);
    const p=g.P(s.ctrl),top=p.deck.slice(0,2);
    yield* g.plan(s.ctrl,2);
    const rest=top.filter(c=>p.deck.includes(c));
    if(rest.length>1) {
      const ids=yield* g.ask(s.ctrl,{type:'order',prompt:'Лосик: порядок верхних карт (первая — выше)',options:rest.map(c=>({id:c.uid,cardId:c.id})),reveal:true});
      const ordered=[...new Set([...ids.map(uid=>rest.find(c=>c.uid===uid)).filter(Boolean),...rest])];
      for(const c of rest) g.removeFromZone(c);
      p.deck.unshift(...ordered);
    }
  } },
  1019: { on: { turnStart: income(1) }, static: { atk: (g,s,c) => c.ctrl !== s.ctrl && ally(g,c) && c.region === s.region ? -1 : 0 } },
  1020: { *onDestroyed(g,s,e) { const cards = yield* g.pickFrom(e.ctrl,g.P(e.ctrl).grave.filter(c => ally(g,c)),{min:0,max:2,prompt:'Портал на небеса: до двух Союзников в руку'}); for (const c of cards) yield* g.toHand(c); yield* g.heal(g.leader(e.ctrl),3,s); } },
  1031: { *onEnter(g,s) { yield* area(g,s,s.region,1); } },
  1032: enterHit(2,(g,c) => g.isType(c,'ДВАРФ') || g.isType(c,'ГНОМ'), 'character'),
  1033: { *onEnter(g,s) { yield* g.create(s.ctrl,1034); } },
  1034: { abilities: [{ name:'Бодрящий шашлычок',fast:true,cost:{selfDestroy:true},targets:spec('ally','own'), *effect(g,c) { const t=g.card(c.targets[0]); yield* g.buff(t,2,0,'phase',c.self); g.grant(t,'breakthrough','phase',c.self); } }] },
  1035: { on: { turnStart:income(1) } },
  1036: { on: { turnStart:income(2) }, abilities:[{ name:'Извержение',cost:{coins:4},limit:'turn', *effect(g,c) { yield* area(g,c.self,c.self.region,2,true); } }] },
  1037: { on: { turnStart:income(1) },abilities:[{name:'Драконобойка',cost:{coins:3},limit:'turn',can:(g,s)=>g.targetCandidates(s.ctrl,spec('ally','enemy',(g,t)=>t.region===s.region)).length>0, *plan(g,c) { if(!(yield* g.chooseTarget(c,spec('ally','enemy',(g,t)=>t.region===c.self.region)))) return false; }, *effect(g,c) { yield* g.damage(c.self,g.card(c.targets[0]),3); }}] },
  1038: { on:{ *battleStart(g,s) { yield* area(g,s,s.region,1); } } },
  1039: enterStun((g,c) => g.isType(c,'ЖИВОТНОЕ')),
  1040: { on:{ turnStart:income(1), *damage(g,s,e) { if (e.tgt === g.leader(s.ctrl) && e.amount > 0 && e.src && e.src.ctrl !== s.ctrl && ally(g,e.src)) yield* g.addTokens(g.leader(s.ctrl),'goods',1); } } },
  1051: { on:{ *battleStart(g,s) { yield* area(g,s,s.region,1,true,s); } } },
  1052: {},
  1053: { *onDestroyed(g,s,e) { yield* area(g,{...s,ctrl:e.ctrl},e.region,1); } },
  1054: { static:{ atk:(g,s,c) => c !== s && c.ctrl === s.ctrl && g.isType(c,'ДЕМОН') ? 1:0, hp:(g,s,c) => c !== s && c.ctrl === s.ctrl && g.isType(c,'ДЕМОН') ? 1:0 } },
  1055: { abilities:[{name:'Поглотить зеркалом',cost:{selfDestroy:true},targets:spec('ally','enemy',(g,c) => price(g,c)<=4), *effect(g,c) { yield* g.toDeckBottom(g.card(c.targets[0])); }}] },
  1056: { *effect(g,c) { const top=g.P(c.player).deck[0]; yield* g.draw(c.player,1); if(top && g.isType(top,'ДЕМОН')) yield* g.draw(c.player,1); } },
  1057: { on:{ turnStart:income(1), *destroyed(g,s,e) { if(ownDeathHere(g,s,e)) yield* g.addTokens(g.leader(s.ctrl),'goods',1); } } },
  1058: { on:{ *turnStart(g,s,e) { if(!mine(g,s,e)) return; const t=yield* g.pickCard(s.ctrl,g.allies(s.ctrl),'Топка: уничтожить Союзника?', 'harm',{optional:true}); if(t && (yield* g.destroy(t,s))) { yield* g.gainCoins(s.ctrl,3,s); yield* g.draw(s.ctrl,1); } } } },
  1059: { *onEnter(g,s) { const t=yield* pick(g,s,spec('character','enemy'),'Демонический контракт: 3 раны врагу'); yield* g.damage(s,g.leader(s.ctrl),3); if(t) yield* g.damage(s,t,3); } },
  1060: { *onEnter(g,s) { const cards=yield* g.pickFrom(s.ctrl,g.P(1-s.ctrl).grave,{min:0,max:2,prompt:'Уберите до двух карт из вражеского кладбища'}); const allAllies=cards.length>0 && cards.every(c=>ally(g,c)); for(const c of cards) yield* g.exile(c); if(allAllies) yield* g.addTokens(g.leader(s.ctrl),'goods',1); } },
  1071: { *onDestroyed(g,s,e) { const t=yield* pick(g,{...s,ctrl:e.ctrl},spec('ally','enemy',(g,c)=>c.region===e.region),'Старые вилы: 1 рана'); if(t) yield* g.damage(s,t,1); } },
  1072: { *onDestroyed(g,s,e) { const c=yield* g.searchDeck(e.ctrl,(g,c)=>c.id===1073,'Свисток для Бима'); if(c) { g.emit('shown',{player:e.ctrl,ids:[c.id]}); yield* g.toHand(c); } g.shuffleDeck(e.ctrl); } },
  1073: { *onEnter(g,s) { const hand=g.P(1-s.ctrl).hand; if(hand.length) yield* g.ask(s.ctrl,{type:'multi',min:0,max:0,options:hand.map(c=>({id:c.uid,cardId:c.id})),prompt:'Разведка: рука противника',reveal:true}); } },
  1074: { *onDestroyed(g,s,e) { yield* g.draw(e.ctrl,1); } },
  1075: {},
  1076: enterHit(2),
  1077: { on:{ *destroyed(g,s,e) { if(e.inst!==s && ownDeathHere(g,s,e)) yield* g.buff(s,1,1,'perm',s); } } },
  1078: { *onEnter(g,s) { yield* g.draw(s.ctrl,1); } },
  1079: { targets:{kind:'character',side:'enemy',filter:(g,c)=>ally(g,c)||undead(g,c)}, *effect(g,c) { const t=g.card(c.targets[0]); yield* g.damage(c.self,t,undead(g,t)?4:2); } },
  1080: { on:{ turnStart:income(1), *destroyed(g,s,e) { if(ownDeathHere(g,s,e)) yield* g.damage(s,g.leader(1-s.ctrl),1); } } },
  1091: { static: { kw: (g,s,c,kw) => c === s && kw === 'ward' } },
};
export default S;




