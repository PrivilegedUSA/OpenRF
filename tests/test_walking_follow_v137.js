'use strict';
// v0.2.141: opt-in, real-fix pedestrian follow; keep driving-only guidance gated.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const guide=require('../openrf/static/route_guidance.js');
const app=fs.readFileSync('openrf/static/app.js','utf8');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');

const walking={type:'ROAD_ROUTE',provider:'local-valhalla',travel_mode:'pedestrian',is_driving_route:false,
  coordinates:[[-120.635,38.489],[-120.6347,38.4894],[-120.6344,38.4898],[-120.634,38.4902]],
  origin:[-120.635,38.489],destination:[-120.634,38.4902],distance_miles:.11,duration_seconds:190,
  maneuvers:[
    {instruction:'Walk east on the path.',shape_index:0,length_miles:.04},
    {instruction:'Turn right onto the walkway.',shape_index:2,length_miles:.07},
    {instruction:'You have arrived.',shape_index:3,length_miles:0}
  ]};
const distanceToEnd=guide.distance(walking.origin,walking.destination);
const atStart=guide.walkingGuidance(walking,...walking.origin,8);
assert.equal(atStart.instruction,'Walk east on the path.','First maneuver must stay active at origin');
assert.equal(atStart.next_instruction,'Turn right onto the walkway.');
assert(atStart.remaining_m>100 && atStart.remaining_m>distanceToEnd*.75);
const middle=guide.walkingGuidance(walking,...walking.coordinates[2],8,atStart.along_m);
assert.equal(middle.instruction,'Turn right onto the walkway.','Walking instructions advance on a fresh on-route fix');
assert(middle.remaining_m<atStart.remaining_m);
const end=guide.walkingGuidance(walking,...walking.destination,8,middle.along_m);
assert.equal(end.instruction,'You have arrived.');
const offpath=guide.walkingGuidance(walking,-120.63,38.49,8,middle.along_m);
assert.equal(offpath.offroute,true,'Off-route walking must pause route advancement');
for(const invalid of [
  {...walking,type:'DIRECT_LINE'},
  {...walking,travel_mode:'auto',is_driving_route:true},
  {...walking,travel_mode:'pedestrian',is_driving_route:true},
  {...walking,coordinates:[]}
])assert.throws(()=>guide.walkingGuidance(invalid,...walking.origin,8),
  /walking route|verified road route/,'Never follow a straight line or driving route as pedestrian GPS');
assert.throws(()=>guide.walkingGuidance(walking,...walking.origin,NaN),/accuracy/);
assert.throws(()=>guide.locate(walking,...walking.origin),/verified road route/,
  'Existing vehicle GPS matching remains driving-only by default');

