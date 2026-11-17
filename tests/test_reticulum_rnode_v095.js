'use strict';
// No RNode probe, RF transmission, or network discovery is performed here.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const js=fs.readFileSync('openrf/static/reticulum.js','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
for(const id of ['reticulum-rnode-panel','reticulum-rnode-refresh','reticulum-rnode-readiness',
  'reticulum-rnode-activate','reticulum-rnode-port','reticulum-rnode-frequency',
  'reticulum-rnode-bandwidth','reticulum-rnode-txpower','reticulum-rnode-sf',
  'reticulum-rnode-cr','reticulum-transport-enable'])
  assert(html.includes(`id="${id}"`),id);
assert(html.includes('No port selected'));
assert(html.includes('HaLow link is verified'));
assert(css.includes('.reticulum-rnode-fields{display:grid;'));
assert(css.includes('@media(max-width:720px)'));
assert(js.includes("'/api/reticulum/rnode/readiness'"));
assert(js.includes('window.confirm(\'Start Reticulum with the selected USB RNode radio(s)?'));
assert(js.includes('window.confirm(\'Enable Reticulum transport forwarding?'));
assert(!js.includes('innerHTML'));

const ids=['reticulum-tcp-enable','reticulum-rnode-activate','reticulum-rnode-port',
  'reticulum-rnode-frequency','reticulum-rnode-bandwidth','reticulum-rnode-txpower',
  'reticulum-rnode-sf','reticulum-rnode-cr','reticulum-transport-enable'];
const nodes=Object.fromEntries(ids.map(id=>[id,{value:'',checked:false}]));
Object.assign(nodes['reticulum-rnode-frequency'],{value:'915'});
Object.assign(nodes['reticulum-rnode-bandwidth'],{value:'125'});
Object.assign(nodes['reticulum-rnode-txpower'],{value:'7'});
Object.assign(nodes['reticulum-rnode-sf'],{value:'8'});
Object.assign(nodes['reticulum-rnode-cr'],{value:'5'});
const section=js.slice(js.indexOf('  function rnodeStartOptions(){'),
  js.indexOf("  el('reticulum-enable').addEventListener"));
const ctx={nodes};
vm.runInNewContext(`const el=id=>globalThis.nodes[id]; ${section}
  globalThis.options=rnodeStartOptions;`,ctx);
assert.equal(JSON.stringify(ctx.options()),JSON.stringify({tcp_enabled:false}));
nodes['reticulum-rnode-activate'].checked=true;
assert.throws(()=>ctx.options(),/Select an inventoried USB RNode candidate/);
nodes['reticulum-rnode-port'].value='/dev/ttyUSB1';
const enabled=ctx.options();
assert.deepEqual(JSON.parse(JSON.stringify(enabled)),{
  tcp_enabled:false,rnode:{port:'/dev/ttyUSB1',frequency:915000000,bandwidth:125000,
    txpower:7,spreadingfactor:8,codingrate:5},transport_enabled:false});
nodes['reticulum-transport-enable'].checked=true;
assert.equal(ctx.options().transport_enabled,true);
nodes['reticulum-rnode-frequency'].value='868';
assert.throws(()=>ctx.options(),/902–928 MHz/);
console.log('PASS v0.2.103 passive RNode readiness, opt-in settings and relay consent');
