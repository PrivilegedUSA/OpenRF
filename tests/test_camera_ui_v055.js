'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../openrf/static');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'app.css'),'utf8');
const camera=fs.readFileSync(path.join(root,'camera-layers.js'),'utf8');
const block=html.slice(html.indexOf('class="map-layer-options"'),html.indexOf('class="camera-map-manager"'));
for (const kind of ['ALPR','RED_LIGHT','SPEED']){
  assert(block.includes(`data-camera-type="${kind}"`),kind+' should be in one layers grid');
}
assert(block.includes('data-map-kind="WIFI"'));
assert(!html.includes('class="camera-layer-toggles"'));
assert(!html.includes('<details class="camera-map-manager"'));
assert(html.includes('class="camera-action-buttons"'));
assert(css.includes('#map-survey-panel .camera-action-buttons{display:grid'));
assert(css.includes('gap:10px'));
assert(camera.includes('Querying OSM/Overpass'));
assert(camera.includes("window.OpenRFMapLayerPreferences?.save?.()"),'camera layer changes must persist');
assert(!camera.includes('checkbox.checked=true'),'imports must not override a hidden camera layer');
assert(camera.includes('window.OpenRFCameras='));
console.log('PASS v0.2.59 one grid for all layers, spaced action controls and bounded OSM import');
