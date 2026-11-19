'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const js=fs.readFileSync('openrf/static/app.js','utf8');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');

assert(html.includes('id="map-walking-layer-note"'), 'walking legend note is present');
assert(css.includes('#page-map .map-walking-layer-note[hidden]'), 'walking note hides cleanly in drive mode');
const start=js.indexOf('function syncWalkingPathOverlay(){');
const end=js.indexOf('function setMapTravelMode(mode){',start);
assert(start>=0 && end>start,'walking overlay function is defined before mode changes');
const definitions={};
const visibility=[];
const map={
  getSource:id=>id==='openmaptiles'?{}:null,
  getLayer:id=>definitions[id],
  addLayer:layer=>{definitions[layer.id]=layer;},
  setLayoutProperty:(id,name,value)=>visibility.push({id,name,value})
};
const note={hidden:true};
const state={navTravelMode:'auto',style:'dark',map,mapReady:true};
const context={state,$:id=>id==='map-walking-layer-note'?note:null,console};
vm.runInNewContext(`${js.slice(start,end)};syncWalkingPathOverlay();`,context);
const ids=Object.keys(definitions).sort();
assert.deepEqual(ids,['openrf-walking-paths','openrf-walking-tracks']);
for(const item of Object.values(definitions)){
  assert.equal(item.source,'openmaptiles');
  assert.equal(item['source-layer'],'transportation');
  assert.equal(item.type,'line');
  assert.equal(item.minzoom,11);
  assert.equal(item.layout.visibility,'none');
  assert(!item.paint['line-opacity'] || item.paint['line-opacity']<=1);
}
assert.equal(note.hidden,true);
state.navTravelMode='pedestrian';
vm.runInNewContext('syncWalkingPathOverlay();',context);
assert.equal(note.hidden,false,'Walk reveals path explanation');
assert.deepEqual(visibility.slice(-2).map(v=>v.value),['visible','visible']);
state.navTravelMode='auto';
vm.runInNewContext('syncWalkingPathOverlay();',context);
assert.equal(note.hidden,true,'Drive hides path explanation');
assert.deepEqual(visibility.slice(-2).map(v=>v.value),['none','none']);
assert(js.includes("state.map.on('style.load', () => {\n      updateOfflineAttribution();\n      state.mapReady=true;\n      syncWalkingPathOverlay();"),
  'layers reappear after vector style reload');
console.log('PASS v0.2.136 OSM mapped footpath highlights are mode-specific and reversible');
