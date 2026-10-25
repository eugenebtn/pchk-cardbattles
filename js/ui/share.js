// «Поделиться итогом»: a 1200×630 picture of the result for chats; «Записать видео»: records this tab.
const img = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

/** p: { left: {leader, name, hp}, right: {...}, title, sub, line } → PNG blob */
export async function resultPicture(p) {
  await document.fonts?.ready;
  const W = 1200, H = 630, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const bg = x.createRadialGradient(W / 2, H * 0.45, 50, W / 2, H / 2, 700);
  bg.addColorStop(0, '#3e1424'); bg.addColorStop(1, '#0e0408');
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  const side = async (s, left) => {
    const a = await img(`assets/leaders/face/${s.leader}.webp`);
    const bx = left ? 40 : W - 40 - 360, by = 60, bw = 360, bh = 420;
    x.save();
    x.beginPath(); x.roundRect(bx, by, bw, bh, 22); x.clip();
    if (s.lost) x.filter = 'grayscale(0.85) brightness(0.5)';
    if (a) { const k = Math.max(bw / a.width, bh / a.height); const w = a.width * k, h = a.height * k; x.drawImage(a, bx + (bw - w) / 2, by + (bh - h) * 0.3, w, h); }
    x.filter = 'none';
    x.restore();
    x.lineWidth = 6; x.strokeStyle = s.lost ? '#6b5d48' : '#f6d77a'; x.beginPath(); x.roundRect(bx, by, bw, bh, 22); x.stroke();
    // Name ribbon and health gem.
    x.fillStyle = left ? '#9a2420' : '#3a4652'; x.fillRect(bx + 16, by + bh - 34, bw - 32, 60);
    x.strokeStyle = '#d9c48a'; x.lineWidth = 2; x.strokeRect(bx + 16, by + bh - 34, bw - 32, 60);
    x.fillStyle = '#fff'; x.font = '800 32px "Fira Sans Extra Condensed", sans-serif'; x.textAlign = 'center';
    x.fillText(s.name.toUpperCase(), bx + bw / 2, by + bh + 8);
    x.beginPath(); x.arc(bx + bw - 22, by + bh - 4, 36, 0, 7); x.fillStyle = '#b8281c'; x.fill(); x.strokeStyle = '#0f1418'; x.lineWidth = 5; x.stroke();
    x.fillStyle = '#fff'; x.font = '800 30px "Fira Sans Extra Condensed", sans-serif'; x.fillText(String(Math.max(0, s.hp)), bx + bw - 22, by + bh + 7);
  };
  await side(p.left, true); await side(p.right, false);
  x.textAlign = 'center';
  const gold = x.createLinearGradient(0, 160, 0, 250); gold.addColorStop(0, '#fff6d8'); gold.addColorStop(1, '#d9a640');
  x.fillStyle = gold; x.font = '64px "Ruslan Display", serif'; x.fillText(p.title, W / 2, 230);
  x.fillStyle = '#d9c48a'; x.font = '78px "Ruslan Display", serif'; x.fillText('VS', W / 2, 350);
  x.fillStyle = '#efe2c2'; x.font = '600 26px "Fira Sans Extra Condensed", sans-serif';
  const words = p.sub.split(' '); let line = '', y = 400;
  for (const w of words) { if (x.measureText(line + w).width > 360) { x.fillText(line.trim(), W / 2, y); line = ''; y += 32; } line += w + ' '; }
  x.fillText(line.trim(), W / 2, y);
  x.fillStyle = '#b9a77a'; x.font = '500 20px "Fira Sans Extra Condensed", sans-serif';
  for (const [k, part] of (p.line || '').split(' · ').entries()) x.fillText(part, W / 2, y + 36 + k * 26);
  x.fillStyle = '#8a7c62'; x.font = '500 20px "Fira Sans Extra Condensed", sans-serif';
  x.fillText('Карточные битвы ПЧК · фанатская онлайн-версия · eugenebtn.github.io/pchk-cardbattles', W / 2, H - 22);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}
export async function sharePicture(blob, toast) {
  const file = new File([blob], 'итог-партии.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: 'Карточные битвы ПЧК' }); return; } catch { /* cancelled */ } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast && toast('Картинка сохранена — её можно отправить в чат');
}

// ---------- video of this tab ----------
let rec = null;
export const recording = () => !!rec;
export async function toggleRecording(toast) {
  if (rec) { rec.stop(); return; }
  if (!navigator.mediaDevices?.getDisplayMedia || !window.MediaRecorder) { toast && toast('Запись видео работает в Chrome или Edge на компьютере'); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30, displaySurface: 'browser' }, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include' }); } catch { return; }
  const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t));
  const chunks = [];
  rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6e6 });
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  rec.onstop = () => {
    stream.getTracks().forEach((t) => t.stop());
    document.querySelector('.rec-dot')?.remove();
    rec = null;
    const blob = new Blob(chunks, { type: 'video/webm' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `партия-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.webm`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    toast && toast('Видео сохранено в «Загрузки»');
  };
  stream.getVideoTracks()[0].addEventListener('ended', () => rec?.state === 'recording' && rec.stop());
  rec.start(1000);
  const dot = document.createElement('button');
  dot.className = 'rec-dot'; dot.innerHTML = '● Идёт запись — нажмите, чтобы остановить';
  dot.onclick = () => rec?.stop();
  document.body.appendChild(dot);
}
