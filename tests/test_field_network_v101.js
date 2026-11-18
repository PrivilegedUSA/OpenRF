'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
const network=fs.readFileSync('openrf/static/field_network.js','utf8');
const offline=fs.readFileSync('openrf/static/offline_readiness.js','utf8');
const server=fs.readFileSync('openrf/server.py','utf8');
for(const id of ['field-network-panel','field-network-refresh','field-network-mode',
  'field-network-status','field-network-mode-detail','field-network-interfaces',
  'map-offline-readiness','map-offline-check','map-offline-status','map-offline-results'])
  assert(html.includes(`id="${id}"`),id);
assert(html.includes('/static/field_network.js?v=0.2.104'));
assert(html.includes('/static/offline_readiness.js?v=0.2.104'));
assert(css.includes('.field-network-row')&&css.includes('.map-offline-row'));
assert(server.includes("'/api/network/field-readiness'"));
assert(server.includes("'/api/navigation/offline-readiness'"));
for(const file of [network,offline]){
  assert(!file.includes('innerHTML')&&!file.includes("'POST'"));
  assert(!file.includes('geolocation')&&!file.includes('getCurrentPosition'));
}
function node(tag){return {tag,children:[],className:'',textContent:'',disabled:false,value:'',listeners:{},
  replaceChildren(...kids){this.children=kids;},append(...kids){this.children.push(...kids);},
  addEventListener(type,fn){this.listeners[type]=fn;}};}
const names=['field-network-panel','field-network-refresh','field-network-mode',
  'field-network-status','field-network-mode-detail','field-network-interfaces',
  'map-offline-readiness','map-offline-check','map-offline-status','map-offline-results'];
const nodes=Object.fromEntries(names.map(name=>[name,node('div')]));
nodes['field-network-mode'].value='two_radio_gateway';
const requests=[];
const field={kind:'PASSIVE_FIELD_NETWORK_FOUNDATION',read_only:true,
  activation_available:false,radio_actions_performed:false,observed_at_utc:'2026-11-17T22:00:00Z',
  mode_candidates:{two_radio_gateway:true,local_wifi_hotspot:true},
  proposed_roles:[{id:'two_radio_gateway',label:'Two-radio field gateway',description:'Local Wi-Fi plus HaLow'},
    {id:'local_wifi_hotspot',label:'Phone Wi-Fi hotspot',description:'Ordinary Wi-Fi'}],
  interfaces:[{name:'wlan0',classification:'ordinary_wifi_candidate',phy:'phy0',os_operstate:'up',
    os_reports_ap_mode:true,os_reports_station_mode:true}],tool_presence:{iw:true}};
const route={kind:'OFFLINE_NAVIGATION_PREFLIGHT',read_only:true,
  gps_fix_checked:false,external_requests:false,observed_at_utc:'2026-11-17T22:00:00Z',
  routing_service_reachable:false,routing_service_detail:'Local Valhalla not started',
  local_vector_basemap_ready:true,local_raster_package_count:1};
const context={document:{getElementById:id=>nodes[id],createElement:node},
  fetch:async(path,options)=>{
    requests.push([path,options]);return {ok:true,json:async()=>path.includes('field-readiness')?field:route};
  }};
vm.runInNewContext(network,context);
vm.runInNewContext(offline,context);
const flatten=id=>nodes[id].children.map(x=>(x.children||[]).map(c=>c.textContent).join(' ')).join('\n');
(async()=>{
  assert.equal(requests.length,0,'No background network check, hotspot or GPS request');
  await nodes['field-network-refresh'].listeners.click();
  assert.deepEqual(requests.map(([url])=>url),['/api/network/field-readiness']);
  assert.match(flatten('field-network-mode-detail'),/Configuration, security, hardware operation/);
  assert.match(flatten('field-network-interfaces'),/simultaneous roles: unverified/);
  nodes['field-network-mode'].value='local_wifi_hotspot';
  nodes['field-network-mode'].listeners.change();
  assert.match(flatten('field-network-mode-detail'),/Phone Wi-Fi hotspot/);
  assert.equal(requests.length,1,'Changing planned role does not configure anything');
  await nodes['map-offline-check'].listeners.click();
  assert.deepEqual(requests.map(([url])=>url),
    ['/api/network/field-readiness','/api/navigation/offline-readiness']);
  assert.match(flatten('map-offline-results'),/Local Valhalla is unavailable/);
  assert.match(flatten('map-offline-results'),/No GPS fix or chosen road route tested/);
  assert(requests.every(([,opts])=>opts.cache==='no-store'&&!opts.method));
  console.log('PASS v0.2.104 offline-navigation preflight and field network planning');
})().catch(err=>{console.error(err);process.exitCode=1;});
