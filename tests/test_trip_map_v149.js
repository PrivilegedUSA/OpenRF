'use strict';
/* v0.2.149: compact route download UI is opt-in and preserves map startup. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const app=fs.readFileSync('openrf/static/app.js','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
const js=fs.readFileSync('openrf/static/trip-map.js','utf8');
const ids=['map-trip-offline','map-trip-source','map-trip-corridor','map-trip-detail',
  'map-trip-name','map-trip-estimate','map-trip-estimate-status','map-trip-start',
  'map-trip-cancel','map-trip-confirm','map-trip-download-status'];
for(const id of ids)assert(html.includes(`id="${id}"`),`Missing trip control ${id}`);
assert(html.includes('/static/trip-map.js?v=0.2.149'));
assert(html.includes('Road/trail routing graphs are NOT downloaded'));
assert(html.indexOf('id="map-trip-offline"')>html.indexOf('id="map-route-offline-coverage"'));
assert(app.includes('window.OpenRFTripMaps?.init('));
assert(app.includes('tripMapController?.routeChanged()'));
assert(css.includes('.trip-map-controls'));
assert(!js.includes('geolocation')&&!js.includes('getCurrentPosition'));
const nodes=Object.fromEntries(ids.map(id=>[id,{
  id,value:'',textContent:'',checked:false,disabled:false,handlers:{},
  addEventListener(type,fn){this.handlers[type]=fn;}}]));
nodes['map-trip-source'].value='topographic';
nodes['map-trip-corridor'].value='1';
nodes['map-trip-detail'].value='standard';
nodes['map-trip-name'].value='local-trip-01';
nodes['map-trip-start'].disabled=true;
nodes['map-trip-cancel'].disabled=true;
const messages=[],calls=[];
const ctx={window:{},document:{getElementById:id=>nodes[id]},
  setInterval:fn=>(messages.push('timer started'),42),clearInterval:()=>messages.push('timer stopped'),
  confirm:message=>(messages.push(message),true)};
vm.runInNewContext(js,ctx);
let route={type:'ROAD_ROUTE',coordinates:[[0,0],[0.01,0.01]]};
let status={state:'running',map_id:'local-trip-01',preview_id:'safe-preview',downloaded:4,candidate_tiles:32};
const controller=ctx.window.OpenRFTripMaps.init({
  getRoute:()=>route,
  sample:(points,count)=>{assert.equal(count,257);return [[0,0],[0.01,0.01]];},
  api:async(path,method,body)=>{
    calls.push({path,method,body});
    if(path.endsWith('/estimate'))return {estimate:{kind:'OPENRF_TRIP_MAP_ESTIMATE',read_only:true,
      external_requests:false,gps_fix_checked:false,preview_id:'safe-preview',tile_count:32,
      estimated_bytes_low:1200000,estimated_bytes_high:8000000}};
    if(path.endsWith('/status'))return {download:status};
    if(path.endsWith('/start'))return {download:status};
    if(path.endsWith('/cancel'))return {download:status};
    throw Error('Unknown path');
  },refreshMaps:async()=>messages.push('local map list refreshed'),
});
(async()=>{
  assert.equal(calls.length,0,'No request just from loading a map page');
  assert.equal(nodes['map-trip-start'].disabled,true,'No download before an explicit estimate');
  await nodes['map-trip-estimate'].handlers.click();
  assert.equal(calls.length,1);
  assert.equal(calls[0].path,'/api/maps/trips/estimate');
  assert.equal(calls[0].method,'POST');
  assert.equal(calls[0].body.source,'topographic');
  assert.match(nodes['map-trip-estimate-status'].textContent,/32 tile slots/);
  assert.equal(nodes['map-trip-start'].disabled,false);
  nodes['map-trip-detail'].value='detailed';nodes['map-trip-detail'].handlers.change();
  assert.equal(nodes['map-trip-start'].disabled,true,'Changing zoom invalidates preview');
  await nodes['map-trip-estimate'].handlers.click();
  nodes['map-trip-confirm'].checked=true;
  await nodes['map-trip-start'].handlers.click();
  const start=calls.find(x=>x.path==='/api/maps/trips/start');
  assert(start,'Explicit confirmation must be required to start');
  assert.equal(start.body.preview_id,'safe-preview');
  assert.equal(start.body.confirm_network,true);
  assert.equal(start.body.map_id,'local-trip-01');
  assert(messages.some(x=>x.includes('USGS will receive')));
  assert.match(nodes['map-trip-download-status'].textContent,/4\/32 tiles/);
  status={state:'complete',preview_id:'safe-preview',result:{map:{id:'local-trip-01'},tiles_downloaded:32}};
  await controller.poll();
  assert(messages.includes('local map list refreshed'));
  assert.match(nodes['map-trip-download-status'].textContent,/Offline trip map ready/);
  route={type:'ROAD_ROUTE',coordinates:[[0,0],[0.02,0.02]]};
  controller.routeChanged();
  assert.equal(nodes['map-trip-start'].disabled,true);
  assert(!calls.some(x=>x.path.includes('geocode')||x.path.includes('gnss')));
  console.log('PASS v0.2.149 explicit trip map preview/confirm/progress and route invalidation');
})().catch(error=>{console.error(error);process.exitCode=1;});
