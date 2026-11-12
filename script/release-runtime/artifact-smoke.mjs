import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const root = pathToFileURL(process.env.VALIDATION_DIR + '/');
const deadline = setTimeout(() => { console.error('Packaged runtime deadline exceeded'); process.exit(1) }, 180000);
const pages = await fetch('http://127.0.0.1:9236/json/list').then(r => r.json());
const page = pages.find(p => p.type === 'page' && !p.url.startsWith('devtools:'));
if (!page) throw new Error('No packaged renderer');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {socket.onopen=resolve;socket.onerror=reject});
let next=0;const pending=new Map();const exceptions=[];
socket.onmessage = event => {const msg=JSON.parse(event.data);if(msg.id){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(new Error(JSON.stringify(msg.error))):p.resolve(msg.result)}else if(msg.method==='Runtime.exceptionThrown')exceptions.push(msg.params.exceptionDetails.text)};
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))});
await call('Runtime.enable');
const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,timeout:120000});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value};
try {
const checks=await evaluate(`(async()=>{const ready=await window.api.awaitInitialization();const headers=ready.password?{authorization:'Basic '+btoa((ready.username||'orchestra')+':'+ready.password)}:{};const response=await fetch(new URL('/api/health',ready.url),{headers});const health=await response.json();return{healthStatus:response.status,health,healthChecked:ready.healthChecked,rendererUrl:location.href,title:document.title,text:document.body.innerText.slice(0,12000),buttons:[...document.querySelectorAll('button')].map(b=>b.innerText).filter(Boolean)}})()`);
if(checks.healthStatus!==200||checks.health.healthy!==true||checks.health.version!=='0.3.7')throw new Error('Packaged server version/health mismatch');
const sessions = await evaluate(`(async()=>{
 const ready=await window.api.awaitInitialization();
 const headers={authorization:'Basic '+btoa((ready.username||'orchestra')+':'+ready.password),'content-type':'application/json'};
 const request=async(path,body)=>{const response=await fetch(new URL(path,ready.url),{headers,method:body?'POST':'GET',...(body?{body:JSON.stringify(body)}:{})});const text=await response.text();if(!response.ok)throw new Error(path+' '+response.status+' '+text.slice(0,300));return text?JSON.parse(text):null};
 const created=await request('/api/session',{});const id=created.data.id;
 await request('/api/session/'+id+'/rename',{title:'Release 0.3.7 isolated validation'});
 const read=await request('/api/session/'+id);
 if(read.data.id!==id||read.data.title!=='Release 0.3.7 isolated validation')throw new Error('Session read/rename mismatch');
 const prompt=await request('/api/session/'+id+'/prompt',{prompt:{text:'Release validation: admit only, do not execute.'},resume:false});
 if(typeof prompt.data.id!=='string'||!prompt.data.id||!Number.isSafeInteger(prompt.data.admittedSeq)||prompt.data.admittedSeq<0||prompt.data.sessionID!==id)throw new Error('Malformed admission');
 const retry=await request('/api/session/'+id+'/prompt',{id:prompt.data.id,prompt:{text:'Release validation: admit only, do not execute.'},resume:false});
 if(retry.data.id!==prompt.data.id||retry.data.admittedSeq!==prompt.data.admittedSeq)throw new Error('Admission retry duplicated input');
 const history=await request('/api/session/'+id+'/history');const active=await request('/api/session/active');
 const admitted=history.data.filter(event=>event.type==='session.next.prompt.admitted'&&event.data.messageID===prompt.data.id&&event.data.sessionID===id&&event.durable.seq===prompt.data.admittedSeq);
 if(history.hasMore!==false||admitted.length!==1||history.data.some(event=>event.type.endsWith('.started')||event.type==='session.next.prompted'))throw new Error('Missing/duplicate admission or unexpected execution history');
 if(active.data[id])throw new Error('Admit-only unexpectedly started execution');
 return {sessionID:id,createReadRename:'pass',admitOnly:'pass',idempotentRetry:'pass',historyEventCount:history.data.length,admittedEventCount:admitted.length,unexpectedExecution:false};
})()`);
writeFileSync(new URL('packaged-session-checks.json',root),JSON.stringify(sessions,null,2)+'\n');
const nativeSearch = await evaluate(`(async()=>{
 const ready=await window.api.awaitInitialization();const headers={authorization:'Basic '+btoa((ready.username||'orchestra')+':'+ready.password)};
 const url=new URL('/api/fs/find',ready.url);url.searchParams.set('location[directory]',${JSON.stringify(new URL('native-fixture',root).pathname)});url.searchParams.set('query','release-probe');
 const response=await fetch(url,{headers});const body=await response.json();
 if(!response.ok||!body.data?.some(file=>file.path.endsWith('release-probe.ts')))throw new Error('Native file search failed: '+JSON.stringify(body));
 return{status:response.status,matchedFiles:body.data.map(file=>file.path)};
})()`);
writeFileSync(new URL('packaged-native-search.json',root),JSON.stringify(nativeSearch,null,2)+'\n');
const ui=await evaluate(`(async()=>{const until=Date.now()+15000;while(Date.now()<until&&!document.querySelector('[data-component=orchestra-home]'))await new Promise(resolve=>setTimeout(resolve,100));return{ready:!!document.querySelector('[data-component=orchestra-home]'),sidebarPresent:!!document.querySelector('[data-component=orchestra-sidebar]'),text:document.body.innerText.slice(0,12000),buttonCount:document.querySelectorAll('button').length}})()`);
const screenshot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
writeFileSync(new URL('packaged-app.png',root),Buffer.from(screenshot.data,'base64'));
writeFileSync(new URL('packaged-runtime.json',root),JSON.stringify({...checks,ui,exceptions,capturedAt:new Date().toISOString()},null,2)+'\n');
if(!ui.ready||ui.buttonCount===0||exceptions.length)throw new Error('Renderer is not ready or has uncaught exceptions');
console.log(JSON.stringify({health:checks.health,ui,exceptions}));
} catch(error) {
 const shot=await call('Page.captureScreenshot',{format:'png'}).catch(()=>undefined);if(shot)writeFileSync(new URL('packaged-failed.png',root),Buffer.from(shot.data,'base64'));
 writeFileSync(new URL('FAILED.json',root),JSON.stringify({error:String(error),exceptions},null,2));throw error;
} finally {clearTimeout(deadline);socket.close()}
