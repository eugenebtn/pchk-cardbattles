// node tests/levels_cfg.mjs <samples> <horizon> <games per pair>
globalThis.PCHK_SAMPLES = Number(process.argv[2]); globalThis.PCHK_HORIZON = Number(process.argv[3]);
process.argv = [process.argv[0], process.argv[1], process.argv[4] || '10', 'strong', 'normal'];
await import('./levels.mjs');
