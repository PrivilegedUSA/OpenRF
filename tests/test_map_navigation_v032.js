// v0.2.32: map-first control layout, destination dragging, real road-only GPS follow.
'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const base=path.join(__dirname,'../openrf/static');
const routeGuide=require('../openrf/static/route_guidance.js');
const source=fs.readFileSync(path.join(base,'app.js'),'utf8');
const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
const css=fs.readFileSync(path.join(base,'app.css'),'utf8');
assert(html.indexOf('class="map-wrap"')<html.indexOf('class="map-destination-panel is-collapsed"'));
assert.equal((html.match(/id="map-destination-form"/g)||[]).length,1);
assert.equal((html.match(/id="map-pick-destination"/g)||[]).length,1);
assert(html.includes('id="map-begin-guidance" disabled'));
assert(html.includes('Get directions') && html.includes('Start navigation'));
assert(html.indexOf('id="map-destination-form"')<html.indexOf('id="map-follow-hud"'));
assert(css.includes('position:absolute;top:8px') && css.includes('--openrf-nav-overlay-bottom'));
assert(css.includes('#page-map .map-destination-actions{display:grid;grid-template-columns:1fr 1fr'));
assert(source.includes('destinationPinSVG(last[0],last[1])'), 'road-route pin is draggable too');
assert(source.includes('state.navPickedPoint=chosen.coordinates.slice()'), 'geocoded address places draggable pin');
assert(source.includes('direct.distance_km>150'), 'no invented national road reference');
assert(source.includes('no route was drawn.') && source.includes('The installed local road graph may cover only Northern California'));
assert(source.includes("$('map-begin-guidance').disabled=!(result?.type==='ROAD_ROUTE'"), 'GPS follow only for confirmed road plans');
assert(source.includes('navigator.geolocation.watchPosition(') && source.includes('navigator.geolocation.clearWatch(state.navFollowId)'), 'explicit start and clear GPS watch');
assert(source.includes("if(page!=='map' && state.navFollowId!==null) stopNavigationFollow()"), 'watch stops when leaving map');
assert(!source.includes("api('/api/survey/waypoints','POST'"+'state.navFollowId'), 'follow loop never writes waypoint');
const begin=source.indexOf('function navigationNearestShape(');
const end=source.indexOf("$('map-begin-guidance').addEventListener('click'",begin);
assert(begin>0&&end>begin);
let markerUpdates=0, stops=0;
const els={
  'map-follow-instruction':{textContent:''},'map-follow-quality':{textContent:''},
  'map-follow-distance':{textContent:''},'map-follow-hud':{classList:{toggle(){},remove(){}}},
  'map':{clientHeight:400}
};
const cam=[];
const state={navFollowId:11,navPreview:{type:'ROAD_ROUTE',is_driving_route:true,
 coordinates:[[-120.6,38.4],[-120.599,38.4],[-120.598,38.4],[-120.597,38.4]],
 maneuvers:[{instruction:'Turn right soon.',shape_index:3}]},
 navFollowProgress:0,navFollowLast:0,mapReady:true,map:{easeTo(o){cam.push(o)}},rasterMap:null};
const methods=Function('state','$','updateBrowserLocationMarker','stopNavigationFollow','routeGuide',
 `${source.slice(begin,end)};return {navigationNearestShape,followPosition};`)(state,id=>els[id],()=>markerUpdates++,()=>stops++,routeGuide);
let now=Date.now();
methods.followPosition({timestamp:now,coords:{latitude:38.4,longitude:-120.6,accuracy:8,heading:125,speed:7}});
assert.equal(els['map-follow-instruction'].textContent,'Turn right soon.');
assert.match(els['map-follow-distance'].textContent,/ft|mi/);
assert.equal(cam.length,1);
assert.equal(cam[0].pitch,48);
assert.equal(cam[0].bearing,125);
assert.equal(cam[0].zoom,16.5);
assert.equal(markerUpdates,1);
state.navFollowLast=0;
methods.followPosition({timestamp:now,coords:{latitude:38.4,longitude:-120.6,accuracy:250}});
assert.match(els['map-follow-instruction'].textContent,/^Planned: Turn right soon/);
assert.match(els['map-follow-distance'].textContent,/Approximate location.*250 m.*LIVE turn timing paused/i);
assert.equal(markerUpdates,2,'a coarse fix may update the current map dot but must not issue turn guidance');
assert.equal(cam.at(-1).zoom,15.25,'route-oriented camera is allowed for a nearby approximate fix, not lane-level timing');
assert.equal(cam.at(-1).pitch,42,'route-aligned perspective is explicitly visual, not a measured heading');
methods.followPosition({timestamp:now,coords:{latitude:40,longitude:-120,accuracy:8}});
assert.match(els['map-follow-instruction'].textContent,/off planned road/);
assert.equal(stops,0);
console.log('v0.2.32 map overlay, local road-only follow, safety, maneuver updates, and destination marker contracts passed.');
