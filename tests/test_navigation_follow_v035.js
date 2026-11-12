'use strict';
// v0.2.35: planned instructions survive coarse/stale fixes; precise moving
// GNSS produces a forward camera. No raw fixes persist to investigations.
const fs=require('node:fs'), assert=require('node:assert/strict');
const routeGuide=require('../openrf/static/route_guidance.js');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const src=fs.readFileSync('openrf/static/app.js','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
assert(html.includes('id="map-follow-planned"'));
assert(html.includes('id="map-follow-turns"'));
assert(html.includes('id="map-follow-source"'));
assert(css.includes('.map-follow-planned'));
assert(src.includes('X-OpenRF-GNSS-Consent'));
assert(src.includes('if(state.navFollowId===null || state.navGnssBusy)return;'));
assert(src.includes('clearInterval(state.navGnssTimer)'));
const begin=src.indexOf('function navigationNearestShape(');
const end=src.indexOf("$('map-begin-guidance').addEventListener('click'",begin);
assert(begin>=0&&end>begin);
const elements={
 'map-follow-instruction':{textContent:''},'map-follow-distance':{textContent:''},
 'map-follow-quality':{textContent:''},'map-follow-source':{textContent:''},
 'map-follow-planned':{textContent:'',hidden:false},
 'map-follow-hud':{classList:{toggle(){},remove(){}}},'map':{clientHeight:500}
};
let updates=0, cam=[];
const route={type:'ROAD_ROUTE',is_driving_route:true,coordinates:[[-120.6,38.4],[-120.599,38.4],[-120.598,38.4]],
 maneuvers:[{instruction:'Depart Main Street',length_miles:.1,leg:1,shape_index:0},
 {instruction:'Turn left onto Oak Street',length_miles:.2,leg:1,shape_index:2}]};
const state={navFollowId:7,navPreview:route,navFollowLast:0,navFollowProgress:0,navGnssLast:0,
 mapReady:true,map:{easeTo(x){cam.push(x)}},rasterMap:null};
const $=id=>elements[id];
const {followPosition}=Function('state','$','routeGuide','updateBrowserLocationMarker','stopNavigationFollow',
 src.slice(begin,end)+'; return {followPosition}')(state,$,routeGuide,()=>updates++,()=>{});
const now=Date.now();
followPosition({timestamp:now,coords:{latitude:38.4,longitude:-120.6,accuracy:107}});
assert.match(elements['map-follow-instruction'].textContent,/Approximate location/);
assert.match(elements['map-follow-planned'].textContent,/Planned \(not current\): Turn left/);
assert.equal(elements['map-follow-planned'].hidden,false);
assert.equal(cam.at(-1).pitch,0);
state.navFollowLast=0; // camera throttles frequent fixes in production
followPosition({timestamp:now,origin:'gpsd',source_device:'ttyUSB0',coords:{latitude:38.4,longitude:-120.6,accuracy:8,heading:90,speed:5}});
assert.equal(elements['map-follow-instruction'].textContent,'Turn left onto Oak Street');
assert.equal(elements['map-follow-planned'].hidden,true);
assert.match(elements['map-follow-quality'].textContent,/Local gpsd GNSS/);
assert.equal(cam.at(-1).pitch,48);
assert.equal(cam.at(-1).bearing,90);
assert(cam.at(-1).offset[1]>0);
assert.equal(updates,2);
state.navGnssLast=Date.now();
followPosition({timestamp:Date.now(),coords:{latitude:38.4,longitude:-120.6,accuracy:100}});
assert.equal(updates,2,'fresh local gpsd must take precedence over a coarse browser fix');
console.log('v0.2.35 planned guidance, GNSS source priority, GPS accuracy and behind-driver camera passed');
