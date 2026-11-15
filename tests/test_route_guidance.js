'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const routeGuide=require('../openrf/static/route_guidance.js');
const base='openrf/static/';
const html=fs.readFileSync(base+'index.html','utf8');
const js=fs.readFileSync(base+'app.js','utf8');
const css=fs.readFileSync(base+'app.css','utf8');
const server=fs.readFileSync('openrf/server.py','utf8');
const road={type:'ROAD_ROUTE',is_driving_route:true,provider:'local-valhalla',distance_miles:1.45,duration_seconds:350,
  coordinates:[[-120.60,38.40],[-120.599,38.40],[-120.598,38.40],[-120.598,38.401],[-120.598,38.402]],
  maneuvers:[{instruction:'Depart from Main St',length_miles:0.2,shape_index:0,leg:1},
    {instruction:'Turn right onto Ponderosa Way',length_miles:0.8,shape_index:3,leg:1},
    {instruction:'Your destination is on the right.',length_miles:0,shape_index:4,leg:1}]};
const p=routeGuide.guidance(road,-120.5995,38.4,8);
assert(!p.offroute);assert(p.next.instruction.includes('Turn right'));
assert(p.next.distance_m>80&&p.next.distance_m<400,p.next.distance_m);
assert(routeGuide.distanceText(p.next.distance_m).includes('ft'));
const later=routeGuide.guidance(road,-120.598,38.4013,8,p.along_m);
assert(later.along_m>p.along_m);
assert(later.next.instruction.includes('destination'));
assert(routeGuide.guidance(road,-120.59,38.41,8).offroute);
assert.throws(()=>routeGuide.routeMetric?.({type:'DIRECT_DISTANCE_ONLY'}) ?? routeGuide.locate({type:'DIRECT_DISTANCE_ONLY'},1,2),/road route/i);
const sheet=routeGuide.sheet(road,{origin:'<Unsafe> & Start',destination:'"Home"'});
assert(sheet.startsWith('<!doctype html>'));
assert(sheet.includes('&lt;Unsafe&gt; &amp; Start') && !sheet.includes('<Unsafe>'));
assert(sheet.includes('Turn right onto Ponderosa Way'));
assert(sheet.includes('<li>') && sheet.includes('OPENRF'));
assert(sheet.includes('no live traffic') && !sheet.includes('<script'));
for(const id of ['map-directions-review','map-directions-list','map-print-directions','map-save-directions-html','map-save-directions-json','map-follow-distance'])
 assert(html.includes(`id="${id}"`),id);
assert(html.includes('/static/route_guidance.js?v=0.2.74'));
assert(server.includes("'/static/route_guidance.js'"));
assert(js.includes("$('page-map').classList.add('navigation-driving')"));
assert(js.includes('routeGuide.guidance('));
assert(js.includes('routeGuide.sheet('));
assert(js.includes('navigator.geolocation.watchPosition('));
assert(css.includes('navigation-driving .map-destination-panel'));
assert(css.includes('navigation-driving .map-follow-hud'));
console.log('v0.2.37 route geometry, incremental maneuvers, offline sheet, export controls and follow mode checks passed');
