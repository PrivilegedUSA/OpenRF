'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
const js=fs.readFileSync('openrf/static/reticulum.js','utf8');
const hotspot=fs.readFileSync('openrf/field_hotspot.py','utf8');
for(const id of ['reticulum-peer-enable','reticulum-peer-host','reticulum-peer-port',
  'reticulum-tcp-port','reticulum-tcp-enable'])
  assert(html.includes(`id="${id}"`),id);
assert(html.includes('OFF by default'));
assert(css.includes('.reticulum-peer-fields')&&css.includes('grid-template-columns:minmax(0,1fr)'));
assert(hotspot.includes("'ipv6.method', 'link-local'"), 'RNS AutoInterface needs link-local IPv6');
assert(js.includes('window.confirm(`Attempt outbound Reticulum TCP connection to'));
assert(!js.includes('location.reload()'));
const nodes={
  'reticulum-tcp-enable':{checked:false},
  'reticulum-tcp-port':{value:'4242'},
  'reticulum-peer-enable':{checked:false},
  'reticulum-peer-host':{value:'127.0.0.1'},
  'reticulum-peer-port':{value:'4242'},
  'reticulum-rnode-activate':{checked:false},
  'reticulum-halow-activate':{checked:false},
  'reticulum-halow-device':{value:''},
};
const snippet=js.slice(js.indexOf('  function rnodeStartOptions(){'),
  js.indexOf('  async function act('));
const ctx={nodes};
vm.runInNewContext(`const el=id=>globalThis.nodes[id]; ${snippet}
  globalThis.options=rnodeStartOptions;`,ctx);
assert.equal(JSON.stringify(ctx.options()),JSON.stringify({tcp_enabled:false}),'No TCP peer by default');
nodes['reticulum-peer-enable'].checked=true;
assert.equal(JSON.stringify(ctx.options()),JSON.stringify({tcp_enabled:false,
  tcp_peer:{host:'127.0.0.1',port:4242,confirm:true}}));
nodes['reticulum-peer-host'].value='192.168.2.5';
nodes['reticulum-peer-port'].value='4650';
nodes['reticulum-tcp-enable'].checked=true;
nodes['reticulum-tcp-port'].value='4651';
assert.equal(JSON.stringify(ctx.options()),JSON.stringify({tcp_enabled:true,tcp_listen_port:4651,
  tcp_peer:{host:'192.168.2.5',port:4650,confirm:true}}));
nodes['reticulum-peer-host'].value='example.com';
assert.throws(()=>ctx.options(),/numeric private IPv4/);
nodes['reticulum-peer-host'].value='127.0.0.1';
nodes['reticulum-peer-port'].value='0';
assert.throws(()=>ctx.options(),/numeric private IPv4/);
nodes['reticulum-peer-port'].value='4242';
nodes['reticulum-tcp-port'].value='22';
assert.throws(()=>ctx.options(),/TCP listener port/);
console.log('PASS v0.2.103 opt-in two-node TCP controls and IPv6 link-local integration');
