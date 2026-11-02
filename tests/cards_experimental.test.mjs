import {makeGame,put,addGrave,toMain,test,eq,ok,done,defaultAnswer,useAbility,ans} from './helpers.mjs';
import S from '../js/cards/experimental.js';
import {EXPERIMENTAL_CARDS} from '../js/data/experimental.js';
const game=(leader=1004)=>makeGame({p0:{leader},p1:{leader:1004}});
function drive(gen,answers=[]) {let r=gen.next(),n=0;while(!r.done){if(++n>100)throw Error('loop');r=gen.next(answers.length?answers.shift():defaultAnswer(r.value));}return r.value;}
const enter=(g,c,a=[])=>drive(g.script(c).onEnter(g,c),a);
const effect=(g,id,ts=[])=>drive(S[id].effect(g,{self:g.newInst(id,0,'stack'),player:0,targets:ts.map(c=>c.uid)}));
test('All 45 definitions have scripts',()=>{eq(Object.keys(EXPERIMENTAL_CARDS).length,45);for(const id of Object.keys(EXPERIMENTAL_CARDS))ok(S[id],id);});
test('Talala counts actual healing only',()=>{const g=game(1001),l=g.leader(0);drive(g.heal(l,3));eq(l.tok.goods||0,0);l.hpNow-=5;drive(g.heal(l,3));eq(l.tok.goods,1);g.leader(1).hpNow--;drive(g.heal(g.leader(1),1));eq(l.tok.goods,1);});
test('Talala debuff expires at next own turn',()=>{const g=game(1001),a=put(g,1,9,0),n=g.atk(a);drive(S[1001].on.turnStart(g,g.leader(0),{player:0}),[a.uid]);eq(g.atk(a),n-1);g.expire(u=>u.turnOf===0);eq(g.atk(a),n);});
test('Dragon gold requires own ally in death region',()=>{const g=game(1002);put(g,0,9,0);drive(g.destroy(put(g,1,9,0)));eq(g.leader(0).tok.goods,1);drive(g.destroy(put(g,1,9,1)));eq(g.leader(0).tok.goods,1);});
test('Misha discount consumed by first Demon, resets next turn',()=>{const g=game(1003);toMain(g);const c=g.newInst(1052,0,'hand');eq(g.costOf(0,c,c.id),3);drive(S[1003].on.cardUsed(g,g.leader(0),{player:0,def:g.def(c)}));eq(g.costOf(0,c,c.id),4);g.s.turnStamp++;eq(g.costOf(0,c,c.id),3);g.s.turn=1;eq(g.costOf(0,c,c.id),4);});
test('Yulian only refunds cheap own allies',()=>{const g=game(),n=g.P(0).coins;drive(g.destroy(put(g,0,1071,0)));eq(g.P(0).coins,n+1);drive(g.destroy(put(g,0,1076,0)));eq(g.P(0).coins,n+1);});
test('Griffin heals selected own character',()=>{const g=game();g.leader(0).hpNow-=4;enter(g,put(g,0,1011,0),[g.leader(0).uid]);eq(g.hp(g.leader(0)),27);});
test('Sword buffs wearer and heals after its kill',()=>{const g=game(),a=put(g,0,9,0),s=put(g,0,1012),n=g.atk(a);g.leader(0).hpNow-=4;enter(g,s,[a.uid]);eq(g.atk(a),n+2);drive(g.damage(a,put(g,1,1071,0),2));eq(g.hp(g.leader(0)),26);});
test('Fairy earns for enemy deaths',()=>{const g=game();put(g,0,1013,0);const n=g.P(0).coins;drive(g.destroy(put(g,1,9,0)));eq(g.P(0).coins,n+1);});
test('Stella and island auras respect region and subtype',()=>{const g=game(),s=put(g,0,1015,0);eq(g.atk(s),3);const d=put(g,1,1052,0);eq(g.atk(s),5);put(g,0,1019,0);eq(g.atk(d),1);});
test('Kuzya hits enemy entering its region',()=>{const g=game();put(g,0,1017,0);const c=g.newInst(9,1,'hand');drive(g.putOnField(c,1,0));eq(c.dmg,1);});
test('Pakhom may return himself plus another ally and heals',()=>{const g=game(),a=addGrave(g,0,1071),p=put(g,0,1020,0);g.leader(0).hpNow-=5;drive(g.destroy(p),[[a.uid,p.uid]]);ok(g.P(0).hand.includes(p));ok(g.P(0).hand.includes(a));eq(g.hp(g.leader(0)),26);});
test('Miratorg hits only enemy in its region',()=>{const g=game(),a=put(g,1,9,0),b=put(g,1,9,1);enter(g,put(g,0,1031,0));eq(a.dmg,1);eq(b.dmg,0);});
test('Shmygel creates kebab; cave hits region',()=>{const g=game();enter(g,put(g,0,1033,0));ok(g.items(0).some(c=>c.id===1034&&c.created));const a=put(g,1,9,0),c=put(g,0,1038,0);drive(S[1038].on.battleStart(g,c));eq(a.dmg,1);});
test('Kristina ignores sourceless damage',()=>{const g=game();put(g,0,1040);drive(g.damage(put(g,1,9,0),g.leader(0),1));eq(g.leader(0).tok.goods,1);drive(g.damage(null,g.leader(0),1));eq(g.leader(0).tok.goods,1);});
test('Grisha remembers death region, Asmodey aura ends on leaving',()=>{const g=game(),a=put(g,1,9,0);drive(g.destroy(put(g,0,1053,0)));eq(a.dmg,1);const d=put(g,0,1052,1),lord=put(g,0,1054,2);eq(g.atk(d),3);drive(g.toDeckBottom(lord));eq(g.atk(d),2);});
test('Tickets draw bonus only after Demon',()=>{const g=game();g.P(0).deck.unshift(g.newInst(1052,0,'deck'));effect(g,1056);eq(g.P(0).hand.length,2);effect(g,1056);eq(g.P(0).hand.length,3);});
test('Station and hill trigger own regional deaths',()=>{const g=game();put(g,0,1057,0);put(g,0,1080,1);const hp=g.hp(g.leader(1));drive(g.destroy(put(g,0,1071,0)));eq(g.leader(0).tok.goods,1);drive(g.destroy(put(g,0,1074,1)));eq(g.hp(g.leader(1)),hp-1);});
test('Train awards only successful sacrifice',()=>{const g=game(),s=put(g,0,1058,0),a=put(g,0,9,1);let n=g.P(0).coins;drive(S[1058].on.turnStart(g,s,{player:0}),[a.uid]);eq(g.P(0).coins,n+3);eq(g.P(0).hand.length,1);const b=put(g,0,9,1);g.grant(b,'indestructible','perm');n=g.P(0).coins;drive(S[1058].on.turnStart(g,s,{player:0}),[b.uid]);eq(g.P(0).coins,n);});
test('Fallen Angel wounds both sides; cleaner exiles grave ally',()=>{const g=game(),a=put(g,1,9,0);enter(g,put(g,0,1059,0),[a.uid]);eq(g.hp(g.leader(0)),25);eq(a.zone,'grave');const b=addGrave(g,1,9);enter(g,put(g,0,1060,1),[[b.uid]]);eq(b.zone,'exile');eq(g.leader(0).tok.goods,1);});
test('Ignat finds Bim; Feduk grows after own regional death',()=>{const g=game();g.P(0).deck.unshift(g.newInst(1073,0,'deck'));drive(g.destroy(put(g,0,1072,0)),[[g.P(0).deck[0].uid]]);ok(g.P(0).hand.some(c=>c.id===1073));const f=put(g,0,1077,1);drive(g.trigger('destroyed',{inst:g.newInst(1071,0,'grave'),ctrl:0,region:1,cost:1}));eq(g.atk(f),2);eq(g.maxHp(f),4);});
test('Holy water four to undead, two to ordinary ally',()=>{const g=game(),a=put(g,1,1054,0),b=put(g,1,9,1);effect(g,1079,[a]);eq(a.dmg,4);effect(g,1079,[b]);eq(b.zone,'grave');});
test('Bell resolves through stack, paying self-destruction and creating ward Angel',()=>{const g=game();const b=put(g,0,1016);toMain(g);useAbility(g,b,0,[0]);ok(g.allies(0).some(c=>c.id===1091&&c.created&&g.has(c,'ward')));eq(b.zone,'grave');});
test('Cupid cannot target expensive or ward allies; Yarus only Animals',()=>{const g=game(),a=put(g,1,1071,0),b=put(g,1,1054,1);enter(g,put(g,0,1014,0),[a.uid]);ok(a.stunUntil>=0);eq(b.stunUntil,-1);const dog=put(g,1,1073,2);enter(g,put(g,0,1039,1),[dog.uid]);ok(dog.stunUntil>=0);});
test('Losik draws then plans top two cards',()=>{const g=game();enter(g,put(g,0,1018,0),[[]]);eq(g.P(0).hand.length,1);});
test('Kebab pays item and grants phase buff, which expires',()=>{const g=game(),a=put(g,0,1031,0),k=put(g,0,1034),n=g.atk(a);toMain(g);useAbility(g,k,0,[a.uid]);eq(k.zone,'grave');eq(g.atk(a),n+2);ok(g.has(a,'breakthrough'));const phase=g.s.phaseId;g.expire(u=>u.phase===phase);eq(g.atk(a),n);ok(!g.has(a,'breakthrough'));});
test('Volcano damages both sides, gun only opposite region and once per turn',()=>{const g=game(),v=put(g,0,1036,0),a=put(g,0,1031,0),b=put(g,1,1031,0);drive(S[1036].abilities[0].effect(g,{self:v,player:0,targets:[]}));eq(a.dmg,2);eq(b.dmg,2);const gun=put(g,0,1037,1),c=put(g,1,1031,1);toMain(g);g.P(0).coins=20;ok(g.canUseAbility(0,gun,0,{main:true})); const ctx={self:gun,player:0,targets:[],specs:[],cancel:true};drive(S[1037].abilities[0].plan(g,ctx),[c.uid]);eq(ctx.targets[0],c.uid);drive(S[1037].abilities[0].effect(g,ctx));eq(c.dmg,3);});
test('Accordion only wounds other allies in its region',()=>{const g=game(),s=put(g,0,1051,0),a=put(g,1,9,0),b=put(g,1,9,1);drive(S[1051].on.battleStart(g,s));eq(a.dmg,1);eq(s.dmg,0);eq(b.dmg,0);});
test('Mirror sends victim to owner deck bottom instead of grave',()=>{const g=game(),m=put(g,0,1055),a=put(g,1,1031,0);toMain(g);useAbility(g,m,0,[a.uid]);eq(m.zone,'grave');eq(a.zone,'deck');eq(g.P(1).deck.at(-1),a);});
test('Cleaner mixed grave selection awards no soul',()=>{const g=game(),a=addGrave(g,1,9),b=addGrave(g,1,7);enter(g,put(g,0,1060,0),[[a.uid,b.uid]]);eq(a.zone,'exile');eq(b.zone,'exile');eq(g.leader(0).tok.goods||0,0);});
test('Bim reveals enemy hand only to controller question',()=>{const g=game();g.P(1).hand.push(g.newInst(7,1,'hand'));const c=put(g,0,1073,0),gen=S[1073].onEnter(g,c),r=gen.next();eq(r.value.player,0);eq(r.value.options[0].cardId,7);gen.next([]);});
test('Aysidora hits selected enemy; Fedor draws on enter',()=>{const g=game(),a=put(g,1,1031,0);enter(g,put(g,0,1076,0),[a.uid]);eq(a.dmg,2);enter(g,put(g,0,1078,1));eq(g.P(0).hand.length,1);});
test('Leader currency abilities consume goods once and give exact reward',()=>{const g=game(1003),l=g.leader(0);l.tok.goods=2;toMain(g);const n=g.P(0).coins;useAbility(g,l);eq(l.tok.goods,0);eq(g.P(0).coins,n+3);ok(!g.canUseAbility(0,l,0,{main:true}));});
test('Yulian heals once per own turn with two coin payment',()=>{const g=game(),l=g.leader(0);l.hpNow-=5;toMain(g);const n=g.P(0).coins;useAbility(g,l,0,[l.uid]);eq(l.hpNow,25);eq(g.P(0).coins,n-2);ok(!g.canUseAbility(0,l,0,{main:true}));});
test('Dragon breath spends five gold and wounds chosen region only',()=>{const g=game(1002),a=put(g,1,1031,0),b=put(g,1,1031,1);const l=g.leader(0);l.tok.goods=4;toMain(g);useAbility(g,l,0,[0]);eq(a.dmg,3);eq(b.dmg,0);eq(l.tok.goods,0);});
test('Talala draw costs three goods',()=>{const g=game(1001),l=g.leader(0);l.tok.goods=3;toMain(g);useAbility(g,l);eq(l.tok.goods,0);eq(g.P(0).hand.length,1);});
test('Dudush wounds a dwarf; Antoshka draws after destruction',()=>{const g=game(),a=put(g,1,1032,0);enter(g,put(g,0,1032,0),[a.uid]);eq(a.zone,'grave');drive(g.destroy(put(g,0,1074,1)));eq(g.P(0).hand.length,1);});
test('Bitkhoven retaliates only into former region',()=>{const g=game(),a=put(g,1,1031,0),b=put(g,1,1031,1);drive(g.destroy(put(g,0,1071,0)),[a.uid]);eq(a.dmg,1);eq(b.dmg,0);});
done();





