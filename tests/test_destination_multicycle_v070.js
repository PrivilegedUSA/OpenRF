'use strict';
// Four complete map-pick / Get-directions-state cycles, including a third
// destination over a former route overlay and a drag (not a tap).
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('openrf/static/app.js','utf8');
function part(a,b){const i=source.indexOf(a),j=source.indexOf(b,i);assert(i>=0&&j>i,a);return source.slice(i,j);}
const scripts=[part('function resetRouteForNewDestination() {','function syncMapPickedAction()'),part('function syncDestinationPickMode() {','// Tap once to drop a destination'),part('function beginDestinationMapPick() {',"$('nav-pick-map').addEventListener")].join('\n');
const elements=new Map();
const outer={handlers:{},classList:{toggle(){}},addEventListener(type,fn,capture){(this.handlers[type]??=[]).push({fn,capture});}};
function $(id){
  if(!elements.has(id))elements.set(id,{parentElement:id==='map'?outer:null,hidden:false,disabled:false,value:'',textContent:'',classList:{toggle(){}},
    setAttribute(){},replaceChildren(){},getBoundingClientRect(){return {left:10,top:20,width:500,height:350}}});
  return elements.get(id);
}
let enabled=true;
const map={dragPan:{isEnabled(){return enabled},disable(){enabled=false},enable(){enabled=true}},
  unproject([x,y]){return{lng:-121-x/1000,lat:38+y/1000}}};
const state={map,mapReady:true,navPicking:false,navPickedPoint:null,navPickPanRestore:null,navPickPointerStart:null,navPickSwallowClickUntil:0,
  navAvoidPicking:false,navAvoidSaved:[],navAvoidSession:[],navPreview:null,navRouteChoices:null,navCameraComparison:null,navFollowId:null};
const keyHandlers={};
const context={state,$,window:{addEventListener(k,fn){keyHandlers[k]=fn}},Math,Date,
 stopNavigationFollow(){},renderDirectionsReview(){},renderNavigationOverlay(){},renderRoadAvoidList(){},syncMapPickedAction(){},
 cameraPanelVisibility(){},showPage(){},setMapSearchCollapsed(){},setNavigationStatus(){},setMapDestinationStatus(){},cancelAreaChoosing(){},
 hideMapAddressMatches(){},navAddressTimer:null,
 get activeMapTool(){return null},worldPixel(){return [0,0]},pixelWorld(){return [0,0]}};
vm.createContext(context);
vm.runInContext(scripts+'\nthis.beginPick=beginDestinationMapPick;',context);
function dispatch(type,x,y,props={}){
 const e={button:0,isPrimary:true,pointerId:1,clientX:x,clientY:y,target:{closest:()=>null},preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true},...props};
 for(const h of outer.handlers[type]||[])h.fn(e);
 return e;
}
function select(x,y){
  dispatch('pointerdown',x,y);
  dispatch('pointerup',x,y);
  const click=dispatch('click',x,y);
  assert.equal(state.navPicking,false,'pointerup must select the destination');
  assert.equal(enabled,true,'panning restored after selection');
  assert(state.navPickedPoint);
  assert.equal(click.stopped,true,'synthetic click must not leak to observations or map actions');
}
for(let cycle=0;cycle<4;cycle++){
 if(cycle){ // As if Get directions returned a completed road route with two choices.
   state.navPreview={type:'ROAD_ROUTE',is_driving_route:true};
   state.navRouteChoices={standard:{},alternative:{}};
   state.navCameraComparison={};
 }
 context.beginPick();
 assert.equal(state.navPicking,true,`cycle ${cycle+1} must arm destination picking`);
 assert.equal(enabled,false,`cycle ${cycle+1} pan disabled`);
 if(cycle===2){context.beginPick();assert.equal(state.navPicking,true,'repeating Choose destination must not silently cancel it');}
 if(cycle===3){
   dispatch('pointerdown',80,90);
   dispatch('pointerup',120,135); // A drag must not be mistaken for a tap.
   dispatch('click',120,135);
   assert.equal(state.navPicking,true,'drag must leave picking active');
 }
 select(110+cycle*25,140+cycle*15);
 assert.equal(state.navPreview,null,'previous route must be invalidated');
 assert.equal(state.navRouteChoices,null,'previous route cards must be invalidated');
}
context.beginPick();
// An interactive toolbar button must never become a map destination.
const tool={closest:()=>({tagName:'BUTTON'})};
dispatch('pointerdown',180,160,{target:tool});dispatch('pointerup',180,160,{target:tool});dispatch('click',180,160,{target:tool});
assert.equal(state.navPicking,true);
keyHandlers.keydown({key:'Escape',preventDefault(){}});
assert.equal(state.navPicking,false,'Escape explicitly cancels');
assert.equal(enabled,true);
console.log('PASS v0.2.71 four consecutive destination/route cycles, pointer and click handling, idempotent pick, drag guard and Escape');
