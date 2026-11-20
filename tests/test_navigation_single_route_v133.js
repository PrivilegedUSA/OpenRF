'use strict';
// A single local Valhalla road route has no route-choice card. Directions must
// expose the same guarded Start action without opening destination search.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
const app=fs.readFileSync('openrf/static/app.js','utf8');

const directions=html.slice(html.indexOf('<details id="map-directions-review"'),html.indexOf('<section id="map-route-choices"'));
assert(directions,'Directions panel is available');
const exportRow=directions.indexOf('class="map-directions-actions"');
const start=directions.indexOf('id="map-directions-start"');
const turns=directions.indexOf('id="map-directions-list"');
assert(exportRow>=0 && start>exportRow && turns>start,
  'Start appears after Print/Save actions and before turn-by-turn directions');
assert(css.includes('--openrf-directions-actions-height'),
  'Start sticks below dynamically measured export controls');
assert(css.includes('.map-picked-action{max-height:min(67dvh,350px)}'),
  'Picked destination popup is taller on the field display');
assert(css.includes('.map-picked-buttons{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))'),
  'Destination action buttons are on tidy touch-friendly rows');

const ids=new Map();
function $(id){
  if(!ids.has(id))ids.set(id,{hidden:false,disabled:false,open:false,textContent:'',clicks:0,
    parentElement:{hidden:false},style:{setProperty(){}},addEventListener(type,fn){this[`on_${type}`]=fn},
    setAttribute(name,value){this[name]=value},
    getBoundingClientRect(){return {height:40}},replaceChildren(){},click(){this.clicks++}});
  return ids.get(id);
}
const state={navFollowId:null,navPreview:null};
const ctx={$,state,routeGuide:{routeSteps(){return []}},updateDirectionsStickyOffset(){}};
vm.createContext(ctx);
function extract(start,end){
  const begin=app.indexOf(start),finish=app.indexOf(end,begin+start.length);
  assert(begin>=0 && finish>begin,`Could not locate ${start}`);
  return app.slice(begin,finish);
}
vm.runInContext(extract('function startSelectedRouteNavigation(){',"$('route-choice-start').addEventListener"),ctx);
vm.runInContext(extract('function renderDirectionsReview(route) {','function routeLabels(){'),ctx);
const road={type:'ROAD_ROUTE',travel_mode:'auto',is_driving_route:true,
  distance_miles:0.4,duration_seconds:180};
state.navPreview=road;
ctx.renderDirectionsReview(road);
assert.equal($('map-directions-review').hidden,false,'Single road route opens Directions');
assert.equal($('map-directions-review').open,true,'Directions are expanded by default');
assert.equal($('map-directions-start').disabled,false,'Valid road route enables Start');
assert.equal($('map-directions-start').hidden,false,'Start is visible');
assert.equal($('map-directions-start').parentElement.hidden,false,'Start row is visible');
$('map-directions-start').on_click();
assert.equal($('map-begin-guidance').clicks,1,'Start delegates to existing guarded GPS-follow');

const walking={type:'ROAD_ROUTE',travel_mode:'pedestrian',is_driving_route:false,
  distance_miles:0.2,duration_seconds:420};
state.navPreview=walking;
$('map-begin-guidance').disabled=true;
ctx.renderDirectionsReview(walking);
assert.equal($('map-directions-review').open,true,'Walking turn list is expanded');
assert.equal($('map-directions-actions').hidden,true,'Driving-only export controls hidden for walking');
assert.equal($('map-directions-start').parentElement.hidden,true,'Driving GPS action is hidden in walking mode');
assert.equal($('map-walking-follow-actions').hidden,false,'Walking has a separate opt-in GPS follow action');
assert.equal($('map-directions-walk-start').disabled,false,'A complete pedestrian route can start walking follow');
assert.match($('map-directions-intro').textContent,/Start walking navigation only when you are ready/);
$('map-directions-start').on_click();
assert.equal($('map-begin-guidance').clicks,1,'Pedestrian plan cannot start driving follow');

assert(html.includes('id="map-mode-drive"') && html.includes('id="map-mode-walk"'),
  'Car and walking icon mode controls appear above the origin and destination');
assert(html.indexOf('id="map-mode-drive"')<html.indexOf('id="map-origin-control"'),
  'Travel mode is chosen first');
assert(html.indexOf('id="map-mode-walk"')<html.indexOf('id="map-destination-query"'),
  'Travel mode precedes destination entry');
assert(css.includes('.map-travel-mode-button[aria-pressed="true"]'),
  'Selected mode is visually distinct');
assert(html.includes('id="nav-preview-walking"'),'Trip planner exposes pedestrian routing');
assert(html.includes('id="nav-pick-start-map"') && html.includes('id="nav-pick-map"'),
  'Trip-planner origin and destination can both be picked on the map');
assert(app.includes("quickDestinationPreview($('map-destination-query').value,state.navTravelMode)"),
  'Map-picked and typed destinations share the current Drive/Walk selection');
assert(app.includes("planRoadRoute([origin,...stops,destination],{travelMode})"),
  'Trip-planner walking shares origin, optional stops and destination');
assert(app.includes("previewNavigation('pedestrian')"),
  'Walking uses pedestrian costing instead of car restrictions');
assert(app.includes("state.navPreview?.type==='ROAD_ROUTE'"),
  'Map-picked action popup closes for any completed route');
assert(app.includes("$('map-directions-review').open=false; // Two genuine choices"),
  'Alternative chooser does not fight the automatically expanded Directions panel');
assert(app.includes('Walking routing unavailable:'),'Walking fallback says direct line is not a path');
vm.runInContext(extract("state.navTravelMode='auto';",'// Quick "Where to?"'),ctx);
assert.equal(state.navTravelMode,'auto','Default mode is driving');
$('map-mode-walk').on_click();
assert.equal(state.navTravelMode,'pedestrian','Tapping walk selects pedestrian costing');
assert.equal($('map-mode-walk')['aria-pressed'],'true','Walking icon has selected accessibility state');
assert.equal($('map-mode-drive')['aria-pressed'],'false');
assert.equal($('map-picked-route').textContent,'Walking directions','Map-picked action matches mode');
assert.equal($('map-search-camera-options').hidden,true,'Walking hides driving camera preferences');
assert.equal($('map-begin-guidance').hidden,true,'Walking hides driving GPS-follow control');
$('map-mode-drive').on_click();
assert.equal(state.navTravelMode,'auto','Returning to drive restores mode');
assert.equal($('map-picked-route').textContent,'Driving directions');
assert.equal($('map-begin-guidance').hidden,false);
console.log('PASS v0.2.146 single-route Start, expanded directions, car/walk selector, map-picked origin/destination');
