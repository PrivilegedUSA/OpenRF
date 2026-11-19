'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const html=fs.readFileSync('openrf/static/index.html','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
const app=fs.readFileSync('openrf/static/app.js','utf8');
const script=fs.readFileSync('openrf/static/field-breadcrumbs.js','utf8');
assert(html.includes('id="map-breadcrumbs-panel"'));
assert(html.includes('data-page="emergency" aria-label="Open Emergency readiness"'));
assert(html.indexOf('id="header-emergency-shortcut"') < html.indexOf('id="header-messages-menu"'));
assert(css.includes('body.map-workspace .topbar .header-emergency-shortcut{pointer-events:auto'));
assert(app.includes("ids: ['map-breadcrumbs-panel','survey-waypoint-manager'"));
assert(script.includes("document.addEventListener('visibilitychange'"));
assert(script.includes('maximumAge:0'));
assert(script.includes('document.hidden'));

const elements=new Map();
function element(id){
  if(!elements.has(id)) elements.set(id,{
    id,hidden:false,disabled:false,value:id==='breadcrumb-label'?'Test walk':'',textContent:'',
    innerHTML:'',handlers:{},addEventListener(name,fn){this.handlers[name]=fn;},
    closest(){return null;}
  });
  return elements.get(id);
}
let getFixCount=0,watchCount=0,clearCount=0,watchCallback;
let sessions=[], points=[], lastId=0, requests=[];
const now=()=>new Date().toISOString();
const mockPosition=(accuracy=8)=>({timestamp:Date.now(),coords:{latitude:38.4,longitude:-120.5,accuracy}});
const document={hidden:false,getElementById:element,handlers:{},
  addEventListener(name,fn){this.handlers[name]=fn;},
  body:{append(){}},createElement(){return {remove(){},click(){}};}};
const navigator={geolocation:{
  getCurrentPosition(resolve){getFixCount++;resolve(mockPosition());},
  watchPosition(callback){watchCount++;watchCallback=callback;return 71;},
  clearWatch(id){assert.equal(id,71);clearCount++;}
}};
async function fetch(url,opts={}){
  const method=opts.method||'GET';requests.push(`${method} ${url}`);
  const parts=url.split('/');const id=Number(parts[4]);
  let status=200,data={};
  if(url==='/api/navigation/breadcrumbs'&&method==='GET') data={sessions:sessions.map(s=>({
    ...s,point_count:points.filter(p=>p.session_id===s.id).length}))};
  else if(url==='/api/navigation/breadcrumbs'&&method==='POST'){
    const label=JSON.parse(opts.body).label;
    const track={id:++lastId,label,state:'RECORDING',started_utc:now()};
    sessions.push(track);data={session:{...track,point_count:0}};status=201;
  } else if (parts.length===6&&parts[5]==='points'&&method==='POST') {
    const pos=JSON.parse(opts.body);points.push({...pos,session_id:id});data={saved:true,point_count:points.length};status=201;
  } else if (parts.length===6&&parts[5]==='stop'&&method==='POST') {
    sessions.find(s=>s.id===id).state='STOPPED';data={stopped:true};
  } else if (parts.length===5&&method==='GET') {
    data={session:sessions.find(s=>s.id===id),distance_m:0,points:points.filter(p=>p.session_id===id)};
  } else throw Error(`Unexpected request: ${method} ${url}`);
  return {ok:status<400,status,async json(){return data;}};
}
const window={OpenRFMapReadOnly(){return null;},addEventListener(){}};
vm.runInNewContext(script,{document,navigator,fetch,window,console,Date,Number,Math,JSON,Error,
  setInterval(){},setTimeout(){},URL:{},Blob:function(){},confirm(){return false;}});
const tick=()=>new Promise(resolve=>setTimeout(resolve,15));
(async()=>{
  await tick();
  assert.equal(getFixCount,0,'Reading saved tracks must never request location');
  assert.equal(watchCount,0,'Loading a map must never start a GPS watch');
  assert.equal(points.length,0);
  element('breadcrumb-start').handlers.click();await tick();
  assert.equal(getFixCount,1,'Explicit Start requests fresh position');
  assert.equal(watchCount,1,'Explicit Start launches the watch after first fix');
  assert.equal(points.length,1,'First fresh fix saved');
  watchCallback(mockPosition(999));await tick();
  assert.equal(points.length,1,'Bad-accuracy fixes must be rejected before POST');
  assert(element('breadcrumb-status').textContent.includes('skipped'));
  document.hidden=true;document.handlers.visibilitychange();await tick();
  assert.equal(clearCount,1,'Hiding tab must disable browser location watch');
  assert.equal(sessions[0].state,'STOPPED');
  assert.equal(element('breadcrumb-current').hidden,true);
  assert.equal(requests.filter(r=>r.includes('/points')).length,1);
  console.log('PASS v0.2.131 explicit breadcrumb consent, fresh fixes, hidden-tab stop and header emergency shortcut');
})().catch(error=>{console.error(error);process.exitCode=1;});
