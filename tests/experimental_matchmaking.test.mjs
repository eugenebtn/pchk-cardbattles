import test from 'node:test';
import assert from 'node:assert/strict';
import {findMatch} from '../js/net/server.js';
test('Guest casual matchmaking sends selected deck; auth rejection is exposed',async()=>{const Native=globalThis.WebSocket;let ws;globalThis.WebSocket=class{constructor(){ws=this;}send(s){this.message=JSON.parse(s);}close(){this.closed=true;}};try{const deck={leader:20,cards:[9]};let error;findMatch('Mock',{deck,rated:false,onError:s=>error=s});await ws.onopen();assert.deepEqual(ws.message.deck,deck);assert.equal(ws.message.rated,false);ws.onmessage({data:JSON.stringify({t:'authError',code:'AUTH_REQUIRED'})});assert.equal(error,'AUTH_REQUIRED');assert.ok(ws.closed);}finally{globalThis.WebSocket=Native;}});
