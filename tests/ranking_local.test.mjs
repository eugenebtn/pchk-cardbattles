// Test games on this computer must not reach the world ranking (2026-10-26: seven «Евгений» rows from headless screenshot runs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { isLocal, submitResult } from '../js/net/ranking.js';

const at = (url) => { const u = new URL(url); return { protocol: u.protocol, hostname: u.hostname, search: u.search }; };

test('local copies of the site count as local', () => {
  for (const u of ['http://localhost:8766/?quick=larisa,vlad', 'http://127.0.0.1:8787/', 'http://[::1]:8766/', 'http://game.localhost/', 'file:///C:/game/index.html']) assert.equal(isLocal(at(u)), true, u);
});

test('the real site is not local', () => {
  for (const u of ['https://pchk-battles.ru/', 'https://eugenebtn.github.io/pchk-cardbattles/', 'https://www.pchk-battles.ru/?replay=abc']) assert.equal(isLocal(at(u)), false, u);
});

test('?rank=1 sends from a local copy on purpose', () => {
  assert.equal(isLocal(at('http://localhost:8766/?rank=1')), false);
  assert.equal(isLocal(at('http://localhost:8766/?ranked=1')), true);
});

test('a local game sends nothing', async () => {
  const saved = globalThis.fetch, had = Object.getOwnPropertyDescriptor(globalThis, 'location');
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: true }; };
  Object.defineProperty(globalThis, 'location', { value: at('http://localhost:8766/'), configurable: true });
  try {
    assert.equal(await submitResult({ name: 'Евгений', mode: 'bot', won: false }), false);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = saved;
    if (had) Object.defineProperty(globalThis, 'location', had); else delete globalThis.location;
  }
});
