'use strict';
// Regression: the right-rail Map settings survives while the bottom-right
// gear hosts Offline navigation readiness; the map can select either endpoint.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const source=fs.readFileSync('openrf/static/app.js','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
const count=(term)=>(html.split(term).length-1);
function part(a,b){const i=source.indexOf(a),j=source.indexOf(b,i);assert(i>=0&&j>i,a);return source.slice(i,j);}

assert(html.includes('data-map-tool="settings"'),'Right rail retains Map settings');
assert(html.includes('id="map-gear-readiness-slot"'),'Gear has readiness mount point');
assert.equal(count('id="map-offline-readiness"'),1,'One live readiness panel, no copy');
assert.equal(count('id="map-offline-check"'),1,'One manually-triggered readiness button');
assert(source.includes("$('map-gear-readiness-slot').append(readinessPanel);"),'Readiness moves into gear');
assert(source.includes("mapToolNodes.settings[0].append($('map-location-status'))"),'Right-rail settings remains intact');
assert(css.includes('#page-map .map-settings-popup #map-offline-readiness'),'Readiness scrolls inside popup');
assert(html.includes('id="nav-start-query"')&&html.includes('id="nav-pick-start-map"'),
  'Custom origin supports typed addresses and map selection');

const scripts=[
  part('function resetRouteForNewDestination() {','function syncMapPickedAction()'),
  part('function syncDestinationPickMode() {','// Tap once to drop a destination'),
  part('function beginOriginMapPick({returnToSearch=false}={}){',"$('nav-pick-start-map').addEventListener('click',beginOriginMapPick);"),
  part('async function freshNavigationOrigin() {','async function quickDestinationPreview('),
].join('\n');
const elements=new Map(), keyHandlers={};
const outer={handlers:{},classList:{toggle(){}},addEventListener(type,fn){(this.handlers[type]??=[]).push(fn)}};
function $(id){
  if(!elements.has(id))elements.set(id,{parentElement:id==='map'?outer:null,hidden:false,disabled:false,value:'',textContent:'',classList:{toggle(){}},
    setAttribute(){},replaceChildren(){},getBoundingClientRect(){return {left:10,top:20,width:500,height:350}}});
  return elements.get(id);
}
let panEnabled=true;
const map={dragPan:{isEnabled(){return panEnabled},disable(){panEnabled=false},enable(){panEnabled=true}},
  unproject([x,y]){return{lng:-121-x/1000,lat:38+y/1000}}};
const state={map,mapReady:true,navPicking:false,navPickKind:'destination',navPickedPoint:[-121.20,38.25],navPickedOrigin:null,
  navPickPanRestore:null,navPickPointerStart:null,navPickSwallowClickUntil:0,navOriginManual:false,
  navAvoidPicking:false,navAvoidSaved:[],navAvoidSession:[],navPreview:{type:'ROAD_ROUTE'},
  navRouteChoices:{standard:{},alternative:{}},navCameraComparison:{},navFollowId:null};
const status=[];
const quickSearchReturns=[];
const context={state,$,window:{addEventListener(k,fn){keyHandlers[k]=fn}},Math,Date,navigator:{},
 stopNavigationFollow(){},renderDirectionsReview(){},renderNavigationOverlay(){},renderRoadAvoidList(){},syncMapPickedAction(){},
 cameraPanelVisibility(){},showPage(){},setMapSearchCollapsed(open){quickSearchReturns.push(['search',open])},
 setMapOriginEditor(open){quickSearchReturns.push(['editor',open])},setNavigationStatus(s){status.push(s)},setMapDestinationStatus(s){status.push(s)},cancelAreaChoosing(){},
 closeMapToolOverlay(){},get activeMapTool(){return null},worldPixel(){return [0,0]},pixelWorld(){return [0,0]},
 locationForQuickPreview(){return [-120.65,38.40]},navigationInputPoint(){return [-122,37]},
 async resolveTypedPlace(query){
   const parts=query.split(',').map(Number);
   if(parts.length===2&&parts.every(Number.isFinite))return {coordinates:[parts[1],parts[0]]};
   if(query==='Jackson, CA')return {coordinates:[-120.77,38.35]};
   throw Error('Could not resolve address');
 }};
vm.createContext(context);
vm.runInContext(scripts+'\nthis.beginOriginMapPick=beginOriginMapPick;this.freshNavigationOrigin=freshNavigationOrigin;',context);
function dispatch(type,x,y){
 const event={button:0,isPrimary:true,pointerId:1,clientX:x,clientY:y,target:{closest:()=>null},
   preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true}};
 for(const fn of outer.handlers[type]||[])fn(event);
 return event;
}

(async()=>{
  context.beginOriginMapPick();
  assert.equal(state.navPicking,true);
  assert.equal(state.navPickKind,'origin');
  assert.equal(panEnabled,false,'Selecting a point disables pan only while armed');
  dispatch('pointerdown',110,150);
  dispatch('pointerup',110,150);
  assert.equal(state.navPicking,false);
  assert.equal(panEnabled,true,'Pan restored after one tap');
  assert.equal(state.navPickedPoint[0],-121.20,'Existing destination remains unchanged');
  assert.equal(state.navPreview,null,'Previously calculated road route is invalidated');
  assert.equal(state.navRouteChoices,null,'Stale alternative routes are invalidated');
  assert.equal(state.navOriginManual,true);
  assert.equal(state.navPickedOrigin[0],-121.1);
  assert.equal(state.navPickedOrigin[1],38.13);
  assert.equal($('nav-start-lat').value,'38.1300000');
  assert.equal($('nav-start-lon').value,'-121.1000000');
  assert.equal($('nav-start-query').value,'38.1300000, -121.1000000');
  const pickedOrigin=await context.freshNavigationOrigin();
  assert.equal(pickedOrigin[0],-121.1);
  assert.equal(pickedOrigin[1],38.13);
  $('nav-start-query').value='Jackson, CA';
  assert.equal((await context.freshNavigationOrigin())[0],-120.77,
    'Quick directions must resolve typed custom starting addresses');
  state.navOriginManual=false;
  assert.equal((await context.freshNavigationOrigin())[0],-120.65,
    'Without a custom origin, browser location remains the default');
  context.beginOriginMapPick({returnToSearch:true});
  dispatch('pointerdown',110,150);dispatch('pointerup',110,150);
  assert.equal(state.navPickedPoint[0],-121.20,'Quick From picker keeps the same destination');
  assert.equal(state.navOriginPickReturnToSearch,false,'Quick map-pick return state is cleared');
  assert(quickSearchReturns.some(([kind,value])=>kind==='search'&&value===false),
    'Choosing a start in the main flow reopens the destination search');
  assert(quickSearchReturns.some(([kind,value])=>kind==='editor'&&value===false),
    'The selected From value remains visible without covering the map');
  context.beginOriginMapPick();
  keyHandlers.keydown({key:'Escape',preventDefault(){}});
  assert.equal(state.navPicking,false);
  assert.equal(panEnabled,true,'Escape restores panning');
  assert(status.some(s=>s.includes('Starting point selected')));
  console.log('PASS v0.2.114 retained Map settings, moved readiness, custom origin by map/address, destination preservation');
})().catch(error=>{console.error(error);process.exitCode=1});
