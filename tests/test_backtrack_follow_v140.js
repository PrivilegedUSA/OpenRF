'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const follow=require('../openrf/static/breadcrumb_follow.js');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const app=fs.readFileSync('openrf/static/app.js','utf8');
const script=fs.readFileSync('openrf/static/field-breadcrumbs.js','utf8');

const positions=[{latitude:38.1,longitude:-120.5},{latitude:38.1005,longitude:-120.5},
  {latitude:38.101,longitude:-120.5}];
const end=follow.closest(positions,positions[2]);
const start=follow.closest(positions,positions[0]);
assert(end.remaining_to_start_m>100 && end.remaining_to_start_m<120);
assert(start.remaining_to_start_m<1);
assert(follow.closest(positions,{latitude:38.101,longitude:-120.497}).offtrack_m>100);
const now=Date.now();
const fix=(latitude=38.101,longitude=-120.5,accuracy=8,timestamp=Date.now())=>
  ({coords:{latitude,longitude,accuracy},timestamp});
assert(follow.assessFix(fix(), 'auto').ok);
assert(!follow.assessFix(fix(38.101,-120.5,45), 'pedestrian').ok);
assert(follow.assessFix(fix(38.101,-120.5,45), 'auto').ok);
assert(!follow.assessFix(fix(38.101,-120.5,9,now-14000),'auto',now).ok);
assert.match(html,/id="map-breadcrumb-follow-hud"/);
assert.match(html,/breadcrumb_follow\.js\?v=0\.2\.147/);
assert.match(app,/OpenRFPrepareTrackBacktrack/);
assert.match(app,/stopFollow\?\./);

const els=new Map(),requests=[];
function el(id){
  if(!els.has(id)){
    const classes=new Set();
    els.set(id,{id,hidden:id==='map-breadcrumb-follow-hud',disabled:false,
      value:id==='breadcrumb-label'?'Trip':'',textContent:'',innerHTML:'',handlers:{},
      classList:{add:n=>classes.add(n),remove:n=>classes.delete(n),toggle(n,on){if(on)classes.add(n);else classes.delete(n);},contains:n=>classes.has(n)},
      addEventListener(n,cb){this.handlers[n]=cb;}});
  }
  return els.get(id);
}
const saved={id:3,state:'STOPPED',travel_mode:'auto',label:'Old drive',
  started_utc:'2026-11-19T10:00:00Z',point_count:3};
const document={hidden:false,getElementById:el,handlers:{},
  addEventListener(n,cb){this.handlers[n]=cb;},body:{append(){}},createElement(){return {click(){},remove(){}};}};
let watchCount=0,watchCallback,clearCount=0,firstFixCount=0,prepareCount=0;
const navigator={geolocation:{
  getCurrentPosition(done){firstFixCount++;done(fix());},
  watchPosition(cb){watchCount++;watchCallback=cb;return 71;},
  clearWatch(id){assert.equal(id,71);clearCount++;}
}};
async function fetch(url,opts={}){
  requests.push(`${opts.method||'GET'} ${url}`);
  let data;
  if(url==='/api/navigation/breadcrumbs')data={sessions:[saved]};
  else if(url==='/api/navigation/breadcrumbs/3')data={session:saved,points:positions,distance_m:110};
  else throw Error(`Unexpected API call ${url}`);
  return {ok:true,status:200,async json(){return data;}};
}
const window={OpenRFMapReadOnly(){return null;},OpenRFBreadcrumbFollow:follow,
  OpenRFPrepareTrackBacktrack(){prepareCount++;},addEventListener(){}};
vm.runInNewContext(script,{document,navigator,window,fetch,Date,Number,Math,JSON,Error,
  setInterval(){},setTimeout(){},console,confirm(){return true;},URL:{},Blob:function(){}});
function press(id,track){
  const button={disabled:false,dataset:{track},closest(selector){
    return selector==='[data-breadcrumb-id]'?{dataset:{breadcrumbId:String(id)}}:null;}};
  return el('breadcrumb-list').handlers.click({target:{closest(){return button;}}});
}
(async()=>{
  await new Promise(resolve=>setTimeout(resolve,15));
  assert.equal(firstFixCount,0,'Loading saved tracks must never start GPS');
  await press(3,'follow');
  assert.equal(firstFixCount,1);
  assert.equal(prepareCount,1,'Follow explicitly prepares a clean map');
  assert.equal(watchCount,1);
  assert(!el('map-breadcrumb-follow-hud').hidden);
  assert(window.OpenRFBreadcrumbs.snapshot().following);
  assert.match(el('breadcrumb-follow-distance').textContent,/along saved track/);
  watchCallback(fix(38.101,-120.497));
  assert.match(el('breadcrumb-follow-status').textContent,/Off recorded track/);
  watchCallback(fix(38.101,-120.5,800));
  assert.match(el('breadcrumb-follow-distance').textContent,/paused/);
  document.hidden=true;document.handlers.visibilitychange();
  assert.equal(clearCount,1,'Tab hiding must clear the live watch');
  assert(el('map-breadcrumb-follow-hud').hidden);
  assert(!window.OpenRFBreadcrumbs.snapshot().following);
  assert(requests.every(item=>item.startsWith('GET ')),'GPS backtrack must never write tracked positions');
  console.log('PASS v0.2.147 reverse-track GPS quality, distance, off-track and private stop lifecycle');
})().catch(error=>{console.error(error);process.exitCode=1;});