assert.match(html,/id="map-directions-walk-start"[^>]*>Start walking navigation/);
assert.match(html,/route_guidance\.js\?v=0\.2\.141/,'Browser must load new walking guidance helper');
assert.match(css,/#page-map\.navigation-walking \.map-follow-hud/);
assert.match(css,/#map-directions-walk-start/,'Walking Start reuses bundled Font Awesome arrow');

const nodes=new Map();
function $(id){
  if(!nodes.has(id)){
    const classes=new Set();
    nodes.set(id,{hidden:false,disabled:false,textContent:'',innerHTML:'',open:false,
      classList:{add(...names){for(const name of names)classes.add(name)},
        remove(...names){for(const name of names)classes.delete(name)},
        contains(name){return classes.has(name)}},
      addEventListener(type,callback){this[`on_${type}`]=callback}});
  }
  return nodes.get(id);
}
const liveMapCalls=[],signalStates=[];
const state={navPreview:walking,navFollowId:null,navFollowMode:null,navFollowEpoch:0,
  navGnssEpoch:0,navGnssLast:0,navGnssBusy:false,navFollowCameraSuspended:false,
  navFollowLast:0,navFollowProgress:0,navFollowLastValidAt:0,mapReady:true,
  map:{easeTo(options){liveMapCalls.push(options)}},navDemoActive:false};
let watches=0,watchCallback=null,watchError=null,markerUpdates=0,stops=0;
const now=100000;
const ctx={$,state,routeGuide:guide,
  Date:{now(){return now}},
  navigator:{geolocation:{watchPosition(onFix,onError,options){
    watches++;watchCallback=onFix;watchError=onError;
    assert.equal(options.enableHighAccuracy,true);assert.equal(options.maximumAge,0);return 17;
  },clearWatch(){}}},
  setInterval(){return 5},clearInterval(){},
  pollLocalNavigationGnss(){},renderNavigationLanes(){},hideCameraApproachAlert(){},
  cameraPanelVisibility(){},escapeHTML(s){return s},
  setMapDestinationStatus(){},updateBrowserLocationMarker(){markerUpdates++},
  setNavigationSignalState(kind,accuracy){signalStates.push([kind,accuracy]);state.navFollowSignalState=kind},
  followPosition(fix){ctx.followWalkingPosition(fix)},
  stopNavigationFollow(){stops++;state.navFollowId=null;state.navFollowMode=null;state.navFollowEpoch++},
};
vm.createContext(ctx);
function extract(start,end){
  const a=app.indexOf(start),b=app.indexOf(end,a+start.length);
  assert(a>=0&&b>a,`Unable to locate ${start}`);return app.slice(a,b);
}
vm.runInContext(extract('function followWalkingPosition(pos){','function followPosition(pos){'),ctx);
vm.runInContext(extract('function startWalkingNavigation(){',"$('map-begin-guidance').addEventListener"),ctx);
assert(app.includes("$('map-directions-walk-start').addEventListener('click',startWalkingNavigation)"));
vm.runInContext("$('map-directions-walk-start').addEventListener('click',startWalkingNavigation)",ctx);
const pos=(coords,accuracy=8,timestamp=now)=>({timestamp,coords:{latitude:coords[1],longitude:coords[0],accuracy}});

// Getting directions or rendering a plan must never silently request GPS.
assert.equal(watches,0);assert.equal(liveMapCalls.length,0);
$('map-directions-walk-start').on_click();
assert.equal(watches,1,'GPS requested only after operator taps Start');
assert.equal(state.navFollowMode,'pedestrian');
assert.equal(state.navFollowId,17);
assert.equal($('map-follow-hud').hidden,false);
assert.match($('map-follow-instruction').textContent,/Waiting for live walking GPS/);
assert.equal(liveMapCalls.length,0,'No fake position or planned-route camera jump before live fix');
watchCallback(pos(walking.origin));
assert.equal(state.navFollowProgress,0,'Route begins at the real GPS origin');
assert.equal(markerUpdates,1);
assert.match($('map-follow-instruction').textContent,/Walk east on the path/);
assert.equal(liveMapCalls.length,1,'Fresh accurate GPS follows map');
assert.equal(liveMapCalls[0].pitch,0,'Walking follows north-up without driving pitch');
assert.equal(liveMapCalls[0].bearing,0);
assert.equal(state.browserLocation.source,'browser');
const noProgress=state.navFollowProgress;
watchCallback(pos(walking.coordinates[2],110));
assert.equal(state.navFollowProgress,noProgress,'Approximate GPS never advances walking turns');
assert.match($('map-follow-instruction').textContent,/accuracy too low/);
assert.equal(liveMapCalls.length,1,'Weak GPS does not pull map camera away');
watchCallback(pos([-120.63,38.49]));
assert.equal(state.navFollowProgress,noProgress,'Off-route GPS never advances progress');
assert.match($('map-follow-instruction').textContent,/Away from planned walking path/);
watchCallback(pos(walking.coordinates[2],8,now-16000));
assert.equal(state.navFollowProgress,noProgress,'Stale GPS cannot advance turns');
assert.match($('map-follow-instruction').textContent,/invalid or stale/);
watchCallback(pos(walking.coordinates[2]));
assert(state.navFollowProgress>noProgress,'Accurate fresh on-route position advances turns');
assert.match($('map-follow-instruction').textContent,/Turn right onto the walkway/);
assert.equal(stops,1,'Initial Start reuses clean navigation state');

// Stop invalidates old watch callbacks and a different route can never start
// a pedestrian session, even if a stale Start button remains clickable.
ctx.stopNavigationFollow();
const oldProgress=state.navFollowProgress;
watchCallback(pos(walking.destination));
assert.equal(state.navFollowProgress,oldProgress,'Post-stop GPS callback is ignored');
state.navPreview={...walking,type:'DIRECT_LINE'};
const priorWatches=watches;
$('map-directions-walk-start').on_click();
assert.equal(watches,priorWatches,'Direct-line fallback refuses live follow');
assert.equal(state.navFollowId,null);
assert.equal(typeof watchError,'function');
console.log('PASS v0.2.141 walking follow: start-only permission, real GPS, accuracy, off-route, stale, stop, direct-line guard');
