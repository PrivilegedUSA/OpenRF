'use strict';
// v0.2.102 — passive adapter candidates; UI never starts RF or trusts a carrier flag.
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
const script=fs.readFileSync('openrf/static/wifi_halow.js','utf8');
const server=fs.readFileSync('openrf/server.py','utf8');
for(const id of ['halow-panel','halow-state','halow-status','halow-candidates',
  'halow-setup-steps','halow-refresh'])assert(html.includes(`id="${id}"`),id);
assert(html.includes('/static/wifi_halow.js?v=0.2.102'));
assert(css.includes('#page-hardware .halow-row{'));
assert(server.includes("'/api/wifi-halow/status'"));
assert(!script.includes('innerHTML')&&!script.includes('POST')&&
  !script.includes('morse_cli(')&&!script.includes('wpa_supplicant_s1g('),
  'HaLow readiness UI must not send connection or control requests');

function node(tag){return {tag,children:[],className:'',textContent:'',disabled:false,
  classList:{contains:()=>false,toggle(){}},listeners:{},
  replaceChildren(...children){this.children=children;},append(...children){this.children.push(...children);},
  addEventListener(name,callback){this.listeners[name]=callback;}};}
const ids=['halow-panel','halow-state','halow-status','halow-candidates','halow-setup-steps',
  'halow-refresh','page-hardware'];
const nodes=Object.fromEntries(ids.map(id=>[id,node('div')]));
const events={};const requests=[];
const data={kind:'PASSIVE_WIFI_HALOW_READINESS',read_only:true,state:'candidate_interface_visible',
  summary:'Known Morse driver; link unverified',
  candidate_interfaces:[{name:'wlan1',driver_hint:'morse',os_operstate:'up',
    os_carrier_reported:true,halow_rf_link_verified:false}],
  candidate_usb_descriptors:[{vendor_id:'1234',product_id:'8108'}],
  loaded_module_hints:['morse'],
  optional_tool_presence:{iw:true,morse_cli:false},
  setup_steps:['Install firmware only with the vendor guide.']};
const context={document:{getElementById:id=>nodes[id],createElement:node,
  addEventListener(name,callback){events[name]=callback;}},
  fetch:async(path,options)=>{requests.push([path,options]);return {ok:true,json:async()=>data};}};
vm.runInNewContext(script,context);
assert.equal(requests.length,0,'No HaLow inspection before user opens Hardware');
(async()=>{
  await events['openrf:hardware-shown']();
  assert.deepEqual(requests.map(([path])=>path),['/api/wifi-halow/status']);
  assert(requests.every(([,options])=>options.cache==='no-store'&&!options.method));
  assert.equal(nodes['halow-state'].textContent,'POSSIBLE DRIVER');
  assert.match(nodes['halow-candidates'].children[0].children[2].textContent,/unverified/i);
  assert.match(nodes['halow-setup-steps'].children[0].textContent,/Install firmware/);
  await nodes['halow-refresh'].listeners.click();
  assert.equal(requests.length,2,'Explicit refresh uses GET only');
  console.log('PASS v0.2.102 passive Wi-Fi HaLow page and no hidden setup actions');
})().catch(error=>{console.error(error);process.exitCode=1;});
