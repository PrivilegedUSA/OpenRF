'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const health=require('../openrf/static/navigation_health.js');
const app=fs.readFileSync('openrf/static/app.js','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');

// Fake a MapLibre canvas and layer events to verify clickable-only cursor
// handling and that destination/area selection retain their crosshair.
const hoverStart=app.indexOf('function installMapFeatureHoverCursors(');
const hoverEnd=app.indexOf('function startMap()',hoverStart);
assert(hoverStart>=0&&hoverEnd>hoverStart);
const hoverState={navPicking:false,areaChoosing:false,navAvoidPicking:false};
const handlers={},canvasHandlers={},canvas={style:{cursor:''},addEventListener(type,fn){canvasHandlers[type]=fn;}};
const map={getCanvas(){return canvas;},on(type,layer,fn){
  if(typeof layer==='function')handlers[type]=layer;
  else handlers[`${type}:${layer}`]=fn;
}};
const installHover=Function('state',app.slice(hoverStart,hoverEnd)+';return installMapFeatureHoverCursors;')(hoverState);
installHover(map);
for(const layer of ['camera-catalog-points','survey-series-points','survey-points','survey-sdr-sites','survey-waypoints']){
  assert.equal(typeof handlers[`mouseenter:${layer}`],'function',`${layer} should have a hover handler`);
  assert.equal(typeof handlers[`mouseleave:${layer}`],'function',`${layer} should restore the map cursor`);
}
handlers['mouseenter:camera-catalog-points']();assert.equal(canvas.style.cursor,'pointer');
handlers['mouseenter:survey-points']();handlers['mouseleave:camera-catalog-points']();
assert.equal(canvas.style.cursor,'pointer','overlapping clickable layers should keep the hand');
hoverState.navPicking=true;map.__openrfRefreshClickableCursor();assert.equal(canvas.style.cursor,'');
hoverState.navPicking=false;hoverState.areaChoosing=true;map.__openrfRefreshClickableCursor();assert.equal(canvas.style.cursor,'');
hoverState.areaChoosing=false;hoverState.navAvoidPicking=true;map.__openrfRefreshClickableCursor();assert.equal(canvas.style.cursor,'');
hoverState.navAvoidPicking=false;handlers['mouseenter:survey-waypoints']();assert.equal(canvas.style.cursor,'pointer');
canvasHandlers.mouseleave();assert.equal(canvas.style.cursor,'');
handlers['mouseenter:camera-catalog-points']();handlers['style.load']();assert.equal(canvas.style.cursor,'');
assert(css.includes('#map.area-selecting .maplibregl-canvas{cursor:crosshair!important}'));
assert(css.includes('.raster-camera-pin')&&css.includes('cursor:pointer'));

// A frozen geolocation callback can no longer prolong live guidance forever.
assert.equal(health.status(1000,0,15999),'waiting');
assert.equal(health.status(1000,0,16000),'lost');
assert.equal(health.status(1000,3000,17999),'fresh');
assert.equal(health.status(1000,3000,18000),'lost');
assert.equal(health.status(1000,17000,18000),'fresh','only a newer fix timestamp restores freshness');
assert.equal(health.status(0,0,100000),'inactive');

const navStart=app.indexOf('function setNavigationSignalState(');
const navEnd=app.indexOf('// A loopback-only, read-only gpsd request.',navStart);
assert(navStart>=0&&navEnd>navStart);
const now=Date.now();let silenced=0,clearedLanes=0,hiddenAlerts=0;
const elements={};
for(const id of ['map-follow-signal','map-follow-instruction','map-follow-distance',
  'map-follow-quality','map-follow-planned','map-follow-camera-note']){
  elements[id]={textContent:'',hidden:false,dataset:{}};
}
elements['map-follow-hud']={classList:{remove(){},toggle(){}}};
const navState={navFollowId:4,navDemoActive:false,navFollowStartedAt:now-40000,
  navFollowLastValidAt:now-30000,navFollowSignalState:'precise',navFollowPriorFix:{accuracy:9},
  navOffrouteCount:4,navOffrouteSince:now-20000,navPreview:{type:'ROAD_ROUTE',is_driving_route:true,
   maneuvers:[],coordinates:[[-120.6,38.4],[-120.599,38.4]]},navGnssLast:0,navFollowProgress:0,
  navFollowLast:0,rasterMap:null,map:null};
const fakeGuide={routeSteps(){return [{instruction:'Turn onto Main Street'}]},routeVisualHeading(){return null;}};
const nav=Function('state','$','OpenRFNavigationHealth','routeGuide','renderNavigationLanes',
  'navigationSilence','hideCameraApproachAlert','updateBrowserLocationMarker',
  app.slice(navStart,navEnd)+';return {enforceNavigationSignalFreshness,followPosition};')(
    navState,id=>elements[id],health,fakeGuide,()=>clearedLanes++,()=>silenced++,()=>hiddenAlerts++,()=>{});
nav.enforceNavigationSignalFreshness(now);
assert.equal(navState.navFollowSignalState,'lost');
assert.match(elements['map-follow-instruction'].textContent,/GPS signal lost/);
assert.match(elements['map-follow-distance'].textContent,/Planned directions/);
assert.equal(elements['map-follow-planned'].hidden,false);
assert.equal(navState.navOffrouteCount,0);
assert.equal(navState.navFollowPriorFix,null);
assert.equal(clearedLanes,1);assert.equal(silenced,1);assert.equal(hiddenAlerts,1);
nav.enforceNavigationSignalFreshness(now+1000);
assert.equal(silenced,1,'watchdog should not repeatedly interrupt after first timeout');
nav.followPosition({timestamp:now,coords:{latitude:38.4,longitude:-120.6,accuracy:300}});
assert.equal(navState.navFollowSignalState,'approximate');
assert.match(elements['map-follow-signal'].textContent,/recovered/);
assert.match(elements['map-follow-distance'].textContent,/LIVE turn timing paused/);
assert.equal(navState.navFollowLastValidAt,now);
nav.enforceNavigationSignalFreshness(now+16000);
assert.equal(navState.navFollowSignalState,'lost');
navState.navDemoActive=true;nav.enforceNavigationSignalFreshness(now+32000);
assert.equal(silenced,3,'DEMO watchdog must not treat simulation as lost live GPS');
console.log('PASS v0.2.75 clickable map cursors and no-fix GPS pause/recovery');
