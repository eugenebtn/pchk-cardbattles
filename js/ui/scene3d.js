// 3D tavern scene for the menu and hero select (three.js).
// Models and lighting: Poly Haven (CC0). Card art: «Подземелья Чикен Карри».
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const M = 'assets/3d/';

function cardBackTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 358;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 160, 10, 128, 179, 220);
  grd.addColorStop(0, '#6b2414'); grd.addColorStop(1, '#2a0a05');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 358);
  g.strokeStyle = '#d9a948'; g.lineWidth = 8; g.strokeRect(10, 10, 236, 338);
  g.lineWidth = 2; g.strokeRect(22, 22, 212, 314);
  for (let i = 0; i < 24; i++) { g.save(); g.translate(128, 170); g.rotate((i / 24) * Math.PI * 2); g.fillStyle = i % 2 ? 'rgba(217,169,72,.25)' : 'rgba(217,169,72,.08)'; g.beginPath(); g.moveTo(0, 0); g.lineTo(-14, -110); g.lineTo(14, -110); g.fill(); g.restore(); }
  g.fillStyle = '#e8c46a'; g.beginPath(); g.arc(128, 170, 34, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#3a1d02'; g.font = 'bold 40px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('⚔', 128, 172);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function startScene(host, { cardImages = [] } = {}) {
  const mobile = window.matchMedia('(max-width: 760px)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
  const renderer = new THREE.WebGLRenderer({ antialias: !mobile, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.25 : 1.6));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.82;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0604);
  scene.fog = new THREE.FogExp2(0x0b0604, 0.22);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 40);
  const target = new THREE.Vector3(0, 1.08, 0);

  // Environment light from a medieval cellar HDRI (soft reflections on metal and glass).
  const pmrem = new THREE.PMREMGenerator(renderer);
  new RGBELoader().load(M + 'cellar_1k.hdr', (hdr) => {
    scene.environment = pmrem.fromEquirectangular(hdr).texture;
    hdr.dispose();
  });
  scene.environmentIntensity = 0.35;

  // Lights: warm key from above, candle and lantern glows, cool rim from behind.
  scene.add(new THREE.AmbientLight(0x3a2416, 0.6));
  const key = new THREE.SpotLight(0xffd29a, 16, 8, Math.PI / 5, 0.6, 1.4);
  key.position.set(0.6, 3.2, 1.2); key.target.position.copy(target);
  key.castShadow = true; key.shadow.mapSize.set(mobile ? 512 : 1024, mobile ? 512 : 1024); key.shadow.bias = -0.0008; key.shadow.radius = 4;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x7da2ff, 0.55); rim.position.set(-2, 2, -3); scene.add(rim);

  const loader = new GLTFLoader();
  const tl = new THREE.TextureLoader();
  // Floor and back wall.
  const floorTex = tl.load('assets/tex/table.webp'); floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(6, 6); floorTex.colorSpace = THREE.SRGBColorSpace;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({ map: floorTex, color: 0x7a5a40, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const wallTex = tl.load('assets/tex/stone.webp'); wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; wallTex.repeat.set(5, 3); wallTex.colorSpace = THREE.SRGBColorSpace;
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 6), new THREE.MeshStandardMaterial({ map: wallTex, color: 0x6a5a4a, roughness: 1 }));
  wall.position.set(0, 3, -2.6); scene.add(wall);

  const place = (name, file, pos, rot = 0, scale = 1) => loader.load(M + name + '/' + file, (g) => {
    const o = g.scene;
    o.position.set(...pos); o.rotation.y = rot; o.scale.setScalar(scale);
    o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    scene.add(o);
  });
  place('round_wooden_table_01', 'round_wooden_table_01_1k.gltf', [0, 0, 0]);
  place('brass_goblets', 'brass_goblets_1k.gltf', [0.42, 1.0, 0.18], 0.6);
  place('jug_01', 'jug_01_1k.gltf', [-0.5, 1.0, -0.18], 1.2);
  place('wine_bottles_01', 'wine_bottles_01_1k.gltf', [0.45, 1.0, -0.38], -0.4);
  place('wooden_lantern_01', 'wooden_lantern_01_1k.gltf', [-0.28, 1.0, -0.5], 0.3);
  place('kite_shield', 'kite_shield_1k.gltf', [1.05, 0.02, -0.75], -0.6);
  place('treasure_chest', 'treasure_chest_1k.gltf', [-1.15, 0, -0.7], 0.7);

  // Flame sprite texture.
  const flameTex = tl.load('assets/fx/flame_01.png');
  const glowTex = tl.load('assets/fx/light_01.png');
  const flames = [];
  const addCandle = (x, z, h) => {
    const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.025, h, 16), new THREE.MeshStandardMaterial({ color: 0xefe3c4, roughness: 0.6, emissive: 0x2a1404 }));
    wax.position.set(x, 1.0 + h / 2, z); wax.castShadow = true; scene.add(wax);
    const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: 0xffb04a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    fl.scale.set(0.05, 0.09, 1); fl.position.set(x, 1.0 + h + 0.04, z); scene.add(fl);
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff8a2a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }));
    gl.scale.set(0.22, 0.22, 1); gl.position.copy(fl.position); scene.add(gl);
    const L = new THREE.PointLight(0xff9a3a, 0.5, 1.4, 1.8); L.position.copy(fl.position); scene.add(L);
    flames.push({ fl, gl, L, seed: Math.random() * 10 });
  };
  addCandle(-0.12, -0.42, 0.16); addCandle(0.02, -0.5, 0.11); addCandle(0.58, 0.02, 0.13);
  // Lantern light.
  const lanternLight = new THREE.PointLight(0xffa04a, 0.9, 2.2, 1.6); lanternLight.position.set(-0.28, 1.2, -0.5); scene.add(lanternLight);
  flames.push({ L: lanternLight, seed: 3.3, lantern: true });

  // Gold coins and a d20 on the table.
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc24a, metalness: 1, roughness: 0.28 });
  const coinGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.004, 24);
  for (let i = 0; i < 16; i++) {
    const c = new THREE.Mesh(coinGeo, gold);
    const a = Math.random() * Math.PI * 2, r = 0.18 + Math.random() * 0.22;
    c.position.set(0.15 + Math.cos(a) * r * 0.5, 1.003 + (i % 4) * 0.004, 0.32 + Math.sin(a) * r * 0.35);
    c.rotation.set((Math.random() - 0.5) * 0.3, Math.random() * 3, (Math.random() - 0.5) * 0.3);
    c.castShadow = true; scene.add(c);
  }
  const d20 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.034, 0), new THREE.MeshStandardMaterial({ color: 0xb3121f, roughness: 0.35, metalness: 0.1, flatShading: true }));
  d20.position.set(-0.32, 1.032, 0.3); d20.rotation.set(0.4, 0.8, 0.2); d20.castShadow = true; scene.add(d20);

  // Floating hero cards.
  const back = cardBackTexture();
  const edge = new THREE.MeshStandardMaterial({ color: 0xc8a058, metalness: 0.8, roughness: 0.35 });
  const cards = [];
  const W = 0.2, H = 0.28;
  cardImages.slice(0, 6).forEach((src, i) => {
    const t = tl.load(src); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const front = new THREE.MeshStandardMaterial({ map: t, roughness: 0.45, metalness: 0.05 });
    const backM = new THREE.MeshStandardMaterial({ map: back, roughness: 0.5 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.004), [edge, edge, edge, edge, front, backM]);
    const n = Math.min(6, cardImages.length), k = i - (n - 1) / 2;
    const base = new THREE.Vector3(k * 0.17, 1.2 - Math.abs(k) * 0.015, 0.08 + Math.abs(k) * 0.03);
    m.position.copy(base); m.rotation.set(-0.35, -k * 0.12, -k * 0.06);
    m.castShadow = true; scene.add(m);
    cards.push({ m, base, k, seed: i * 1.7, lift: 0 });
  });

  // Dust in the light.
  const dustN = mobile ? 120 : 260;
  const dpos = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) { dpos[i * 3] = (Math.random() - 0.5) * 3; dpos[i * 3 + 1] = 0.9 + Math.random() * 2; dpos[i * 3 + 2] = (Math.random() - 0.5) * 2.4; }
  const dgeo = new THREE.BufferGeometry(); dgeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  const dust = new THREE.Points(dgeo, new THREE.PointsMaterial({ map: glowTex, color: 0xffd9a0, size: 0.018, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(dust);

  // Post-processing: bloom for candles, gold and glows.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.45, 0.9);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // Interaction: parallax and lifting the card under the cursor.
  const mouse = new THREE.Vector2(0, 0), ray = new THREE.Raycaster();
  let hovered = null;
  const onMove = (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1; mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  };
  window.addEventListener('pointermove', onMove);

  const resize = () => {
    const w = host.clientWidth || window.innerWidth, h = host.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false); composer.setSize(w, h); bloom.setSize(w, h);
    camera.aspect = w / h;
    // Portrait screens: step back so the table fits.
    camera.fov = w / h < 0.8 ? 58 : 38;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize); ro.observe(host);

  let running = true, raf = 0, focus = 0;
  const clock = new THREE.Clock();
  // Weak devices: measure speed for a moment, then simplify (no shadows, no bloom, lower resolution).
  let frames = 0, slowSum = 0, lastNow = performance.now(), degraded = false;
  const degrade = () => {
    degraded = true;
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = false; key.castShadow = false;
    bloom.enabled = false;
    resize();
  };
  const tick = () => {
    if (!running) return;
    raf = requestAnimationFrame(tick);
    if (document.hidden) return;
    const now = performance.now();
    if (!degraded && frames < 120) { frames++; if (frames > 20) slowSum += now - lastNow; if (frames === 120 && slowSum / 100 > 34) degrade(); }
    lastNow = now;
    const t = clock.getElapsedTime();
    // Camera drifts slowly, with a little mouse parallax.
    const portrait = camera.aspect < 0.8;
    const rad = portrait ? 1.9 : 1.45, ang = Math.sin(t * 0.07) * 0.25 + mouse.x * 0.08;
    camera.position.set(Math.sin(ang) * rad + (portrait ? 0 : -0.25), (portrait ? 1.95 : 1.62) + mouse.y * 0.05 + Math.sin(t * 0.21) * 0.02, Math.cos(ang) * rad);
    const look = target.clone(); look.x += portrait ? 0 : -0.18 + focus * 0.0;
    camera.lookAt(look);
    for (const f of flames) {
      const fl = 0.85 + Math.sin(t * 9 + f.seed) * 0.08 + Math.sin(t * 23 + f.seed * 2) * 0.06 + (Math.random() - 0.5) * 0.06;
      f.L.intensity = (f.lantern ? 0.9 : 0.5) * fl;
      if (f.fl) { f.fl.scale.set(0.05 * (0.9 + fl * 0.15), 0.09 * fl, 1); f.gl.material.opacity = 0.45 * fl; }
    }
    ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObjects(cards.map((c) => c.m))[0];
    hovered = hit ? cards.find((c) => c.m === hit.object) : null;
    document.body.style.cursor = '';
    for (const c of cards) {
      c.lift += ((c === hovered ? 1 : 0) - c.lift) * 0.12;
      c.m.position.set(c.base.x, c.base.y + Math.sin(t * 0.9 + c.seed) * 0.012 + c.lift * 0.07, c.base.z + c.lift * 0.08);
      c.m.rotation.set(-0.35 + c.lift * 0.25, -c.k * 0.12 + Math.sin(t * 0.5 + c.seed) * 0.03, -c.k * 0.06 * (1 - c.lift));
    }
    const p = dgeo.attributes.position;
    for (let i = 0; i < dustN; i++) { let y = p.getY(i) + 0.0012; if (y > 3) y = 0.9; p.setY(i, y); p.setX(i, p.getX(i) + Math.sin(t * 0.3 + i) * 0.0004); }
    p.needsUpdate = true;
    d20.rotation.y += 0.002;
    composer.render();
  };
  tick();

  return {
    pause() { running = false; cancelAnimationFrame(raf); },
    resume() { if (!running) { running = true; clock.getDelta(); tick(); } },
    dispose() { running = false; cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('pointermove', onMove); renderer.dispose(); host.innerHTML = ''; },
  };
}
