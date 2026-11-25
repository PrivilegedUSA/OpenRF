'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync('openrf/static/app.js','utf8');
const state={baseMap:'default',style:'dark',mapVectorOffline:false,mapReady:true,mapRasterTileSeen:false,map:{setStyle(url,opts){assert.equal(opts.diff,false);this.url=url;this.sources=new Map();this.layers=new Map();}}};
const picker={hidden:false,textContent:''};
const ctx={state,$:()=>picker,document:{querySelectorAll:()=>[]},rememberBaseMap(){},updateOfflineAttribution(){},syncWalkingPathOverlay(){},frameInstalledRegion(){},setTimeout(){},checkVectorBasemap(){},applyNavigationFit(){},applyPendingLocation(){},renderAreaOverlay(){},renderNavigationOverlay(){},updateBrowserLocationMarker(){},installMapFeatureHoverCursors(){}};
let camera=0,mesh=0,pub=0;
ctx.window={OpenRFCameras:{installVector(map){camera++;map.sources.set('camera-catalog-data',{});}},OpenRFMeshDashboard:{vector(map,force){assert.equal(force,true);mesh++;}},OpenRFPublicMesh:{vector(map,force){assert.equal(force,true);pub++;}}};
ctx.installMarkerLayer=()=>state.map.sources.set('survey-data',{});ctx.updateMap=()=>assert.ok(state.map.sources.has('survey-data'));
const selector=app.slice(app.indexOf('function openrfMapStyleUrl()'),app.indexOf('function regionalVectorReady()'));
const callback=app.slice(app.indexOf("state.map.on('style.load', () => {"),app.indexOf('// A raster tile content event'));
state.map.on=(event,cb)=>{assert.equal(event,'style.load');state.map.loaded=cb;};
vm.runInNewContext(selector+'\n'+callback,{...ctx,attempt:1});
const sandbox=vm.createContext(ctx);vm.runInContext(selector,sandbox);
for(const basemap of ['satellite','topographic','default']){sandbox.selectBaseMap(basemap);assert.equal(state.mapReady,false);state.map.loaded();assert.equal(state.mapReady,true);assert.ok(state.map.sources.has('camera-catalog-data'));assert.ok(state.map.sources.has('survey-data'));}
assert.equal(camera,3);assert.equal(mesh,3);assert.equal(pub,3);
console.log('PASS complete style reset and overlay restoration callback for three basemaps');
