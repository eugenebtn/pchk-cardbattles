import test from 'node:test';
import assert from 'node:assert/strict';
import {findMatch} from '../js/net/server.js';
test('Matchmaking sends actual selected deck and reports server rejection',()=>{
 const Native=globalThis.WebSocket;let ws;globalThis.WebSocket=class {constructor(){ws=this;}send(s){this.message=JSON.parse(s);}close(){this.closed=true;}};
 try {const deck={leader:20,cards:[9]};let error;findMatch('Проверка',{deck,onError:s=>error=s});ws.onopen();assert.deepEqual(ws.message.deck,deck);assert.equal(ws.message.rated,true);ws.onmessage({data:JSON.stringify({t:'error',text:'Колода запрещена'})});assert.equal(error,'Колода запрещена');assert.ok(ws.closed);}finally{globalThis.WebSocket=Native;}
});
