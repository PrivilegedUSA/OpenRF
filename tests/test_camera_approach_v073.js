'use strict';
// Exact, deterministic camera-report approach checks without GPS hardware,
// geolocation requests, saved positions or synthetic LIVE data.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const camera=require('../openrf/static/camera_alerts.js');
const guide=require('../openrf/static/route_guidance.js');
const route={type:'ROAD_ROUTE',is_driving_route:true,
  coordinates:[[0,0],[0,0.02]],origin:[0,0],destination:[0,0.02]};
const report={radius_m:120,count:5,incomplete:false,sites:[
  {id:'a',type:'ALPR',state:'REPORTED',latitude:0.01,longitude:0.0003,source:'OSM'},
  {id:'b',type:'SPEED',state:'VERIFIED',latitude:0.015,longitude:0,source:'Local document'},
  {id:'c',type:'RED_LIGHT',state:'COMMUNITY_MAPPED',latitude:0.005,longitude:0,source:'Local map'},
  {id:'x',type:'ALPR',state:'REPORTED',latitude:0.01,longitude:0.04,source:'Unrelated road'},
  {id:'gone',type:'ALPR',state:'REMOVED',latitude:0.01,longitude:0,source:'Retired'}
]};
const prepared=camera.candidates(route,report,guide);
assert.equal(prepared.ready,true);
assert.equal(prepared.sites.length,3,'exclude removed and off-road camera reports');
assert.deepEqual(prepared.sites.map(s=>s.type),['RED_LIGHT','ALPR','SPEED']);
const settings=camera.preferences(null);
assert.equal(settings.enabled,true,'visual warning enabled during real GPS navigation');
assert.equal(settings.voice,false,'voice must require explicit opt-in');
assert.equal(settings.miles,0.5);
assert.equal(camera.preferences({miles:10,voice:'yes',types:{ALPR:false}}).miles,0.5);
assert.equal(camera.preferences({miles:10,voice:'yes',types:{ALPR:false}}).types.ALPR,false);
const known=new Set();
const fix={along_m:350,accuracy_m:12,age_ms:1300,offroute:false,moving:true,headingAligned:true};
const first=camera.approach(prepared,settings,fix,known);
assert(first,'a forward report on the planned road should be announced');
assert.equal(first.site.type,'RED_LIGHT');
assert(first.newAlert);
known.add(first.site.key);
assert.equal(camera.approach(prepared,settings,fix,known).newAlert,false,'no repeated announcement at same point');
assert.equal(camera.approach(prepared,settings,{...fix,age_ms:7000},known),null,'stale GPS is not live evidence');
assert.equal(camera.approach(prepared,settings,{...fix,accuracy_m:75},known),null,'approximate GPS cannot trigger');
assert.equal(camera.approach(prepared,settings,{...fix,moving:false},known),null,'stationary desktop location is not an approach');
assert.equal(camera.approach(prepared,settings,{...fix,headingAligned:false},known),null,'wrong-way movement cannot trigger');
assert.equal(camera.approach(prepared,settings,{...fix,offroute:true},known),null,'another road is not the selected route');
assert.equal(camera.approach(prepared,settings,{...fix,along_m:2100},known),null,'passed cameras are not ahead');
assert.equal(camera.approach(prepared,{...settings,enabled:false},fix,known),null,'master switch mutes visual');
const alprOnly=camera.approach(prepared,{...settings,types:{ALPR:true,SPEED:false,RED_LIGHT:false}},fix,known);
assert.equal(alprOnly.site.type,'ALPR','individual camera switches filter without altering routes');
assert.equal(camera.approach(prepared,{...settings,miles:0.25,types:{ALPR:true,SPEED:false,RED_LIGHT:false}},fix,known),null,
  'quarter-mile range excludes farther ALPR when other types off');
const wrongRoute=camera.candidates({type:'DIRECT_LINE',coordinates:route.coordinates},report,guide);
assert.equal(wrongRoute.ready,false,'never alert using a direct-line map preview');
assert.equal(camera.distanceLabel(805),'0.5 mi');
assert.match(camera.typeLabel('RED_LIGHT'),/red-light/);
const html=fs.readFileSync('openrf/static/index.html','utf8');
const app=fs.readFileSync('openrf/static/app.js','utf8');
assert(html.indexOf('/static/route_guidance.js?') < html.indexOf('/static/camera_alerts.js?') &&
  html.indexOf('/static/camera_alerts.js?') < html.indexOf('/static/app.js?'), 'pure alert logic loads before app');
for(const id of ['camera-alert-enable','camera-alert-voice','camera-alert-distance','camera-approach-settings'])
  assert(html.includes(`id="${id}"`),`missing camera approach setting: ${id}`);
assert.match(app,/if\(!cameraApproach \|\| state\.navDemoActive \|\| state\.navFollowId===null\)/,
  'camera alerts explicitly disabled for DEMO and inactive GPS follow');
assert.match(app,/Date\.now\(\)-state\.navCameraAlertLastQualifiedAt>7000/,
  'old alert banners expire even if the GPS watch stops calling back');
console.log('PASS v0.2.74 forward camera-report alerts, category/distance preferences and strict GPS/route gates');
