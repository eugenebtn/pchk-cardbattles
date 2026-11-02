// Independent QA. Run with node --test; no production edits or live services.
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeGame,put,addHand,toMain,ans,defaultAnswer,useAbility,endTurn,runUntil} from './helpers.mjs';

function drive(gen, answer=defaultAnswer) {
  let r=gen.next();
  for(let k=0; !r.done; k++) {
    assert.ok(k<100,'generator bounded');
    r=gen.next(answer(r.value));
  }
  return r.value;
}
const game=(leader=1004, enemy=1004)=>makeGame({p0:{leader},p1:{leader:enemy}});

test('Дудуш: текст позволяет выбрать вражеского Напарника-Дварфа',()=>{
  const g=game(), b=put(g,1,16), d=put(g,0,1032,0);
  const gen=g.script(d).onEnter(g,d), r=gen.next();
  assert.equal(r.done,false,'должен запросить Дварфа, даже если это Напарник');
  assert.ok(r.value.options.some(o=>o.id===b.uid));
  assert.equal(gen.next(b.uid).done,true); assert.equal(b.dmg,2);
});
test('Дудуш: текст позволяет выбрать вражеского Лидера-Гнома Талалу',()=>{
  const g=game(1004,1001), d=put(g,0,1032,0);
  const r=g.script(d).onEnter(g,d).next();
  assert.equal(r.done,false,'Талала — вражеский Гном');
  assert.ok(r.value.options.some(o=>o.id===g.leader(1).uid));
});
test('Бим: вопрос с открытой рукой видит контролирующий; view наблюдателя остаётся скрытым',()=>{
  const g=game(), secret=addHand(g,1,7), dog=put(g,0,1073,0);
  const gen=g.script(dog).onEnter(g,dog), q=gen.next().value;
  assert.equal(q.player,0); assert.equal(q.options[0].cardId,7);
  for(const viewer of [0,-1]) {
    const hand=g.view(viewer).players[1].hand;
    assert.ok(!hand.some(c=>c.id===secret.id),'нет постоянного раскрытия руки');
  }
  assert.equal(gen.next([]).done,true);
});
test('Мираторг: массовый урон проходит через Оберег',()=>{
  const g=game(), target=put(g,1,1091,0), src=put(g,0,1031,0);
  drive(g.script(src).onEnter(g,src)); assert.equal(target.dmg,1);
});
test('Айсидора: направленное свойство не выбирает Оберег',()=>{
  const g=game(), target=put(g,1,1091,0), src=put(g,0,1076,0);
  assert.equal(g.script(src).onEnter(g,src).next().done,true);
  assert.equal(target.dmg,0);
});
test('Пахом под чужим контролем: карты и лечение получает последний контролирующий',()=>{
  const g=game(), p=put(g,0,1020,0);
  drive(g.takeControl(p,1)); g.leader(1).hpNow-=5;
  drive(g.destroy(p),q=>q.type==='multi'?[]:defaultAnswer(q));
  assert.equal(g.leader(1).hpNow,26); assert.equal(p.zone,'grave');
  assert.ok(g.P(0).grave.includes(p)); assert.equal(g.leader(0).hpNow,28);
});
test('Юлиан: отмена выбора не оплачивает и не расходует использование за ход',()=>{
  const g=game(); toMain(g); const l=g.leader(0), coins=g.P(0).coins;
  ans(g,`ab:${l.uid}:0`); ans(g,null);
  assert.equal(g.P(0).coins,coins); assert.ok(g.canUseAbility(0,l,0,{main:true}));
});
test('Юлиан: после использованного лечения право возвращается в следующий собственный ход',()=>{
  const g=game(); toMain(g); const l=g.leader(0); l.hpNow-=5;
  useAbility(g,l,0,[l]); assert.equal(g.canUseAbility(0,l,0,{main:true}),false);
  const r=g.s.round; endTurn(g);
  runUntil(g,q=>g.s.round>r && g.s.turn===0 && q.type==='main');
  assert.ok(g.canUseAbility(0,l,0,{main:true}));
});
for (const seat of [0,1]) test(`Меч: взаимное убийство всё равно лечит Лидера (место ${seat})`,()=>{
  const g=game(); const wearer=put(g,seat,9,0), sword=put(g,seat,1012);
  const enemy=put(g,1-seat,4,0); enemy.dmg=4;
  drive(g.script(sword).onEnter(g,sword),()=>wearer.uid);
  const l=g.leader(seat); l.hpNow-=5; const before=l.hpNow;
  // Combat's actual simultaneous damage path, including death ordering.
  g.s.battleRegion=0;
  const defer=[];
  drive(g.damage(wearer,enemy,4,{combat:true,defer}));
  drive(g.damage(enemy,wearer,4,{combat:true,defer}));
  drive(g.checkDeaths());
  assert.equal(wearer.zone,'grave'); assert.equal(enemy.zone,'grave');
  assert.equal(l.hpNow,before+2,'носитель уничтожил врага одновременным ударом');
});
test('Лосик: запланировать 2 означает выбрать также порядок оставшихся карт',()=>{
  const g=game(), s=put(g,0,1018,0), [drawn,a,b]=g.P(0).deck;
  const gen=g.script(s).onEnter(g,s);
  const discard=gen.next(); assert.equal(discard.value.type,'multi');
  const order=gen.next([]);
  assert.equal(order.done,false,'после отказа от сброса нужно предложить порядок двух карт');
  assert.equal(order.value.type,'order');
  assert.equal(gen.next([b.uid,a.uid]).done,true);
  assert.equal(g.P(0).deck[0],b); assert.ok(g.P(0).hand.includes(drawn));
});
test('Зеркало: Оберег, полученный в ответ, отменяет эффект, но не возвращает оплату',()=>{
  const g=game(1004,20), mirror=put(g,0,1055), target=put(g,1,9,0);
  toMain(g);
  const gen=g.declareAbility(0,mirror,0);
  const choose=gen.next(); assert.equal(choose.value.type,'target');
  const response=gen.next(target.uid);
  assert.equal(response.value.type,'priority'); assert.equal(mirror.zone,'grave');
  // State after a response granting ward, before the original effect resolves.
  g.grant(target,'ward','phase',g.leader(1));
  let r=gen.next('pass');for(let k=0;!r.done;k++){assert.ok(k<30);r=gen.next(defaultAnswer(r.value));}
  assert.equal(target.zone,'field'); assert.equal(mirror.zone,'grave');
});
