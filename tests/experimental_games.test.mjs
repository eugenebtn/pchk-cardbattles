// Full games exercise actual questions, stack legality and start/death trigger chains.
import {Game} from '../js/engine/game.js';
import {botAnswer} from '../js/engine/bot.js';
import {EXPERIMENTAL_DECKS} from '../js/data/experimental.js';
import {DECKS} from '../js/data/decks.js';
import {test,ok,done} from './helpers.mjs';
const pool=[...Object.values(EXPERIMENTAL_DECKS),...Object.values(DECKS)];
for(let i=0;i<4;i++) for(let j=0;j<pool.length;j++) for(let seat=0;seat<2;seat++) test(`Experimental full game ${i}/${j} seat ${seat}`,()=>{
 const mk=d=>({leader:d.leader,deck:d.main||d.cards});
 const g=new Game({seed:72100+i*100+j,players:seat ? [mk(pool[j]),mk(pool[i])] : [mk(pool[i]),mk(pool[j])],options:{mulliganBonus:true}});
 let x=9901+i*100+j;const rand=()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;};
 let steps=0;
 while(g.pending&&!g.s.over&&steps++<25000&&g.s.round<150){const q=g.pending;const a=botAnswer(g,q,rand,{fuzz:0.25});ok(g.respond(q.player,a),`invalid bot reply ${q.type}: ${JSON.stringify(a)}`);}
 ok(g.s.over,`game unfinished r${g.s.round}, ${steps} steps, ${g.pending?.prompt}`);
});
done();

