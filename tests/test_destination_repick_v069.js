'use strict';
// Regression: after an earlier route, a map-selected second destination must
// accept taps over sibling MapLibre/SVG overlays and must not conflict with
// unfinished road-exclusion point-picking.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('openrf/static/app.js', 'utf8');
function between(begin,end) {
  const start=source.indexOf(begin); const finish=source.indexOf(end,start);
  assert(start>=0 && finish>start, `source boundaries: ${begin}`);
  return source.slice(start,finish);
}
const parts=[
  between('function resetRouteForNewDestination() {','function syncMapPickedAction()'),
  between('function syncDestinationPickMode() {','// Tap once to drop a destination'),
  between('function beginDestinationMapPick() {',"$('nav-pick-map').addEventListener")
].join('\n');
const nodes=new Map();
const $=id=>{
  if(!nodes.has(id)) nodes.set(id,{
    textContent:'',value:'',hidden:false,disabled:false,attrs:{},
    setAttribute(k,v){this.attrs[k]=v},replaceChildren(){this.childrenCleared=true},
    addEventListener(k,handler,capture){this.listeners??={};this.listeners[k]={handler,capture}},
    classList:{toggle(){}},
  });
  return nodes.get(id);
};
const surface={listeners:{},classList:{toggle(){}},addEventListener(k,fn,capture){this.listeners[k]={fn,capture}}};
$('map').parentElement=surface;
$('map').getBoundingClientRect=()=>({left:100,top:200,width:450,height:400});
const actions={disable:0,enable:0,stopped:0,resets:0,statuses:[]};
let panEnabled=true;
const map={
  dragPan:{isEnabled(){return panEnabled},disable(){panEnabled=false;actions.disable++},enable(){panEnabled=true;actions.enable++}},
  unproject([x,y]){return{lng:-121-x/1000,lat:38+y/1000}}};
const state={map,mapReady:true,navPicking:false,navPickedPoint:null,navPickPanRestore:null,
  navAvoidPicking:false,navAvoidSaved:[{label:'saved road'}],navAvoidSession:[{label:'trip'}],
  navPreview:null,navRouteChoices:null,navCameraComparison:null,navFollowId:null};
const context={state,$,window:{addEventListener(){}},
  stopNavigationFollow(){actions.stopped++},renderDirectionsReview(){},renderNavigationOverlay(){},
  renderRoadAvoidList(){},syncMapPickedAction(){},cameraPanelVisibility(){},
  showPage(){},setMapSearchCollapsed(){},setNavigationStatus(msg){actions.statuses.push(msg)},
  setMapDestinationStatus(msg){actions.statuses.push(msg)},
  cancelAreaChoosing(){},get activeMapTool(){return null},
  worldPixel(){return[0,0]},pixelWorld(){return[0,0]}};
vm.createContext(context);
vm.runInContext(parts+'\nthis.pickActions={beginDestinationMapPick,handleDestinationMapClick,syncDestinationPickMode};',context);
assert.equal(surface.listeners.click.capture,true,'capture on map-wrap, not just #map canvas');
function tap(x,y,target={closest(){return null}}){
  const event={button:0,clientX:100+x,clientY:200+y,target,prevented:false,stopped:false,
    preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true}};
  surface.listeners.click.fn(event);
  return event;
}
// Initial choice, followed by a route and an unfinished avoidance-point pick.
context.pickActions.beginDestinationMapPick();
assert.equal(panEnabled,false);
assert(tap(120,80).stopped);
assert.equal(panEnabled,true);
assert.equal(state.navPickedPoint.join(','),[-121.12,38.08].join(','));
state.navPreview={type:'ROAD_ROUTE',is_driving_route:true};
state.navRouteChoices={standard:{},alternative:{}};
state.navCameraComparison={count:1};
state.navAvoidPicking=true;
const saved=state.navAvoidSaved;
context.pickActions.beginDestinationMapPick();
assert.equal(state.navPicking,true);
assert.equal(state.navAvoidPicking,false,'a pending road pick no longer steals the destination tap');
assert.equal(panEnabled,false);
assert.equal(state.navPreview,null);assert.equal(state.navRouteChoices,null);
assert.equal(state.navAvoidSaved,saved,'persistent avoidances are not cleared');
const blocked=tap(200,120,{closest(sel){return sel.includes('button') ? {tagName:'BUTTON'} : null}});
assert.equal(blocked.prevented,false,'toolbar/interactable controls are not destination pins');
assert.equal(state.navPicking,true);
// Clicking a sibling SVG path on the alternate route is accepted.
const second=tap(250,120,{closest(){return null},className:'route-hit'});
assert(second.stopped);
assert.equal(state.navPickedPoint.join(','),[-121.25,38.12].join(','));
assert.equal(state.navPicking,false);
assert.equal(panEnabled,true,'pan restored after the second selection');
assert.equal($('map-destination-query').value,'38.1200000, -121.2500000');
// A stale restoration record can no longer leave panning enabled in pick mode.
state.navPicking=true;panEnabled=true;state.navPickPanRestore={map,pan:true};
context.pickActions.syncDestinationPickMode();assert.equal(panEnabled,false);
state.navPicking=false;context.pickActions.syncDestinationPickMode();assert.equal(panEnabled,true);
assert.match(source,/if \(!isCollapsed && state\.navPicking\)/,'text search cancels incomplete map picking');
assert.match(source,/if \(state\.navPicking\)\s*\{\s*state\.navPicking=false;\s*syncDestinationPickMode\(\);\s*renderNavigationOverlay\(\);/,'road picking cancels destination picking');
console.log('PASS v0.2.70 repeated map destinations, sibling-overlay clicks, exclusive modes, panning restoration, interactive controls');
