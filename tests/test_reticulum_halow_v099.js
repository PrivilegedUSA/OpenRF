'use strict';
// v0.2.104: manual IP interface selection never connects a HaLow radio.
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
const js=fs.readFileSync('openrf/static/reticulum.js','utf8');
const panel=fs.readFileSync('openrf/static/wifi_halow.js','utf8');
for(const id of ['reticulum-halow-panel','reticulum-halow-refresh','reticulum-halow-status',
  'reticulum-halow-activate','reticulum-halow-device'])
  assert(html.includes(`id="${id}"`),id);
assert(html.includes('IPv6 link-local')&&html.includes('may send IPv6 multicast/UDP'));
assert(css.includes('.reticulum-halow-choice{display:grid'));
assert(panel.includes('reticulum_opt_in_eligible'));
assert(js.includes("'/api/wifi-halow/status'"));
assert(js.includes('window.confirm(`Start Reticulum AutoInterface on'));
assert(!js.includes('innerHTML')&&!panel.includes('innerHTML'));

// Older RNode options must remain valid without a HaLow selection.
const nodes={
  'reticulum-tcp-enable':{checked:false},
  'reticulum-rnode-activate':{checked:false},
  'reticulum-halow-activate':{checked:false},
  'reticulum-halow-device':{value:''},
};
const snippet=js.slice(js.indexOf('  function rnodeStartOptions(){'),
  js.indexOf("  el('reticulum-enable').addEventListener"));
const context={nodes};
vm.runInNewContext(`const el=id=>globalThis.nodes[id]; ${snippet}
  globalThis.options=rnodeStartOptions;`,context);
assert.equal(JSON.stringify(context.options()),JSON.stringify({tcp_enabled:false}));
nodes['reticulum-halow-activate'].checked=true;
assert.throws(()=>context.options(),/Check HaLow readiness/);
nodes['reticulum-halow-device'].value='wlan1';
assert.equal(JSON.stringify(context.options()),
  JSON.stringify({tcp_enabled:false,halow_device:'wlan1'}));
nodes['reticulum-tcp-enable'].checked=true;
assert.equal(context.options().tcp_enabled,true,'Existing separate TCP option preserved');
nodes['reticulum-halow-device'].value='wlan1,eth0';
assert.throws(()=>context.options(),/Check HaLow readiness/);

const preflightSnippet=js.slice(js.indexOf('  async function refreshHaLowReadiness(){'),
  js.indexOf('  function rnodeStartOptions(){'));
assert(preflightSnippet.includes('reticulum_opt_in_eligible===true'));
assert(!preflightSnippet.includes("'/api/reticulum/start'"));
console.log('PASS v0.2.104 HaLow opt-in selector and separated Reticulum controls');
