'use strict';
// Realistic route chooser -> open search -> choose destination -> tap the map.
// The old chooser must never require a manual X, even on later cycles.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('openrf/static/app.js','utf8');
function part(a,b){
  const i=source.indexOf(a),j=source.indexOf(b,i);
  assert(i>=0&&j>i,`Missing source section: ${a}`);
  return source.slice(i,j);
}
const pieces=[
  part('function setMapSearchCollapsed(collapsed, restoreFocus = false) {','mapSearchToggle.addEventListener'),
  part('function resetRouteForNewDestination() {','function syncMapPickedAction()'),
  part('function positionRouteChoicePanel(){','function chooseRouteChoice(key){'),
  part('function syncDestinationPickMode() {','// Tap once to drop a destination'),
  part('function beginDestinationMapPick() {',"$('nav-pick-map').addEventListener")
].join('\n');
const elements=new Map();
const classes=new Set();
const outer={handlers:{},classList:{toggle(name,value){if(value)classes.add(name);else classes.delete(name);}},
  addEventListener(kind,fn,capture){(this.handlers[kind]??=[]).push({fn,capture});}};
function element(id){
  if(!elements.has(id))elements.set(id,{
    id,hidden:false,open:false,disabled:false,innerHTML:'',value:'',textContent:'',style:{},attrs:{},
    classList:{toggle(){},contains(){return false}},
    setAttribute(name,value){this.attrs[name]=value;},focus(){},replaceChildren(){},
    getBoundingClientRect(){return {left:10,top:20,bottom:70,width:500,height:350};},
    get offsetParent(){return {getBoundingClientRect(){return {top:0,bottom:480};}};},
    parentElement:id==='map'?outer:null
  });
  return elements.get(id);
}
function $(id){return element(id);}
let panEnabled=true;
const map={dragPan:{isEnabled(){return panEnabled;},disable(){panEnabled=false;},enable(){panEnabled=true;}},
  unproject([x,y]){return{lng:-121-x/1000,lat:38+y/1000};}};
const state={map,mapReady:true,navPicking:false,navPickedPoint:null,navPickPanRestore:null,
  navPickPointerStart:null,navPickSwallowClickUntil:0,navAvoidPicking:false,navAvoidSession:[],
  navCameraRouteEpoch:0,navDestinationEpoch:0,navSearchToken:0,navPreview:null,
  navRouteChoices:null,navCameraComparison:null,navFollowId:null,navChoicePanelClosed:false};
const mapSearchForm=$('map-destination-form'),mapSearchPanel=$('map-destination-panel'),mapSearchToggle=$('map-search-toggle');
mapSearchForm.hidden=true;
const keyHandlers={};
const context={state,$,mapSearchForm,mapSearchPanel,mapSearchToggle,Math,Date,window:{addEventListener(k,fn){keyHandlers[k]=fn;}},
  requestAnimationFrame(cb){cb();},updateNavOverlayLayout(){},navAddressTimer:null,
  stopNavigationFollow(){},renderDirectionsReview(){},renderNavigationOverlay(){},renderRoadAvoidList(){},syncMapPickedAction(){},
  cameraPanelVisibility(){},showPage(){},setNavigationStatus(){},setMapDestinationStatus(){},cancelAreaChoosing(){},
  hideMapAddressMatches(){},get activeMapTool(){return null;},worldPixel(){return [0,0];},pixelWorld(){return [0,0];}};
vm.createContext(context);
vm.runInContext(pieces+'\nthis.openSearch=setMapSearchCollapsed;this.renderChoices=renderRouteChoices;this.beginPick=beginDestinationMapPick;',context);
const route={type:'ROAD_ROUTE',is_driving_route:true,distance_miles:10,duration_seconds:1200};
const chooser=$('map-route-choices');
function showRouteCard(){
  state.navPreview=route;
  state.navRouteChoices={standard:route,standard_cameras:{count:1},alternative:{...route,distance_miles:11},alternative_cameras:{count:0}};
  state.navChoicePanelClosed=false;
  context.renderChoices();
  assert.equal(chooser.hidden,false,'previous route chooser should be visible');
}
function tapMap(x,y){
  function fire(kind){
    const event={button:0,isPrimary:true,pointerId:1,clientX:x,clientY:y,
      target:{closest:()=>null},preventDefault(){},stopImmediatePropagation(){}};
    for(const item of outer.handlers[kind]||[])item.fn(event);
  }
  fire('pointerdown');fire('pointerup');fire('click');
}
// Search may be opened and closed without choosing a new destination: retain the plan.
showRouteCard();
context.openSearch(false);
assert.equal(chooser.hidden,true,'opening search must physically hide route chooser');
assert(state.navRouteChoices,'opening search alone keeps original route');
context.openSearch(true);
assert.equal(chooser.hidden,false,'closing search without a new pick restores route review');
// No alternate is a routine response (no reports, unsupported coverage). It
// must render without throwing, or the search/pick transition can get stuck.
state.navRouteChoices={standard:route,standard_cameras:{count:0},alternative:null,detail:'Only one route available.'};
context.renderChoices();
assert.equal($('route-choice-alternate').hidden,true);
for(let cycle=0;cycle<4;cycle++){
  if(cycle)showRouteCard();
  context.openSearch(false);
  assert.equal(chooser.hidden,true,'route chooser must hide on search open');
  context.beginPick();
  assert.equal(mapSearchForm.hidden,true,'map picking collapses search');
  assert.equal(chooser.hidden,true,'map picking must close route chooser without manual X');
  assert.equal(state.navRouteChoices,null,'old route cards cleared before map tap');
  assert.equal(state.navPreview,null,'old route geometry cleared before map tap');
  assert.equal(state.navPicking,true);
  assert.equal(panEnabled,false,'pan disabled while waiting for pick');
  // A stale asynchronous renderer must not resurrect an old route card.
  if(cycle===2){
    state.navRouteChoices={standard:route};
    context.renderChoices();
    assert.equal(chooser.hidden,true,'route chooser cannot reappear during map picking');
    state.navRouteChoices=null;
  }
  tapMap(90+cycle*20,140+cycle*10);
  assert.equal(state.navPicking,false,'map tap accepted without touching route-choice X');
  assert.equal(panEnabled,true,'panning restored after selection');
  assert(state.navPickedPoint,'new destination selected');
  assert.equal(chooser.hidden,true,'old route chooser stays dismissed');
}
console.log('PASS v0.2.71 route chooser -> open search -> new map destination, 4 cycles without manual close');
