'use strict';
// v0.2.102: no background iw request; OS counters cannot become RF proof.
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
const script=fs.readFileSync('openrf/static/wifi_halow.js','utf8');
for(const id of ['halow-diag-interface','halow-diag-check','halow-diag-status','halow-diag-results'])
  assert(html.includes(`id="${id}"`),id);
assert(html.includes('/static/wifi_halow.js?v=0.2.102'));
assert(css.includes('#page-hardware .halow-diag-controls'));
assert(!script.includes('innerHTML')&&!script.includes('method:\'POST\''));

function node(tag){
  return {tag,children:[],className:'',textContent:'',disabled:false,value:'',listeners:{},
    classList:{contains:()=>false,toggle(){}},
    replaceChildren(...children){this.children=children;},
    append(...children){this.children.push(...children);},
    addEventListener(name,fn){this.listeners[name]=fn;}};
}
const ids=['halow-panel','halow-state','halow-status','halow-candidates','halow-setup-steps',
  'halow-refresh','page-hardware','halow-diag-interface','halow-diag-check',
  'halow-diag-status','halow-diag-results'];
const nodes=Object.fromEntries(ids.map(id=>[id,node('div')]));
const events={},requests=[];
const readiness={kind:'PASSIVE_WIFI_HALOW_READINESS',read_only:true,state:'candidate_interface_visible',
  summary:'Morse driver, no RF claims',candidate_interfaces:[{name:'halow0',driver_hint:'morse',
  os_operstate:'up',os_carrier_reported:true,ipv6_link_local_present:true,reticulum_opt_in_eligible:true}],
  candidate_usb_descriptors:[],loaded_module_hints:[],optional_tool_presence:{iw:true},setup_steps:[]};
function report(rx){return {kind:'PASSIVE_WIFI_HALOW_LINK_DIAGNOSTIC',interface:'halow0',
  driver_hint:'morse',os_operstate:'up',os_carrier_reported:true,ipv6_link_local_present:true,
  reticulum_opt_in_eligible:true,os_association:'os_reports_associated',read_only:true,
  performs_scan_or_connection:false,observed_at_utc:'2026-11-17T20:00:00+00:00',
  kernel_cumulative_counters:{rx_bytes:String(rx),tx_bytes:'0',rx_packets:'5',tx_packets:'0',
    rx_errors:'0',tx_errors:'0',rx_dropped:'0',tx_dropped:'0'}};}
let next=report('18446744073709551600');
const context={document:{getElementById:id=>nodes[id],createElement:node,
  addEventListener(name,fn){events[name]=fn;}},
  fetch:async(url,options)=>{
    requests.push([url,options]);
    return {ok:true,json:async()=>url.includes('/diagnostics?')?next:readiness};
  }};
vm.runInNewContext(script,context);
const flatten=()=>nodes['halow-diag-results'].children.map(item=>(item.children||[])
  .map(x=>x.textContent).join(' ')).join('\n');
(async()=>{
  assert.equal(requests.length,0,'No host probe before opening Hardware');
  await events['openrf:hardware-shown']();
  assert.deepEqual(requests.map(([url])=>url),['/api/wifi-halow/status']);
  assert.equal(nodes['halow-diag-interface'].value,'halow0');
  assert.equal(nodes['halow-diag-check'].disabled,false);
  await nodes['halow-diag-check'].listeners.click();
  assert.equal(requests[1][0],'/api/wifi-halow/diagnostics?interface=halow0');
  assert(requests.every(([,opts])=>opts.cache==='no-store'&&!opts.method));
  assert(flatten().includes('18446744073709551600'), 'Exact u64 counter is displayed');
  assert(flatten().includes('RF and peers NOT verified'));
  next=report('18446744073709551615');
  await nodes['halow-diag-check'].listeners.click();
  assert.match(flatten(),/\+15 since prior inspection/, 'Exact positive delta, not a made-up radio rate');
  next=report('1');
  await nodes['halow-diag-check'].listeners.click();
  assert.match(flatten(),/counter reset, no comparison/);
  nodes['halow-diag-interface'].listeners.change();
  assert.equal(nodes['halow-diag-results'].children.length,0,'Changing selection clears stale reports');
  await nodes['halow-refresh'].listeners.click();
  assert.equal(requests[4][0],'/api/wifi-halow/status', 'Readiness is separate from link check');
  assert.equal(nodes['halow-diag-results'].children.length,0);
  console.log('PASS v0.2.102 explicit, exact-counter Linux HaLow diagnostics and privacy');
})().catch(error=>{console.error(error);process.exitCode=1;});
