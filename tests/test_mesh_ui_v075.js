'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const app=fs.readFileSync('openrf/static/app.js','utf8');
const mesh=fs.readFileSync('openrf/static/mesh.js','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');

// One intentional + control opens a new observation. Empty map taps do not.
const vector=app.slice(app.indexOf("state.map.on('click', (evt) => {"),
  app.indexOf("state.map.on('click', 'survey-series-points'"));
assert(vector.includes('consumeNavigationPick('));
assert(vector.includes('consumeAreaClick('));
assert(!vector.includes('openObservation('),'blank vector map must not open manual observation');
const raster=app.slice(app.indexOf("root.addEventListener('pointerup',e=>{"),
  app.indexOf("root.addEventListener('pointercancel'"));
assert(raster.includes('consumeNavigationPick(')&&raster.includes('consumeAreaClick('));
assert(!raster.includes('openObservation('),'blank raster click must not open manual observation');
assert(app.includes("$('map-add-observation').addEventListener('click',()=>openObservation());"));
assert(app.includes("state.map.on('click', 'survey-points'"),'existing observation selection retained');
assert(app.includes("state.map.on('click', 'survey-waypoints'"),'waypoint detail click retained');

for(const id of ['mesh-panel','mesh-serial','mesh-mode','mesh-connect','mesh-disconnect',
  'mesh-set-mode','mesh-send','mesh-compose','mesh-text','mesh-destination','mesh-channel',
  'mesh-messages','mesh-status'])assert(html.includes(`id="${id}"`),id);
assert(html.includes('/static/mesh.js?v=0.2.166'));
assert(html.includes('/static/navigation_health.js?v=0.2.76'));
assert(css.includes('.mesh-control-grid')&&css.includes('@media(max-width:650px)'));
assert(mesh.includes("'/api/mesh/connect'")&&mesh.includes("'/api/mesh/send'"));
assert(mesh.includes('TextEncoder().encode(text).length>180'));
assert(mesh.includes('text.textContent=String(m.text||\'\')'),'received text must be DOM text, not HTML');
assert(mesh.includes('submitted_to_radio')&&mesh.includes('NOT confirmed'));
assert(!mesh.includes('innerHTML'));
console.log('PASS v0.2.76 no accidental observation, explicit mesh serial/text UI, honest delivery status');
