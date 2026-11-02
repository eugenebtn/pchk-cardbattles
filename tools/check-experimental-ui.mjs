// Local browser check and leader card render. Does not submit results to any service.
import {createServer} from 'node:http'; import {spawn,execFileSync} from 'node:child_process'; import {readFileSync,writeFileSync,existsSync,mkdirSync,mkdtempSync} from 'node:fs'; import {resolve,extname} from 'node:path'; import {tmpdir} from 'node:os';
const root=process.cwd(), out=resolve(root,'_design/experimental'); mkdirSync(out,{recursive:true});
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg'};
const srv=createServer((q,r)=>{try{const p=resolve(root,'.'+decodeURIComponent(q.url.split('?')[0]==='/'?'/index.html':q.url.split('?')[0])); if(!p.startsWith(root))throw Error(); r.setHeader('Content-Type',mime[extname(p)]||'application/octet-stream'); r.end(readFileSync(p));}catch{r.writeHead(404);r.end();}}); await new Promise(r=>srv.listen(8797,'127.0.0.1',r));
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--remote-debugging-port=9458','--hide-scrollbars','--mute-audio',`--user-data-dir=${mkdtempSync(resolve(tmpdir(),'exp-ui-'))}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms)); let t;
for(let k=0;k<60&&!t;k++){await sleep(200);try{t=(await(await fetch('http://127.0.0.1:9458/json')).json()).find(t=>t.type==='page');}catch{}}
const ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r));let n=0;const pending=new Map();ws.addEventListener('message',m=>{const d=JSON.parse(m.data);if(pending.has(d.id)){pending.get(d.id)(d.result);pending.delete(d.id)}if(d.method==='Runtime.exceptionThrown')console.log('BROWSER ERROR',d.params.exceptionDetails.text)});const send=(method,params={})=>new Promise(r=>{const id=++n;pending.set(id,r);ws.send(JSON.stringify({id,method,params}))});
const ev=async expression=>(await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true})).result?.value;
await send('Runtime.enable');await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('pchk_sound','false'); localStorage.setItem('pchk_music','false'); localStorage.setItem('pchk_tutOffered','true');`});
for(const id of [1001,1002,1003,1004,1091]){
 await send('Emulation.setDeviceMetricsOverride',{width:600,height:833,deviceScaleFactor:1,mobile:false});
 const art=id===1091?'../assets/cards/experimental/angel-art.webp':`../assets/leaders/${id}.webp`;
 await send('Page.navigate',{url:`http://127.0.0.1:8797/_design/cardtpl.html?id=${id}&art=${art}`});
 for(let k=0;k<50;k++){await sleep(150);if(await ev('document.body?.dataset.ready === "1"'))break;}
 const shot=await send('Page.captureScreenshot',{format:'png'});const png=resolve(out,`${id}.png`);writeFileSync(png,Buffer.from(shot.data,'base64'));
 execFileSync('python',['-c',`from PIL import Image; im=Image.open(r'${png}'); im.save(r'${resolve(root,'assets/cards/experimental',id+'.webp')}','WEBP',quality=88)`]);
}
for(const [w,h] of (process.env.EXP_RENDER_ONLY ? [] : [[1400,900],[390,844]])){
 await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<500});await send('Page.navigate',{url:'http://127.0.0.1:8797/?intro=off&screen=menu&act=decks'}); await sleep(2200);
 for(let k=0;k<80;k++){if(await ev('document.querySelectorAll(\'[data-copy^="experimental_"]\').length === 4'))break;await sleep(200);}
 console.log('Gallery',w,await ev(`({experimental:[...document.querySelectorAll('[data-copy^="experimental_"]')].map(e=>e.textContent),starters:document.querySelectorAll('[data-copy]:not([data-copy^="experimental_"])').length})`));
 await ev(`document.querySelector('[data-copy="experimental_talala"]')?.scrollIntoView()`);const sh=await send('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(out,`builder_${w}.png`),Buffer.from(sh.data,'base64'));
 for(const key of ['talala','gimmilut','misha','yulian']){
 await ev(`document.querySelector('[data-copy="experimental_${key}"]')?.click()`);
 console.log('Editor',key,w,await ev(`({name:document.querySelector('[data-name]')?.value, count:document.querySelector('.bld-count')?.textContent,images:[...document.images].filter(x=>x.src.includes('/experimental/')&&x.complete&&!x.naturalWidth).map(x=>x.src)})`));
 await ev(`document.querySelector('.bld [data-back]')?.click()`);
 }
}
ws.close();chrome.kill();srv.close();
