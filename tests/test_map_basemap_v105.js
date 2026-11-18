'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const js=fs.readFileSync(path.join(root,'openrf/static/app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'openrf/static/app.css'),'utf8');

// A successful MapLibre style.load must not hide a basemap source failure.
assert.match(js,/state\.map\.on\('style\.load',\s*\(\)\s*=>\s*\{/);
assert.match(js,/setTimeout\(\(\)=>checkVectorBasemap\(attempt,url\),9000\)/);
assert.match(js,/state\.map\.on\('idle',/);
assert.match(css,/#page-map \.map-wrap \.map-error\.map-notice\{/);
assert.match(css,/#page-map \.map-wrap \.map-error\.map-notice\[hidden\]\{display:none!important\}/);

// Firefox and 800x480 Raspberry Pi layout keep the gear panel below the
// hamburger, left of map controls and above the bottom action row.
assert.match(css,/#page-map \.map-navigation-settings\[open\] \.map-settings-popup,/);
assert.match(js,/function alignMapSettingsPopup\(\)/);
assert.match(js,/Math\.round\(rect\.top\+60\)/);
assert.match(js,/Math\.round\(rect\.right-56-width\)/);
assert.match(js,/window\.addEventListener\('resize',realignBottomMapPopups\)/);

const from=js.indexOf('function showVectorBasemapNotice(message){');
const to=js.indexOf('function alignMapToolRail()',from);
assert(from>0&&to>from);
const notices=[];
const styles=[];
const notice={hidden:true,classList:{add(){}},replaceChildren(){},append(_heading,detail){notices.push(detail.textContent)}};
const state={mapAttempt:1,mapReady:true,mapBasemapVisible:false,rasterMap:null,
  mapVectorOffline:false,mapVectorPreference:'auto',mapOfflineRecoveryTried:false,
  vectorStatus:{ready:true,fonts_ready:true,bounds:[-121.25,37.95,-119.70,38.95]},
  map:{getStyle(){return {layers:[{source:'openmaptiles',type:'line',id:'roads'}]};},
    queryRenderedFeatures(){return [];},setStyle(url){styles.push(url);}}};
const env={state,$:()=>notice,document:{createElement(){return {textContent:''};}},
  regionalVectorReady(){return true;},updateOpenRFVectorButtons(){},
  openrfMapStyleUrl(){return '/api/vector/styles/dark.json'+(state.mapVectorOffline?'?offline=1':'');},
  console:{warn(){}},setTimeout(){}};
vm.runInNewContext(js.slice(from,to),env);
env.checkVectorBasemap(1,'/api/vector/styles/dark.json');
assert.deepEqual(styles,['/api/vector/styles/dark.json?offline=1']);
assert.equal(state.mapRegionalFramePending,true,'offline recovery should frame its actual coverage');
assert.equal(state.mapReady,false,'new regional style still needs to load');

state.mapVectorOffline=false;
state.mapVectorPreference='online';
state.mapOfflineRecoveryTried=false;
state.mapReady=true;
env.checkVectorBasemap(1,'/api/vector/styles/dark.json');
assert.equal(styles.length,1,'explicit online selection must be respected');
assert.match(notices.at(-1),/did not display roads/);
assert.equal(notice.hidden,false,'missing map features should never fail silently');

console.log('v0.2.105 map-tile failure notice, regional recovery, and settings overlay checks passed.');
