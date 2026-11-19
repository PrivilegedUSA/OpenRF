'use strict';
// Regression: Valhalla returns a pedestrian ROAD_ROUTE, but the browser's
// shared turn-list guard used to reject anything not marked as a *drive*.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const guide=require('../openrf/static/route_guidance.js');
const app=fs.readFileSync('openrf/static/app.js','utf8');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');

const walking={type:'ROAD_ROUTE',provider:'local-valhalla',travel_mode:'pedestrian',is_driving_route:false,
  coordinates:[[-120.635,38.489],[-120.6347,38.4894],[-120.6345,38.4897]],
  origin:[-120.635,38.489],destination:[-120.6345,38.4897],distance_miles:0.06,duration_seconds:76,
  maneuvers:[
    {instruction:'Walk north along the path.',length_miles:0.06,shape_index:0,leg:1},
    {instruction:'You have arrived.',length_miles:0,shape_index:2,leg:1}
  ]};
assert.deepEqual(guide.routeSteps(walking).map(s=>s.instruction),walking.maneuvers.map(m=>m.instruction),
  'Real pedestrian route directions can be shown as a planned turn list');
assert.equal(guide.hasCompleteDirections(walking),true);
for(const drivingOnly of [()=>guide.locate(walking,-120.635,38.489),
  ()=>guide.sampleRoute(walking,0),()=>guide.routeVisualHeading(walking,-120.635,38.489),
  ()=>guide.guidance(walking,-120.635,38.489,10)])
  assert.throws(drivingOnly,/verified road route/,'GPS follow and drive simulation stay driving-only');
assert.throws(()=>guide.routeSteps({type:'DIRECT_LINE',coordinates:walking.coordinates}),/verified road route/);

const nodes=new Map();
const $=id=>{
  if(!nodes.has(id))nodes.set(id,{hidden:false,disabled:false,open:false,textContent:'',innerHTML:'',
    parentElement:{hidden:false},style:{setProperty(){}},replaceChildren(){this.items=[];},
    append(child){(this.items||=[]).push(child)},addEventListener(){},getBoundingClientRect(){return {height:40}}});
  return nodes.get(id);
};
const document={createElement(tag){return {tag,textContent:'',className:'',children:[],
  append(...parts){this.children.push(...parts)},setAttribute(){},addEventListener(){}}}};
const state={navPreview:null,navFollowId:null,navDestinationEpoch:0,navRoadPrefsDirty:false};
const ctx={$,document,state,routeGuide:guide,
  api:async(path,method,data)=>{
    assert.equal(path,'/api/navigation/route');assert.equal(method,'POST');
    assert.equal(data.options.travel_mode,'pedestrian');
    assert.equal(data.locations.length,2);return {route:walking,camera_report:null};
  },
  setMapDestinationStatus(){},cameraPanelVisibility(){},escapeHTML:text=>text,
  startSelectedRouteNavigation(){},
  updateDirectionsStickyOffset(){},stopNavigationFollow(){},syncMapPickedAction(){},
  renderNavigationOverlay(){},applyNavigationFit(){},setTimeout(){},showRouteCameras(){},
  setNavigationRoutePreview(route){state.navPreview=route;ctx.renderDirectionsReview(route);}
};
vm.createContext(ctx);
function extract(start,end){
  const a=app.indexOf(start),b=app.indexOf(end,a+start.length);
  assert(a>=0 && b>a,`Missing ${start}`);return app.slice(a,b);
}
vm.runInContext(extract('function renderDirectionsReview(route) {','function routeLabels(){'),ctx);
vm.runInContext(extract('async function planRoadRoute(', 'async function freshNavigationOrigin()'),ctx);
(async()=>{
  const outcome=await ctx.planRoadRoute([walking.origin,walking.destination],{travelMode:'pedestrian'});
  assert.equal(outcome.road,walking,'Successful local walking route stays a road-graph route, not direct-line fallback');
  assert.match(outcome.text,/Walking plan/);
  assert.equal($('map-directions-review').hidden,false);
  assert.equal($('map-directions-review').open,true);
  assert.equal($('map-directions-list').items.length,2);
  assert.equal($('map-directions-actions').hidden,true,'No driving export controls for walking');
  assert.equal($('map-directions-start').hidden,true,'Walking route does not enable driving follow');
  assert.equal($('map-walking-follow-actions').hidden,false,'Walking route exposes its own GPS follow action');
  assert.equal($('map-directions-walk-start').disabled,false,'Valid Valhalla pedestrian route enables walking follow');
  assert.match($('nav-directions').innerHTML,/Walk north along the path/);
  const modeMarkup=html.match(/id="map-mode-drive"[\s\S]*?id="map-mode-walk"[\s\S]*?<\/button>/)?.[0]||'';
  assert.match(modeMarkup,/Font Awesome Free 6\.7\.2/);
  assert.match(modeMarkup,/viewBox="0 0 640 512"/,'car-side icon is bundled inline');
  assert.match(modeMarkup,/viewBox="0 0 320 512"/,'person-walking icon is bundled inline');
  const getButton=html.match(/id="map-start-navigation"[^>]*>([\s\S]*?)<\/button>/)?.[1];
  assert(getButton && !getButton.includes('<svg') && !getButton.includes('nav-start-icon'),
    'Get directions has only a text label');
  assert.match(css,/#map-begin-guidance/);
  assert.match(css,/fa-location-arrow\.svg/,'Font Awesome arrow moves onto navigation start controls');
  assert.match(html,/route_guidance\.js\?v=0\.2\.139/,'updated route helper bypasses stale browser cache');
  console.log('PASS v0.2.139 pedestrian turn list, driving-only follow guard, Font Awesome selector and start icons');
})().catch(error=>{console.error(error);process.exitCode=1});
