'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const nav=require('../openrf/static/route_guidance.js');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const js=fs.readFileSync('openrf/static/app.js','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
const route={type:'ROAD_ROUTE',is_driving_route:true,coordinates:[
  [-120.6,38.4],[-120.5999,38.4],[-120.5999,38.4002],[-120.5999,38.401],[-120.599,38.401],[-120.598,38.401]
],maneuvers:[
 {instruction:'Start',shape_index:0,leg:1},
 {instruction:'Turn right onto Cedar Creek Road',shape_index:1,leg:1},
 {instruction:'Turn left onto Pine Grove',shape_index:4,leg:1},
 {instruction:'You have arrived at your destination.',shape_index:5,leg:1}
]};
assert.equal(nav.routeSteps(route)[1].shape_index,1,'turn list retains geometric index');
const point=nav.turnAvoidPoint(route,route.maneuvers[1]);
assert(point && Number.isFinite(point.longitude) && Number.isFinite(point.latitude));
assert(Math.abs(point.longitude-(-120.5999))<1e-7 && point.latitude>38.4002 && point.latitude<38.401,
  'exclusion is downstream on the outgoing road, not at the junction');
assert.equal(nav.turnAvoidPoint(route,route.maneuvers[3]),null,'arrival is not a road to avoid');
assert.equal(nav.turnAvoidPoint(route,{shape_index:-1}),null);
assert.equal(nav.turnAvoidPoint(route,{shape_index:500}),null);
assert.equal(nav.turnAvoidPoint({coordinates:[],maneuvers:[]},{shape_index:0}),null);
const short={coordinates:[[-120,38.4],[-119.999999,38.4]],maneuvers:[]};
assert.equal(nav.turnAvoidPoint(short,{shape_index:0}),null,'unreliable short segment cannot be selected');
for(const id of ['route-road-control','route-road-count','map-camera-route-enable','map-directions-list']){
  assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1,id);
}
assert(html.includes('<details class="route-road-control" id="route-road-control">'), 'advanced road controls collapsed');
assert(!html.includes('data-route-camera-type="ALPR" checked'), 'camera opt-in defaults off');
assert(js.includes('function addTurnRoadAvoidance(') && js.includes("['trip','This trip']") &&
 js.includes("['saved','Save for future trips']"), 'each maneuver supports both scopes');
assert(js.includes('onRoutePreferencesChanged()'), 'exclusions invalidate old comparison');
assert(js.includes('function syncRouteCameraPrefs()') && js.includes('openrf.route-prefs.v1'),'simple choices persist in browser');
assert(js.includes("$('route-avoid-settings').insertBefore($('map-camera-route-panel'),$('route-road-control'))"));
assert(css.includes('.route-step-avoid-actions[hidden]') && css.includes('.route-road-control:not([open])'),'collapsed controls hidden');
console.log('PASS v0.2.65 turn-based road exclusions, bounds, camera switches and persistence');
