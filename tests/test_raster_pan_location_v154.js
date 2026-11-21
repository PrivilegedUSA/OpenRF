/* v0.2.164 — no-WebGL repeat tiles, polar edge clamp and one-shot GNSS. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const js=fs.readFileSync(path.join(__dirname,'..','openrf','static','app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','openrf','static','index.html'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','openrf','static','app.css'),'utf8');
const preload=fs.readFileSync(path.join(__dirname,'..','tools','openrf-electron','preload.js'),'utf8');
const start=js.indexOf('function worldPixel(');
const end=js.indexOf('\nfunction startRasterMap(',start);
assert(start>=0&&end>start);
const helpers=vm.runInNewContext(`${js.slice(start,end)};({worldPixel,pixelWorld,rasterTileSource,rasterVisibleTiles,clampRasterCenter})`);
const source=helpers.rasterTileSource('topographic',null,2);
const tiles=helpers.rasterVisibleTiles([-98.5,39.8],2,1006,780,source);
assert(tiles.length>0,'World view has imagery');
assert.equal(tiles.length,new Set(tiles.map(t=>t.key)).size,'Two world copies never share a DOM node');
assert(new Set(tiles.map(t=>t.url)).size<tiles.length,'Repeated tile URLs are allowed at separate screen positions');
assert(tiles.some(t=>t.key.includes('/-')&&t.url.includes('/2/')),'Negative world column wraps to a legal XYZ tile');
assert(tiles.every(t=>Number.isFinite(t.left)&&Number.isFinite(t.top)),'Every tile gets a precise screen position');
const dragged=helpers.pixelWorld(helpers.worldPixel(-98.5,39.8,2)[0]-180,helpers.worldPixel(-98.5,39.8,2)[1]-230,2);
const clamped=helpers.clampRasterCenter(dragged,2,780);
const centerPixel=helpers.worldPixel(clamped[0],clamped[1],2);
assert(centerPixel[1]>=390&&centerPixel[1]<=1024-390,'Map cannot be dragged north/south beyond tile coverage');
const wrappedAfterDrag=helpers.rasterVisibleTiles(clamped,2,1006,780,source);
assert(wrappedAfterDrag.length>0,'Continuous map remains available after a large drag');
assert.equal(wrappedAfterDrag.length,new Set(wrappedAfterDrag.map(t=>t.key)).size);

const renderer=js.slice(js.indexOf('function startRasterMap('),js.indexOf('\nfunction zoomToRecord('));
assert(renderer.includes('notice.hidden=!!source&&raster.loadedSourceKey===source.key;'),'Fallback notice dismisses after map imagery loads');
assert(renderer.includes("image.addEventListener('load'"),'Notice is dismissed on real loaded images');
assert(html.includes('id="map-location-toast"'),'Manual location result is visible on map');
assert(css.includes('.map-location-toast[data-error="true"]'),'Location errors visibly distinguished');
assert(js.includes("if(!manual&&window.openrfNativeBrowser?.available)"),'Native shell does not silently request browser location on launch');
assert(js.includes('window.openrfNativeBrowser.locationProviderConfigured===false'),'Native shell avoids pointless browser timeouts with no provider');
assert(preload.includes('locationProviderConfigured:Boolean(process.env.GOOGLE_API_KEY)'),'Native shell exposes provider availability as a Boolean, not the actual API credential');

const gnssStart=js.indexOf('async function tryMapRecenterGnss(');
const gnssEnd=js.indexOf('\nfunction locateMap(',gnssStart);
assert(gnssStart>=0&&gnssEnd>gnssStart);
const gnssCode=js.slice(gnssStart,gnssEnd);
async function checkGnss(mockFix){
  let requests=[],applied=0;
  const sandbox={Date,Number,fetch:async(url,options)=>{
    requests.push({url,options});return {ok:true,json:async()=>mockFix};
  },applyMapPosition:()=>{applied++;return true;}};
  const fn=vm.runInNewContext(`${gnssCode}; tryMapRecenterGnss`,sandbox);
  const result=await fn(4);
  assert.equal(requests.length,1,'Only one user-initiated GNSS read');
  assert.equal(requests[0].url,'/api/navigation/gnss');
  assert.equal(requests[0].options.headers['X-OpenRF-GNSS-Consent'],'map-recenter');
  return {result,applied};
}
(async()=>{
  const recent=new Date().toISOString();
  let check=await checkGnss({status:'fix',latitude:38.4,longitude:-120.6,accuracy_m:12,utc_timestamp:recent});
  assert.equal(check.result.ok,true);assert.equal(check.applied,1);
  check=await checkGnss({status:'fix',latitude:38.4,longitude:-120.6,accuracy_m:null,utc_timestamp:recent});
  assert.equal(check.result.ok,false);assert.equal(check.applied,0,'Missing accuracy does not become a claimed fix');
  check=await checkGnss({status:'fix',latitude:38.4,longitude:-120.6,accuracy_m:12,utc_timestamp:'2000-01-01T00:00:00Z'});
  assert.equal(check.result.ok,false);assert.equal(check.applied,0,'Stale GNSS cannot center map');
  check=await checkGnss({status:'unavailable',message:'No local GNSS receiver'});
  assert.equal(check.result.ok,false);assert.equal(check.applied,0);
  console.log('PASS v0.2.164 wrapped raster panning, loaded notice, opt-in/rejected stale GNSS');
})().catch(error=>{console.error(error);process.exitCode=1;});
