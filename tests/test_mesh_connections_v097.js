'use strict';
// v0.2.97: simulate passive status and consent-gated local stop controls.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
const script=fs.readFileSync('openrf/static/mesh_connections.js','utf8');
const app=fs.readFileSync('openrf/static/app.js','utf8');
const mesh=fs.readFileSync('openrf/static/mesh.js','utf8');
const reticulum=fs.readFileSync('openrf/static/reticulum.js','utf8');
for(const id of ['mesh-connections-panel','mesh-connections-status','mesh-connection-overview',
  'mesh-connection-ports','mesh-connection-interfaces','mesh-connections-refresh',
  'mesh-connections-disconnect','mesh-connections-stop-reticulum'])
  assert(html.includes(`id="${id}"`),id);
assert(html.includes('/static/mesh_connections.js?v=0.2.97'));
assert(css.includes('.mesh-connection-overview{display:grid;'));
assert(css.includes('@media(max-width:720px){#page-hardware .mesh-connection-overview{'));
assert(app.includes("if (page === 'hardware') document.dispatchEvent(new Event('openrf:hardware-shown'))"));
assert(mesh.includes("document.addEventListener('openrf:connections-changed',refresh)"));
assert(reticulum.includes("document.addEventListener('openrf:connections-changed',refreshStatus)"));
assert(!script.includes('innerHTML')&&!script.includes("'/api/mesh/connect'")&&
  !script.includes("'/api/reticulum/start'"),'Overview must never start a radio');

function node(tag){return {tag,children:[],className:'',textContent:'',disabled:false,
  classList:{toggle(){},contains:()=>false},listeners:{},replaceChildren(...items){this.children=[...items];},
  append(...items){this.children.push(...items);},
  addEventListener(name,handler){this.listeners[name]=handler;}};}
const ids=['mesh-connections-panel','mesh-connections-status','mesh-connection-overview',
  'mesh-connection-ports','mesh-connection-interfaces','mesh-connections-refresh',
  'mesh-connections-disconnect','mesh-connections-stop-reticulum','page-hardware'];
const nodes=Object.fromEntries(ids.map(id=>[id,node('div')]));
const events={};const fetches=[];let accept=false;let connected=true;let enabled=true;
const report=()=>({observed_at_utc:'2026-11-17T12:00:00Z',
  meshtastic:{connected,port:connected?'/dev/ttyUSB0':null,sdk_available:true},
  reticulum:{enabled,rnode_ports:enabled?['/dev/ttyACM1']:[],tcp_requested:false,
    transport_forwarding_requested:false,diagnostics_available:enabled,
    diagnostics_note:'',interfaces:enabled?[{name:'OpenRF Optional USB RNode',local_up:true,
      reachable_peers_reported:0,rx_bytes:12,tx_bytes:24}]:[]},
  ports:[{path:'/dev/ttyUSB0',owner:connected?'MESHTASTIC_USB_SESSION':'NOT_CLAIMED_BY_OPENRF',
    linux_status:'ready_to_probe'},
    {path:'/dev/ttyACM1',owner:enabled?'RETICULUM_RNODE_REQUESTED':'NOT_CLAIMED_BY_OPENRF',
      linux_status:'permission_denied'}]});
const context={document:{getElementById:id=>nodes[id],createElement:node,
  addEventListener(name,listener){events[name]=listener;},
  dispatchEvent(event){events[event.type]?.(event);}},
  Event:class{constructor(type){this.type=type;}},
  window:{confirm:()=>accept},
  fetch:async(path,options={})=>{
    fetches.push([path,options.method||'GET']);
    if(path==='/api/mesh/disconnect')connected=false;
    if(path==='/api/reticulum/stop')enabled=false;
    return {ok:true,json:async()=>path==='/api/mesh/connections'?report():{}};
  }};
vm.runInNewContext(script,context);
assert.equal(fetches.length,0,'No automatic status poll when not on Hardware');
assert(nodes['mesh-connections-disconnect'].disabled);
assert(nodes['mesh-connections-stop-reticulum'].disabled);
(async()=>{
  await events['openrf:hardware-shown']();
  assert.deepEqual(fetches,[['/api/mesh/connections','GET']]);
  assert.equal(nodes['mesh-connections-disconnect'].disabled,false);
  assert.equal(nodes['mesh-connections-stop-reticulum'].disabled,false);
  assert.match(nodes['mesh-connection-overview'].children[0].children[1].textContent,/USB session open/);
  assert.match(nodes['mesh-connection-ports'].children[1].children[1].textContent,/Reticulum RNode requested/);
  assert.match(nodes['mesh-connection-interfaces'].children[0].children[1].textContent,/RNS reports UP/);
  await nodes['mesh-connections-disconnect'].listeners.click();
  assert.equal(fetches.length,1,'Declined confirmation performs no action');
  accept=true;
  await nodes['mesh-connections-disconnect'].listeners.click();
  assert(fetches.some(([path,method])=>path==='/api/mesh/disconnect'&&method==='POST'));
  assert(nodes['mesh-connections-disconnect'].disabled);
  assert(!nodes['mesh-connections-stop-reticulum'].disabled);
  await nodes['mesh-connections-stop-reticulum'].listeners.click();
  assert(fetches.some(([path,method])=>path==='/api/reticulum/stop'&&method==='POST'));
  assert(nodes['mesh-connections-stop-reticulum'].disabled);
  assert.match(nodes['mesh-connection-interfaces'].children[0].textContent,/Reticulum is stopped/);
  console.log('PASS v0.2.97 passive connections and confirmation-gated stop controls');
})().catch(error=>{console.error(error);process.exitCode=1;});
