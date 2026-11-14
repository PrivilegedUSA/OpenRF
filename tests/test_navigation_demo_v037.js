'use strict';
// v0.2.37. Simulated route playback must never be mistaken for real location.
const fs=require('node:fs'), assert=require('node:assert/strict');
const guide=require('../openrf/static/route_guidance.js');
const src=fs.readFileSync('openrf/static/app.js','utf8');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
for(const id of ['map-demo-panel','map-demo-play','map-demo-pause','map-demo-end','map-demo-speed','map-demo-status'])
  assert(html.includes(`id="${id}"`),`missing ${id}`);
assert(css.includes('.openrf-demo-position'));
assert(src.includes('if(state.navFollowId===null || state.navDemoActive)return;'),
  'real watch must not overwrite DEMO playback');
assert(src.includes('if (state.browserLocation && !state.navDemoActive)'),
  'raster fallback must hide actual blue location marker during DEMO');

const road={type:'ROAD_ROUTE',is_driving_route:true,coordinates:[
  [-120.600,38.400],[-120.598,38.400],[-120.596,38.400],[-120.596,38.402],[-120.596,38.404]],
 maneuvers:[{instruction:'Drive east on Main St',shape_index:0,length_miles:.2,leg:1},
   {instruction:'Turn left on Oak St',shape_index:2,length_miles:.3,leg:1},
   {instruction:'You have arrived',shape_index:4,length_miles:0,leg:1}]};
const routeLength=guide.sampleRoute(road,0).total_m;
assert(routeLength>500 && routeLength<1000);
assert.throws(()=>guide.sampleRoute({type:'DIRECT_DISTANCE_ONLY'},1),/road route/i);
assert.throws(()=>guide.sampleRoute(road,NaN),/simulation distance/i);
const initial=guide.sampleRoute(road,0);
assert(Math.abs(initial.lon+120.6)<1e-8 && Math.abs(initial.lat-38.4)<1e-8);
assert(initial.heading>70 && initial.heading<110,'initial simulated view points east along route');
assert(initial.next.instruction.includes('Drive east'), 'first planned maneuver is the DEMO headline at departure');
assert(guide.sampleRoute(road,20).next.instruction.includes('Turn left')); 
const afterTurn=guide.sampleRoute(road,430);
assert(afterTurn.next.instruction.includes('arrived'),'the next planned turn must advance with simulated progress');
assert(afterTurn.heading<15 || afterTurn.heading>345,'after turning left the view points north');
assert(guide.sampleRoute(road,1e9).arrived);
assert.equal(guide.sampleRoute(road,1e9).remaining_m,0);

const listener={};
const elements={};
for(const id of ['page-map','map-follow-distance','map-follow-instruction','map-follow-camera-note',
  'map-follow-planned','map-follow-source','map-follow-quality','map-demo-status','map-demo-play',
  'map-demo-pause','map-demo-end','map-demo-speed','map-demo-panel','map-follow-hud','map']){
 elements[id]={hidden:false,textContent:'',value:'5',clientHeight:480,classList:{add(){},remove(){},toggle(){}},
   addEventListener(evt,fn){listener[id+'-'+evt]=fn;}};
}
const geoElement={hidden:false};
const cam=[];const intervalSet=[],clearedTimers=[],clearedWatches=[];
class Marker{
 constructor(opts){this.opts=opts;}
 setLngLat(point){this.coords=point;return this;}
 addTo(map){this.map=map;return this;}
 remove(){this.removed=true;}
}
const state={navPreview:road,navFollowId:15,navGnssEpoch:0,navGnssTimer:78,navGnssBusy:false,
 navFollowLast:0,navFollowCameraSuspended:false,navDemoActive:false,navDemoPaused:false,
 navDemoProgress:0,navDemoTimer:null,navDemoMarker:null,navDemoMarkerMap:null,navDemoLastTime:0,
 navDemoFix:null,browserLocation:{lat:38.4,lon:-120.6,accuracy:107,capturedAt:5},
 geoMarker:{getElement(){return geoElement}},mapReady:true,map:{easeTo(args){cam.push(args)}},rasterMap:null};
