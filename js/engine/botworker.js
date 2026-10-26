// The computer thinks here, off the screen's thread, so a long think never freezes the board.
// It gets the game's setup and every answer so far, rebuilds the same game (it is deterministic) and answers.
import { Game, rng } from './game.js';
import { levelAnswer } from './botlevels.js';

self.onmessage = (e) => {
  const { id, cfg, history, level, seed, type, player } = e.data;
  let answer, ok = false;
  try {
    const g = new Game(cfg);
    for (const a of history) if (!g.pending || !g.respond(g.pending.player, a)) throw new Error('replay');
    const q = g.pending;
    if (q && q.type === type && q.player === player) { answer = levelAnswer(g, q, level, rng(seed)); ok = true; }
  } catch { ok = false; }
  self.postMessage({ id, ok, answer });
};
