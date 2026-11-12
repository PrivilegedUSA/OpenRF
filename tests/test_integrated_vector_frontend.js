'use strict';
// v0.2.31: map integration does not create duplicate survey UI and pin dragging
// updates the selected map coordinate without recording any observation.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'openrf/static/app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'openrf/static/index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'openrf/static/app.css'),'utf8');
assert.match(source,/style: 'dark'/);
assert.match(source,/api\/vector\/styles\/\$\{state.style/);
assert.match(source,/mapVectorOffline/);
assert(html.includes('id="map-vector-source"') && html.includes('id="map-vector-status"'));
assert(html.includes('id="show-demo-map"') && html.includes('id="nav-dest-query"') && html.includes('id="offline-basemap-settings"'));
assert(!html.includes('legacy-data-preview.html'), 'the old map prototype must not replace OpenRF navigation/observations');
assert(css.includes('.nav-draggable-pin') && css.includes('touch-action:none'));
assert(source.includes('streetCompletion') && source.includes('/api/vector/streets?q='), 'real offline road-name completions');
assert(source.includes('house number is NOT verified') || source.includes('House numbers are not verified'), 'never claim numeric address match');

const start=source.indexOf('function destinationWorldPoint(clientX,clientY) {');
const end=source.indexOf('\nfunction renderNavigationOverlay()', start);
assert(start>0 && end>start);
const ids=['map','navigation-preview-overlay','map-destination-query','nav-dest-query','nav-dest-lat','nav-dest-lon','map-begin-guidance'];
function fixture(mapKind){
 const listeners={};const elements={};
 for(const id of ids){elements[id]={value:'', listeners:{},addEventListener(type,fn,capture){this.listeners[type]=fn;}, setPointerCapture(id){this.capture=id;},hasPointerCapture(id){return this.capture===id;},releasePointerCapture(id){this.capture=null;}};}
 elements.map.getBoundingClientRect=()=>({left:100,top:200,width:320,height:200});
 const st={navFollowId:null,mapReady:mapKind==='vector',map:mapKind==='vector'?{unproject([x,y]){return{lng:x/10-121,lat:38+y/10};}}:null,
   rasterMap:mapKind==='raster'?{center:[-120.6,38.45],zoom:10}:null,
   navPickedPoint:[-120.6,38.45],navPreview:null,navFitPending:false,navSelectedAddress:{name:'Old'},navPinDragging:false,navPinJustDraggedAt:0};
 const records={status:[],render:0,hide:0,observations:0};
 const obj=Function('state','$','worldPixel','pixelWorld','hideMapAddressMatches','renderNavigationOverlay','setMapDestinationStatus','stopNavigationFollow',
  `${source.slice(start,end)}\nreturn {destinationWorldPoint,updateDraggedDestination};`)(st,id=>elements[id],
  (lon,lat,z)=>[lon*10,lat*10],(x,y,z)=>[x/10,y/10],()=>records.hide++,()=>records.render++,m=>records.status.push(m),()=>{});
 return {elements,st,records,obj};
}
const f=fixture('vector');
const overlay=f.elements['navigation-preview-overlay'];
const target={closest(selector){return selector==='.nav-draggable-pin'?{className:'nav-draggable-pin'}:null;}};
const event={pointerId:42,pointerType:'touch',button:0,target,clientX:260,clientY:290,
  preventDefault(){},stopPropagation(){},stopImmediatePropagation(){}};
overlay.listeners.pointerdown(event);
assert.equal(f.st.navPinDragging,true);
overlay.listeners.pointermove(event);
assert.deepEqual(f.st.navPickedPoint,[-105,47]);
assert.equal(f.elements['map-destination-query'].value,'47.0000000, -105.0000000');
assert.equal(f.st.navSelectedAddress,null);
assert.equal(f.st.navPreview,null);
assert.equal(f.records.render,1);
overlay.listeners.pointerup(event);
assert.equal(f.st.navPinDragging,false);
assert(f.records.status.some(x=>x.includes('pin adjusted')));
assert.equal(f.records.observations,0,'destination drag never records a survey');
assert.equal(f.elements.map.listeners.click!=null,true,'only suppress accidental map click just after drag');
assert.equal(f.obj.destinationWorldPoint(99,290),null,'out-of-bounds drag cannot change position');
const r=fixture('raster');const point=r.obj.destinationWorldPoint(260,290);
assert.deepEqual(point,[-120.6,37.45],'raster conversion uses tapped coordinates, not GPS location');
console.log('v0.2.31 approved MapLibre styles, native overlay preservation, regional street hints and drag-to-reposition pin passed.');