const originalBrowserLocation=state.browserLocation;
const $=id=>elements[id];
const factory=Function('state','$','routeGuide','document','window','maplibregl','navigator','setInterval',
 'clearInterval','performance','setMapDestinationStatus','stopNavigationFollow',
  'function resetNavigationVoice(){};function renderNavigationLanes(){};\n'+src.slice(src.indexOf('// v0.2.37: Explicit, in-memory-only DEMO travel'),
    src.indexOf("$('map-destination-form').addEventListener('submit'"))+
  ';return {playNavigationDemo,advanceNavigationDemo};');
const {playNavigationDemo,advanceNavigationDemo}=factory(state,$,guide,{createElement(){return {className:'',title:'',textContent:''}}},
 {maplibregl:{Marker}},{Marker},{geolocation:{clearWatch(id){clearedWatches.push(id)}}},
 (callback,ms)=>{intervalSet.push({callback,ms});return 100;},
 id=>clearedTimers.push(id),{now:()=>1000},()=>{},()=>{});
playNavigationDemo();
assert(state.navDemoActive && !state.navDemoPaused);
assert.equal(state.navFollowId,-2,'DEMO uses a sentinel, not a real watch ID');
assert.deepEqual(clearedWatches,[15],'real browser location watch explicitly stopped');
assert.deepEqual(clearedTimers,[78],'local gpsd polling also stopped');
assert.equal(geoElement.hidden,true,'hide blue real location dot when simulating');
assert.equal(state.browserLocation,originalBrowserLocation,'simulated coordinates never replace saved browser fix');
assert.match(elements['map-follow-instruction'].textContent,/DEMO/);
assert.match(elements['map-follow-source'].textContent,/No live GPS/);
assert.match(elements['map-follow-quality'].textContent,/No GPS collected/);
assert.equal(state.navDemoMarker.coords.length,2);
assert.equal(intervalSet.length,1);
assert.equal(intervalSet[0].ms,300);
assert(cam.length>0 && cam[0].pitch===55 && cam[0].offset[1]>0);
assert.equal(cam[0].bearing,initial.heading,'DEMO camera faces along the road, not a browser bearing');
advanceNavigationDemo(3000); // 2 s × 5 × 35 mph = about 156 m
assert(state.navDemoProgress>100 && state.navDemoProgress<200);
assert.match(elements['map-follow-instruction'].textContent,/Turn left/);
assert.equal(state.browserLocation,originalBrowserLocation,'no fake movement is presented as browser GPS');
listener['map-demo-pause-click']();
const progress=state.navDemoProgress;
advanceNavigationDemo(5000);
assert.equal(state.navDemoProgress,progress,'Pause must stop movement');
assert.equal(elements['map-demo-pause'].textContent,'Resume');
listener['map-demo-pause-click']();
assert.equal(state.navDemoPaused,false);
advanceNavigationDemo(7500);
assert(state.navDemoProgress>progress,'Resume advances the route');
advanceNavigationDemo(9700);
assert.match(elements['map-follow-instruction'].textContent,/You have arrived|Destination reached/);
assert.equal(state.browserLocation,originalBrowserLocation);
// The real Stop handler must clear the playback interval and remove the demo marker.
const stopSource=src.slice(src.indexOf('function stopNavigationFollow(){'),
 src.indexOf('function navigationNearestShape('));
const stop=Function('state','$','navigator','clearInterval','function resetNavigationVoice(){};function renderNavigationLanes(){};'+stopSource+';return stopNavigationFollow;')(
  state,$,{geolocation:{clearWatch(id){clearedWatches.push(id)}}},id=>clearedTimers.push(id));
const marker=state.navDemoMarker;
stop();
assert.equal(state.navDemoActive,false);
assert.equal(state.navFollowId,null);
assert.equal(state.navDemoTimer,null);
assert.equal(state.navDemoFix,null);
assert.equal(marker.removed,true);
assert.equal(geoElement.hidden,false,'actual browser marker becomes visible again after DEMO');
assert(clearedTimers.includes(100),'DEMO clock must stop');
assert.deepEqual(clearedWatches,[15],'DEMO sentinel must never be passed to clearWatch');
assert.equal(state.browserLocation,originalBrowserLocation,'Stop must not alter real browser position');
console.log('v0.2.37 pure route sampler, DEMO play/pause/resume, isolated watch, marker and camera passed');
