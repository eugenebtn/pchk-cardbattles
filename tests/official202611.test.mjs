// Isolated registration permits testing before the shared catalog imports land.
import { CARDS } from '../js/data/cards.js';
import { SCRIPTS } from '../js/cards/index.js';
import { OFFICIAL_202611_CARDS } from '../js/data/official202611.js';
import scripts from '../js/cards/official202611.js';
import { makeGame, put, addHand, ans, runUntil, defaultAnswer, test, eq, ok, done } from './helpers.mjs';
Object.assign(CARDS, OFFICIAL_202611_CARDS);
Object.assign(SCRIPTS, scripts);
const answer = q => q.type === 'order' ? q.options.map(o=>o.id) : defaultAnswer(q);
const main = (g, f = answer) => runUntil(g, q => q.type === 'main', f);
const play = (g,c) => ans(g, `play:${c.uid}:${c.id}`);
const yes = q => q.type === 'pick' && q.options[0]?.label === 'Да' ? 1 : answer(q);

test('Офицер: только своя Тактика, добровольный Рядовой с Обороной; рост стражи', () => {
 const g=makeGame(); put(g,0,379,0); const guard=put(g,0,380,1);
 const a=addHand(g,0,382); main(g); play(g,a); main(g,yes);
 const token=g.allies(0).find(c=>c.id===903); ok(token); eq(g.atk(token),2); eq(g.hp(token),2); ok(g.has(token,'defense')); ok(token.created); eq(g.atk(guard),2);
});
test('Офицер: можно отказаться; обычное Действие не создаёт Рядового', () => {
 const g=makeGame(); put(g,0,379,0); const a=addHand(g,0,382); main(g); play(g,a); main(g,q=>q.type==='pick' && q.options[0]?.label==='Да'?0:answer(q)); eq(g.allies(0).length,1);
 const b=addHand(g,0,23); let it=scripts[379].on.cardUsed(g,g.allyAt(0,0),{player:1,def:CARDS[382]}); ok(it.next().done);
 it=scripts[379].on.cardUsed(g,g.allyAt(0,0),{player:0,def:{subtypes:[]}}); ok(it.next().done);
});
test('Стража: другой свой Солдат с руки; себя и врага не считает', () => {
 const g=makeGame(); const a=addHand(g,0,380), b=addHand(g,0,380); main(g); play(g,a); ans(g,0); main(g); eq(g.atk(a),1);
 play(g,b); ans(g,1); main(g); eq(g.atk(a),2); eq(g.atk(b),1);
 const it=scripts[380].on.enter(g,a,{inst:{ctrl:1,id:381}}); ok(it.next().done); eq(g.atk(a),2);
});
test('Надзиратель: скидка только за своих Солдат; Оборона', () => {
 const g=makeGame(); const c=addHand(g,0,381); eq(g.costOf(0,c),6);
 put(g,0,380,0); put(g,0,379,1); put(g,1,381,0); eq(g.costOf(0,c),4);
 main(g); play(g,c); ans(g,2); main(g); ok(g.has(c,'defense')); eq(g.atk(c),4); eq(g.maxHp(c),4);
});
test('Планирование: перестановка двух верхних, затем добор первой', () => {
 const g=makeGame(); const a=addHand(g,0,382); main(g); const [x,y]=g.P(0).deck;
 play(g,a); main(g,q=>q.type==='order'?[y.uid,x.uid]:defaultAnswer(q)); ok(g.P(0).hand.includes(y)); eq(g.P(0).deck[0],x);
});
test('Планирование: обе в могилу, затем добор третьей; пустая колода безопасна', () => {
 const g=makeGame(); let a=addHand(g,0,382); const b=addHand(g,0,382); main(g); const [x,y,z]=g.P(0).deck;
 play(g,a); main(g,q=>q.type==='multi'?q.options.map(o=>o.id):defaultAnswer(q)); ok(g.P(0).grave.includes(x)); ok(g.P(0).grave.includes(y)); ok(g.P(0).hand.includes(z));
 for(const c of [...g.P(0).deck]) g.removeFromZone(c); a=b; play(g,a); main(g); ok(g.P(0).grave.includes(a));
});
for(const [owner,id,da,dh] of [[0,380,2,2],[1,381,2,-2],[0,1,2,-2]]) test(`Взор: цель ${owner}/${id}`,()=>{
 const g=makeGame(); const t=put(g,owner,id,0), atk=g.atk(t),hp=g.maxHp(t); const a=addHand(g,0,383); main(g); play(g,a); ans(g,t.uid); main(g); eq(g.atk(t),atk+da); eq(g.maxHp(t),hp+dh);
});
test('Взор: уменьшение здоровья до нуля уничтожает цель',()=>{
 const g=makeGame(); const t=put(g,1,380,0); const a=addHand(g,0,383); main(g); play(g,a); ans(g,t.uid); main(g); ok(g.P(1).grave.includes(t));
});
test('Офицер: при полном поле не предлагает создание',()=>{
 const g=makeGame(); const o=put(g,0,379,0); for(let r=1;r<5;r++)put(g,0,380,r);
 ok(scripts[379].on.cardUsed(g,o,{player:0,def:CARDS[382]}).next().done);
});
test('Взор: усиление остаётся после конца хода',()=>{
 const g=makeGame(); const t=put(g,0,381,0),a=addHand(g,0,383); main(g); play(g,a); ans(g,t.uid); main(g); ans(g,'end');
 runUntil(g,q=>q.type==='main' && g.s.turn===1,answer); eq(g.atk(t),6);eq(g.maxHp(t),6);
});
done();
