'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
const app=fs.readFileSync('openrf/static/app.js','utf8');
const script=fs.readFileSync('openrf/static/field-breadcrumbs.js','utf8');

assert.match(html,/id="breadcrumb-mode"[^>]*>.*value="pedestrian".*value="auto"/s);
assert.match(html,/id="map-nav-record-start"/);
assert.match(html,/id="map-nav-record-stop"/);
assert.match(html,/Route to recorded start/);
assert.match(app,/window\.OpenRFPlanReturnToStart=async function/);
assert.match(app,/closeMapToolOverlay\(\)/);
assert.match(app,/state\.navTrackLinked/);
assert.match(app,/start\(mode,guard\)/);
assert.match(app,/browser GPS fix/);
assert.match(css,/#page-scanner > \.two-columns\{grid-template-columns:minmax\(0,1fr\);gap:16px\}/);
assert.match(css,/\.sidebar \.nav-btn\[data-page="emergency"\] \.nav-icon svg\{[^}]*color:inherit/);
for(const mode of ['walking','driving']){
  assert(css.includes(`#page-map.navigation-${mode} .map-tool-rail{display:grid!important}`) ||
    css.includes(`#page-map.navigation-${mode} .map-tool-rail,`));
  assert(css.includes(`#page-map.navigation-${mode} .map-navigation-settings`));
}
assert(app.includes('button.bottom - bounds.top + 12'));

const els=new Map();
function el(id){
  if(!els.has(id))els.set(id,{id,hidden:false,disabled:false,value:id==='breadcrumb-label'?'Trip':'',
    innerHTML:'',textContent:'',handlers:{},addEventListener(name,fn){this.handlers[name]=fn;}});
  return els.get(id);
}
el('breadcrumb-mode').value='auto';
let sessions=[{id:1,label:'Old drive',travel_mode:'auto',state:'STOPPED',started_utc:'2026-11-19T13:00:00Z',point_count:1}];
let point={latitude:38.1,longitude:-120.5,accuracy_m:8,observed_utc:'2026-11-19T13:00:00Z'};
const calls=[],events=[];
const document={hidden:false,getElementById:el,handlers:{},addEventListener(n,fn){this.handlers[n]=fn;},
  body:{append(){}},createElement(){return {remove(){},click(){}};}};
const navigator={geolocation:{getCurrentPosition(done){done({timestamp:Date.now(),coords:{latitude:38.22,longitude:-120.44,accuracy:8}});},
  watchPosition(){return 20;},clearWatch(){}}};
const window={OpenRFMapReadOnly(){return null;},addEventListener(){},dispatchEvent(e){events.push(e.type);},
  async OpenRFPlanReturnToStart(coords,mode){calls.push({coords,mode});return 'New route planned';}};
async function fetch(url,options={}){
  const method=options.method||'GET',parts=url.split('/');
  let data,status=200;
  if(url==='/api/navigation/breadcrumbs' && method==='GET')data={sessions};
  else if(url==='/api/navigation/breadcrumbs' && method==='POST'){
    const body=JSON.parse(options.body);calls.push(body);
    const session={id:2,label:body.label,travel_mode:body.travel_mode,state:'RECORDING',point_count:0,started_utc:new Date().toISOString()};
    sessions.push(session);data={session};status=201;
  }else if(parts.length===6 && parts[5]==='points'){
    data={saved:true,point_count:1};status=201;
  }else if(parts.length===6 && parts[5]==='stop'){
    sessions.find(s=>s.id===Number(parts[4])).state='STOPPED';data={stopped:true};
  }else if(parts.length===5 && method==='GET'){
    data={session:sessions.find(s=>s.id===Number(parts[4])),distance_m:0,points:[point]};
  }else throw Error(`Unexpected mock request ${method} ${url}`);
  return {ok:status<400,status,async json(){return data;}};
}
vm.runInNewContext(script,{document,navigator,window,fetch,console,Date,Number,Math,JSON,Error,
  CustomEvent:class {constructor(type){this.type=type;}},
  setInterval(){},setTimeout(){},URL:{},Blob:function(){},confirm(){return false;}});
const tick=()=>new Promise(resolve=>setTimeout(resolve,20));
(async()=>{
  await tick();
  assert.equal(window.OpenRFBreadcrumbs.snapshot().recording,false);
  assert.equal(calls.length,0,'Reading saved history must never request a route or GPS');
  await window.OpenRFBreadcrumbs.start('auto');
  assert.equal(window.OpenRFBreadcrumbs.snapshot().recording,true);
  assert.equal(window.OpenRFBreadcrumbs.snapshot().mode,'auto');
  assert(calls.some(call=>call.travel_mode==='auto'));
  await window.OpenRFBreadcrumbs.stop();
  assert.equal(window.OpenRFBreadcrumbs.snapshot().recording,false);
  const button={dataset:{track:'return'},disabled:false,closest(sel){return sel==='[data-breadcrumb-id]'?{dataset:{breadcrumbId:'1'}}:null;}};
  await el('breadcrumb-list').handlers.click({target:{closest(){return button;}}});
  assert.equal(calls.at(-1).mode,'auto','Return must match saved mode');
  assert.deepEqual(Array.from(calls.at(-1).coords),[-120.5,38.1]);
  assert(el('breadcrumb-status').textContent.includes('New route planned'));
  assert(events.includes('openrf:breadcrumbs-state'));
  console.log('PASS v0.2.144 driving/walking breadcrumb mode, return-to-start request, map controls and 1280x800 spacing');
})().catch(error=>{console.error(error);process.exitCode=1;});
