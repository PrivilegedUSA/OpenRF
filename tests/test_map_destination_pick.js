'use strict';
// v0.2.30: tap anywhere on a map, including over the GPS marker, must select
// the tapped coordinate. Neither a drag workflow nor a survey observation.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../openrf/static/app.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../openrf/static/app.css'),'utf8');
const start=source.indexOf('function syncDestinationPickMode() {');
const end=source.indexOf('\n// Tap once to drop a destination',start);
const begin=source.indexOf('function beginDestinationMapPick() {');
const beginEnd=source.indexOf("$('nav-pick-map').addEventListener",begin);
assert(start>0&&end>start&&begin>0&&beginEnd>begin,'map picking functions are present');
assert(css.includes('#map.destination-picking,#map.destination-picking:active'), 'map-specific crosshair mode');
assert.match(css,/cursor:crosshair!important/);
assert.match(source,/DESTINATION PLACED · DRAG PIN TO ADJUST/);
const ids=['map','map-begin-guidance','nav-pick-map','map-pick-destination','nav-dest-lat','nav-dest-lon','map-destination-query','nav-dest-query'];
function makeHarness(type) {
  const elements=Object.fromEntries(ids.map(id=>[id,{
    value:'',attrs:{},listeners:{},
    setAttribute(key,value){this.attrs[key]=String(value);},
    addEventListener(name,fn,capture){this.listeners[name]={fn,capture};}
  }]));
  const states={};
  elements.map.classList={toggle(className,active){states[className]=active;}};
  elements.map.getBoundingClientRect=()=>({left:100,top:200,width:200,height:100});
  const keys={};
  const win={addEventListener(name,fn){keys[name]=fn;}};
  const calls={fit:0,render:0,status:[],pages:[],cancelArea:0,disable:0,enable:0};
  let enabled=true;
  const map={
    dragPan:{isEnabled(){return enabled;},disable(){enabled=false;calls.disable++;},enable(){enabled=true;calls.enable++;}},
    unproject([x,y]){assert.equal(x,120);assert.equal(y,50);return{lng:-121.2345,lat:39.12345};}
  };
  const state={navPicking:false,navPickedPoint:null,navPreview:null,navFitPending:false,
    navSelectedAddress:{name:'Stale'},navPickPanRestore:null,
    areaChoosing:false, map:type==='vector'?map:null,mapReady:type==='vector',
    rasterMap:type==='raster'?{center:[-120,38],zoom:9}:null,
    browserLocation:{lat:38.48,lon:-120.62}};
  const deps=[state,id=>{assert(elements[id],`missing element: ${id}`);return elements[id];},win,
    (lon,lat,z)=>[lon*10,lat*10],(x,y,z)=>[x/10,y/10],
    ()=>{calls.render++;},msg=>calls.status.push(msg),msg=>calls.status.push(msg),
    (...args)=>calls.pages.push(args),()=>calls.cancelArea++,()=>{}];
  const runner=Function('state','$','window','worldPixel','pixelWorld','renderNavigationOverlay',
    'setNavigationStatus','setMapDestinationStatus','showPage','cancelAreaChoosing','stopNavigationFollow',
    `${source.slice(start,end)}\n${source.slice(begin,beginEnd)}\nreturn {beginDestinationMapPick,consumeNavigationPick,handleDestinationMapClick};`);
  const actions=runner(...deps);
  const tap=(target={closest:()=>null})=>{
    const ev={clientX:220,clientY:250,button:0,target,prevented:0,stopped:0,
      preventDefault(){this.prevented++;},stopImmediatePropagation(){this.stopped++;}};
    elements.map.listeners.click.fn(ev);
    return ev;
  };
  return{elements,state,map,calls,states,keys,actions,tap,isEnabled:()=>enabled};
}
// MapLibre must visually switch from grab to crosshair; a tapped GPS pin is
// resolved via unproject(pixel), never from state.browserLocation.
const v=makeHarness('vector');
assert.equal(v.elements.map.listeners.click.capture,true,'intercept click in DOM capture phase, above pin handlers');
v.actions.beginDestinationMapPick();
assert.equal(v.states['destination-picking'],true);
assert.equal(v.elements['map-pick-destination'].attrs['aria-pressed'],'true');
assert.equal(v.isEnabled(),false,'pan disabled during one-tap selection');
const click=v.tap({closest:()=>null,className:'browser-location-marker'});
assert.equal(click.prevented,1);assert.equal(click.stopped,1);
assert.equal(v.state.navPicking,false);assert.equal(v.states['destination-picking'],false);
assert.equal(v.isEnabled(),true,'normal panning restored after tap');
assert.deepEqual(v.state.navPickedPoint,[-121.2345,39.12345]);
assert.equal(v.elements['map-destination-query'].value,'39.1234500, -121.2345000');
assert.notEqual(v.state.navPickedPoint[0],v.state.browserLocation.lon);
assert.equal(v.calls.pages.length,1);
assert(v.calls.status.some(s=>s.includes('Destination placed')));
// Native controls must not trigger destination selection.
v.actions.beginDestinationMapPick();
const controls=v.tap({closest:()=>({className:'maplibregl-ctrl'})});
assert.equal(controls.prevented,0);assert.equal(v.state.navPicking,true);
// Escape and a second press both cancel without changing the destination.
v.keys.keydown({key:'Escape',preventDefault(){}});
assert.equal(v.state.navPicking,false);assert.equal(v.isEnabled(),true);
const previous=v.elements['map-destination-query'].value;
v.actions.beginDestinationMapPick();v.actions.beginDestinationMapPick();
assert.equal(v.state.navPicking,false);assert.equal(v.elements['map-destination-query'].value,previous);
// The independent raster/MBTiles map also uses the actual pixel tap, not its
// center; this works even without vector tiles or a saved browser fix.
const r=makeHarness('raster');r.actions.beginDestinationMapPick();
const rasterTap=r.tap({closest:()=>null,className:'raster-pin'});
assert.equal(rasterTap.prevented,1);
assert.deepEqual(r.state.navPickedPoint,[-118,38]);
assert.equal(r.elements['map-destination-query'].value,'38.0000000, -118.0000000');
assert.equal(r.state.navPicking,false);
assert(!source.slice(start,end).includes('openObservation('),'destination map pick must never create survey observations');
console.log('v0.2.30 tap-to-pick vector/raster map, blue GPS marker, crosshair mode, controls, cancellation, panning restoration and exact tap coordinates passed.');
