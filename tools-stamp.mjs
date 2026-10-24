// Run before every push: node tools-stamp.mjs
// Browsers keep site files for a while, so after an update a player could get a mix of old and new files.
// This puts a short content hash on every script and stylesheet in index.html (an import map covers the
// scripts that import each other), so a changed file always has a new address and is downloaded fresh.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

const root = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const hash = (f) => createHash('sha1').update(readFileSync(join(root, f))).digest('hex').slice(0, 8);
const walk = (dir) => readdirSync(join(root, dir)).flatMap((n) => {
  const p = `${dir}/${n}`;
  return statSync(join(root, p)).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
});

const js = walk('js');
const map = { three: './vendor/three.module.js', 'three/addons/': './vendor/addons/' };
for (const f of js) map[`./${f}`] = `./${f}?v=${hash(f)}`;

let html = readFileSync(join(root, 'index.html'), 'utf8');
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>/, `<script type="importmap">${JSON.stringify({ imports: map })}</script>`);
html = html.replace(/<script type="module" src="js\/main\.js(\?v=[0-9a-f]+)?"><\/script>/, `<script type="module" src="js/main.js?v=${hash('js/main.js')}"></script>`);
html = html.replace(/href="(css\/[a-z0-9_-]+\.css)(\?v=[0-9a-f]+)?"/g, (_, f) => `href="${f}?v=${hash(f)}"`);
writeFileSync(join(root, 'index.html'), html);
console.log(`stamped ${js.length} scripts and the stylesheets`);
