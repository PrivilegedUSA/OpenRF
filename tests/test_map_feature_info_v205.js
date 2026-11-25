'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {mapStatus,mapNodes}=require('../openrf/static/mesh-dashboard.js');
const located={protocol:'MeshCore',infrastructure:true,position:{latitude:38,longitude:-120}},unlocated={protocol:'MeshCore',infrastructure:true};
const enabled=new Set(['MeshCore','infrastructure']);
assert.equal(mapNodes([located,unlocated],enabled).length,1);
assert.match(mapStatus([located,unlocated],[],enabled,true,null,false),/1 reported position.*1 unlocated/);
assert.match(mapStatus([unlocated],[],enabled,true,null,false),/No map pins/);
assert.match(mapStatus([],[],enabled,false,'HTTP 503',false),/unavailable/);
assert.match(mapStatus([located],[],enabled,true,'busy',false),/Last successful snapshot retained/);
assert.match(mapStatus([],[],new Set(),false,null,false),/off/);
const source=fs.readFileSync('openrf/static/app.js','utf8');
const snippet=source.slice(source.indexOf('function closeMapFeatureInfo()'),source.indexOf('function showPage(page'));
const camera={hidden:false,textContent:'old camera'}, state={mapObservationId:7};let rendered=0,updated=0;
const window={};vm.runInNewContext(snippet,{state,window,$:()=>camera,renderMapObservationDetail:()=>rendered++,updateMap:()=>updated++});
function popup(){return {removed:0,added:0,on(_,f){this.closed=f;return this;},addTo(){this.added++;return this;},remove(){this.removed++;this.closed?.();return this;}};}
const one=popup(),two=popup();window.OpenRFMapFeatureInfo.show(one,{});assert.equal(rendered,1);assert.equal(updated,1);assert.equal(camera.hidden,true);assert.equal(state.mapObservationId,null);
window.OpenRFMapFeatureInfo.show(two,{});assert.equal(one.removed,1);assert.equal(two.added,1);window.OpenRFMapFeatureInfo.close();assert.equal(two.removed,1);assert.equal(state.mapFeaturePopup,null);window.OpenRFMapFeatureInfo.close();assert.equal(two.removed,1);
console.log('PASS mesh layer status and primary-map popup lifecycle');
