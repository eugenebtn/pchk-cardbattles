import test from 'node:test';
import assert from 'node:assert/strict';
import {makeGame,put,addHand,toMain,ans,runUntil,defaultAnswer} from './helpers.mjs';
import {CARDS} from '../js/data/cards.js';

const main=g=>runUntil(g,q=>q.type==='main',q=>q.type==='order'?q.options.map(o=>o.id):defaultAnswer(q));
test('СОЛДАТ: скидка считает созданных и Напарников, но не врагов; минимум ноль',()=>{
  const g=makeGame(), c=addHand(g,0,381);
  assert.equal(g.costOf(0,c),6);
  put(g,1,381,0); assert.equal(g.costOf(0,c),6);
  const comp=put(g,0,16); comp.extraTypes.push('СОЛДАТ');
  for(let r=0;r<5;r++)put(g,0,903,r);
  assert.equal(g.costOf(0,c),0);
  g.leader(0).extraTypes.push('СОЛДАТ'); assert.equal(g.costOf(0,c),0);
});
test('Офицер: отказ и отсутствие места не создают Рядового',()=>{
  const g=makeGame(), o=put(g,0,379,0), ev={player:0,def:CARDS[382]};
  const gen=g.script(o).on.cardUsed(g,o,ev);
  assert.equal(gen.next().value.type,'pick');
  assert.equal(gen.next(0).done,true); assert.equal(g.allies(0).length,1);
  for(let r=1;r<5;r++)put(g,0,380,r);
  assert.equal(g.script(o).on.cardUsed(g,o,ev).next().done,true);
});
test('Планирование: сбросить ровно одну, оставшуюся взять, третью оставить наверху',()=>{
  const g=makeGame(), action=addHand(g,0,382);toMain(g);
  const [a,b,c]=g.P(0).deck;
  ans(g,`play:${action.uid}:382`);
  runUntil(g,q=>q.type==='multi'); ans(g,[a.uid]); main(g);
  assert.ok(g.P(0).grave.includes(a));assert.ok(g.P(0).hand.includes(b));assert.equal(g.P(0).deck[0],c);
});
test('Планирование: порядок двух карт разрешается до добора',()=>{
  const g=makeGame(), action=addHand(g,0,382);toMain(g);
  const [a,b,c]=g.P(0).deck;
  ans(g,`play:${action.uid}:382`);runUntil(g,q=>q.type==='multi');ans(g,[]);
  assert.equal(g.pending.type,'order');ans(g,[b.uid,a.uid]);main(g);
  assert.ok(g.P(0).hand.includes(b));assert.equal(g.P(0).deck[0],a);assert.equal(g.P(0).deck[1],c);
});
test('Взор: чужой Оберег исключён, собственный Оберег остаётся допустимой целью',()=>{
  const g=makeGame(), action=addHand(g,0,383), enemy=put(g,1,1091,0), own=put(g,0,1091,0);
  toMain(g);ans(g,`play:${action.uid}:383`);
  assert.ok(g.pending.options.some(o=>o.id===own.uid));
  assert.ok(!g.pending.options.some(o=>o.id===enemy.uid));
});
