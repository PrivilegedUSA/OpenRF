'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const app=fs.readFileSync('openrf/static/app.js','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
const widget=fs.readFileSync('openrf/static/map-elevation.js','utf8');

for(const kind of ['default','satellite','topographic']){
  assert(html.includes(`name="map-basemap" value="${kind}"`),`Missing ${kind} base-map choice`);
}
assert(html.includes('/static/map-elevation.js?v=0.2.148'));
assert(html.includes('id="map-altimeter-value"'));
assert(css.includes('map-basemap-options'));
assert(css.includes('body:not(.map-workspace) .map-altimeter'));
assert(app.includes('state.baseMap=rememberedBaseMap()'),'Map must restore the browser\'s last explicitly selected basemap');
assert(app.includes("return `/api/vector/styles/${state.baseMap}.json`"));
assert(app.includes('option.addEventListener(\'change\''),'Picker must change styles');
assert(app.includes('state.map.isSourceLoaded(\'openrf-usgs-basemap\')'));
assert(app.includes("state.baseMap==='satellite' || state.baseMap==='topographic'"));
assert(app.includes('OpenRFMapElevation?.update(pos)'));
assert(!widget.includes('getCurrentPosition(') && !widget.includes('watchPosition('),
  'Altitude display must not request location or track automatically');

// Execute the real selector functions, without booting the entire app or making
// remote tile requests, to verify that radio clicks actually replace the style.
const begin=app.indexOf('function openrfMapStyleUrl()');
const end=app.indexOf('function regionalVectorReady()',begin);
assert(begin>=0 && end>begin);
const choices=['default','satellite','topographic'].map(value=>({value,checked:value==='default'}));
const statuses={'map-error':{hidden:true},'map-basemap-note':{textContent:''}};
const styles=[];
const styleState={baseMap:'default',style:'dark',mapVectorOffline:true,map:{setStyle:url=>styles.push(url)},rasterMap:null};
const remembered=[];
const styleContext={state:styleState,$:id=>statuses[id],document:{querySelectorAll:()=>choices},
  rememberBaseMap:value=>remembered.push(value),
  updateOfflineAttribution:()=>{}};
vm.runInNewContext(app.slice(begin,end),styleContext);
styleContext.selectBaseMap('satellite');
assert.equal(styles.at(-1),'/api/vector/styles/satellite.json');
assert(choices[1].checked && !choices[0].checked);
assert.match(statuses['map-basemap-note'].textContent,/online/);
styleContext.selectBaseMap('topographic');
assert.equal(styles.at(-1),'/api/vector/styles/topographic.json');
styleContext.selectBaseMap('default');
assert.equal(styles.at(-1),'/api/vector/styles/dark.json?offline=1',
  'Returning to Default must restore the installed offline vector preference');
assert.equal(remembered.join(','),'satellite,topographic,default');

let now=1800000000000;
const fields=new Map(['map-altimeter','map-altimeter-value'].map(id=>[id,{id,textContent:'',dataset:{},title:''}]));
const window={};
let updateAge;
const ctx={window,document:{getElementById:id=>fields.get(id)},
  Date:{now:()=>now},setInterval(fn,delay){assert.equal(delay,5000);updateAge=fn;}};
vm.runInNewContext(widget,ctx);
const display=fields.get('map-altimeter-value');
const root=fields.get('map-altimeter');
assert.equal(display.textContent,'— ft');
assert.equal(window.OpenRFMapElevation.update({timestamp:now,coords:{altitude:null}}),false);
assert.equal(display.textContent,'— ft','No reported altitude must never become zero');
assert.equal(window.OpenRFMapElevation.update({timestamp:now,coords:{altitude:1500,altitudeAccuracy:12}}),true);
assert.equal(display.textContent,'4,921 ft');
assert(!html.includes('id="map-altimeter-detail"'),'Compact altitude badge must not include a third line');
assert.equal(root.dataset.altitude,'reported');
assert.equal(window.OpenRFMapElevation.update({timestamp:now,origin:'gpsd',coords:{altitude:1520,altitudeAccuracy:4,altitudeReference:'msl'}}),true);
assert.equal(display.textContent,'4,987 ft');
assert.match(root.title,/MSL/);
assert.equal(window.OpenRFMapElevation.update({timestamp:now,coords:{altitude:0,altitudeAccuracy:null}}),false);
assert.equal(display.textContent,'— ft','Unqualified desktop zero is not an elevation measurement');
assert.equal(window.OpenRFMapElevation.update({timestamp:now,coords:{altitude:0,altitudeAccuracy:0}}),false);
assert.equal(display.textContent,'— ft','Impossible zero vertical uncertainty must not validate desktop zero');
now+=46000;updateAge();
assert.equal(display.textContent,'— ft','Previously reported altitude must expire');
assert.equal(root.dataset.altitude,'unavailable');
assert.equal(window.OpenRFMapElevation.update({timestamp:now-120000,coords:{altitude:500}}),false);
assert.equal(display.textContent,'— ft','Stale GPS fixes must not display a number');
console.log('PASS v0.2.148 online-only USGS basemap chooser, real GPS altitude display and stale-data guard');
