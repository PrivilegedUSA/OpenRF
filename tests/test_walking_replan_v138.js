'use strict';
// Replan is a deliberate local Valhalla request, never an automatic GPS callback.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const guide=require('../openrf/static/route_guidance.js');
const app=fs.readFileSync('openrf/static/app.js','utf8');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
assert.match(html,/id="map-walking-replan" hidden>Replan walk from here/);
assert.match(css,/#page-map #map-walking-replan\[hidden\]\{display:none!important\}/);
assert(app.includes("$('map-walking-replan').addEventListener('click',replanWalkingFromFix)"));
assert(!app.includes('tryNavigationReroute(route,lat,lon); // walking'),
  'Vehicle automatic rerouting cannot be reused for pedestrian routes');

const route={type:'ROAD_ROUTE',travel_mode:'pedestrian',is_driving_route:false,
  coordinates:[[-120.635,38.489],[-120.6347,38.4894],[-120.6344,38.4898]],
  origin:[-120.635,38.489],destination:[-120.6344,38.4898],distance_miles:.07,duration_seconds:130,
  maneuvers:[{instruction:'Walk along path',shape_index:0,length_miles:.07},
    {instruction:'Arrive',shape_index:2,length_miles:0}]};
const updated={...route,
  origin:[-120.63,38.49],coordinates:[[-120.63,38.49],[-120.633,38.4899],route.destination],
  maneuvers:[{instruction:'Walk on new mapped path',shape_index:0,length_miles:.17},
    {instruction:'Arrive',shape_index:2,length_miles:0}]};
const nodes=new Map();
function $(id){
  if(!nodes.has(id))nodes.set(id,{hidden:false,disabled:false,textContent:'',innerHTML:'',
    classList:{add(){},remove(){}}});
  return nodes.get(id);
}
const now=100000;
const offpath={timestamp:now,coords:{latitude:38.49,longitude:-120.63,accuracy:8}};
const state={navPreview:route,navFollowId:17,navFollowMode:'pedestrian',navFollowEpoch:2,
  navFollowProgress:0,navFollowLastPosition:offpath,navFollowLast:now,navGnssLast:0,
  navFollowLastValidAt:0,navFollowSignalState:'waiting',map:null,mapReady:false,rasterMap:null};
let requests=[],nextAnswer=null,previewChanges=[],statuses=[];
const ctx={$,state,routeGuide:guide,Date:{now(){return now}},
  api:async (...args)=>{requests.push(args);return typeof nextAnswer==='function'?nextAnswer():nextAnswer;},
  setNavigationRoutePreview(next){previewChanges.push(next);state.navPreview=next;state.navFollowId=null;state.navFollowMode=null;state.navFollowEpoch++;},
  setMapDestinationStatus(...args){statuses.push(args)},
  updateBrowserLocationMarker(){},setNavigationSignalState(kind){state.navFollowSignalState=kind},escapeHTML:s=>s,
};
vm.createContext(ctx);
const extract=(start,end)=>{
  const a=app.indexOf(start),b=app.indexOf(end,a+start.length);
  assert(a>=0&&b>a,`Missing ${start}`);return app.slice(a,b);
};
vm.runInContext(extract('function followWalkingPosition(pos){','function followPosition(pos){'),ctx);
const reset=()=>{
  state.navPreview=route;state.navFollowId=17;state.navFollowMode='pedestrian';
  state.navFollowEpoch++;state.navFollowProgress=0;state.navFollowLastPosition=offpath;
  $('map-walking-replan').hidden=false;$('map-walking-replan').disabled=false;
  requests=[];previewChanges=[];statuses=[];
};

(async()=>{
  // A real off-path callback displays the action, but cannot initiate a replan.
  $('map-walking-replan').hidden=true;
  ctx.followWalkingPosition(offpath);
  assert.equal($('map-walking-replan').hidden,false);
  assert.equal(requests.length,0,'Off-path GPS alone never requests directions');
  assert.equal(state.navPreview,route);

  reset();state.navFollowLastPosition={...offpath,timestamp:now-17000};
  await ctx.replanWalkingFromFix();
  assert.equal(requests.length,0,'Stale GPS cannot request walking replan');
  assert.equal($('map-walking-replan').hidden,true);

  reset();state.navFollowLastPosition={...offpath,coords:{...offpath.coords,accuracy:85}};
  await ctx.replanWalkingFromFix();
  assert.equal(requests.length,0,'Approximate GPS cannot request walking replan');

  reset();state.navPreview={...route,stops:[[-120.634,38.489]]};
  await ctx.replanWalkingFromFix();
  assert.equal(requests.length,0,'Intermediate walking stops must not be silently skipped');

  reset();nextAnswer=()=>{throw Error('router offline')};
  await ctx.replanWalkingFromFix();
  assert.equal(requests.length,1);
  assert.equal(state.navPreview,route,'Failed request preserves original plan');
  assert.equal(state.navFollowId,17,'Failed request does not stop existing follow');
  assert.match($('map-follow-instruction').textContent,/original route preserved/);
  assert.equal(previewChanges.length,0);

  reset();nextAnswer={route:{...updated,type:'DIRECT_LINE'}};
  await ctx.replanWalkingFromFix();
  assert.equal(previewChanges.length,0,'Unverified direct line cannot replace the route');

  reset();nextAnswer={route:{...updated,travel_mode:'auto',is_driving_route:true}};
  await ctx.replanWalkingFromFix();
  assert.equal(previewChanges.length,0,'Driving response cannot replace a walking route');

  reset();nextAnswer={route:updated};
  await ctx.replanWalkingFromFix();
  assert.equal(requests.length,1,'Exactly one Valhalla request after explicit action');
  const [url,method,payload]=requests[0];
  assert.equal(url,'/api/navigation/route');assert.equal(method,'POST');
  assert.equal(payload.options.travel_mode,'pedestrian');
  assert.deepEqual(JSON.parse(JSON.stringify(payload.locations)),[
    {latitude:offpath.coords.latitude,longitude:offpath.coords.longitude},
    {latitude:route.destination[1],longitude:route.destination[0]}]);
  assert.equal(state.navPreview,updated,'Only a complete real pedestrian route replaces the original');
  assert.equal(state.navFollowId,null,'Operator must review and start navigation again');
  assert.match(statuses[0][0],/Review the path and tap Start walking navigation/);

  reset();
  let resume;
  nextAnswer=()=>new Promise(resolve=>{resume=resolve});
  const inFlight=ctx.replanWalkingFromFix();
  assert.equal(requests.length,1);
  state.navFollowEpoch++;state.navFollowId=null;state.navFollowMode=null;
  resume({route:updated});await inFlight;
  assert.equal(previewChanges.length,0,'An in-flight response after Stop cannot replace the trip');
  assert.equal(state.navPreview,route);
  console.log('PASS v0.2.147 explicit pedestrian replan gates, failed route preservation and stop epoch cancellation');
})().catch(error=>{console.error(error);process.exitCode=1});
