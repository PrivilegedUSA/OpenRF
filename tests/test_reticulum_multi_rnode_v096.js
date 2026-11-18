'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const js=fs.readFileSync('openrf/static/reticulum.js','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
for(const id of ['reticulum-rnode-second-activate','reticulum-rnode-second-fields',
  'reticulum-rnode-port-2','reticulum-rnode-frequency-2','reticulum-rnode-bandwidth-2',
  'reticulum-rnode-txpower-2','reticulum-rnode-sf-2','reticulum-rnode-cr-2',
  'reticulum-traffic-summary'])
  assert(html.includes(`id="${id}"`),id);
assert(css.includes('#reticulum-rnode-second-fields[hidden]{display:none!important}'));
assert(js.includes('Since previous check: +'));
assert(js.includes('Counter changes show local activity only'));
assert(!js.includes('innerHTML'));
const fields=['port','frequency','bandwidth','txpower','sf','cr'];
const values=['/dev/ttyUSB0','915','125','7','8','5'];
const nodes={'reticulum-tcp-enable':{checked:false},
  'reticulum-rnode-activate':{checked:true},
  'reticulum-rnode-second-activate':{checked:false},
  'reticulum-transport-enable':{checked:false}};
fields.forEach((name,i)=>{
  nodes[`reticulum-rnode-${name}`]={value:values[i]};
  nodes[`reticulum-rnode-${name}-2`]={value:['/dev/ttyACM1','916','62.5','3','10','7'][i]};
});
const snippet=js.slice(js.indexOf('  function rnodeStartOptions(){'),
  js.indexOf("  el('reticulum-enable').addEventListener"));
const ctx={nodes};
vm.runInNewContext(`const el=id=>globalThis.nodes[id]; ${snippet}
  globalThis.options=rnodeStartOptions;`,ctx);
assert.equal(ctx.options().rnode.port,'/dev/ttyUSB0');
assert.equal(ctx.options().rnodes,undefined,'One radio preserves the v0.2.104 API contract');
nodes['reticulum-rnode-second-activate'].checked=true;
const prepared=JSON.parse(JSON.stringify(ctx.options()));
assert.deepEqual(prepared.rnodes,[
  {port:'/dev/ttyUSB0',frequency:915000000,bandwidth:125000,txpower:7,spreadingfactor:8,codingrate:5},
  {port:'/dev/ttyACM1',frequency:916000000,bandwidth:62500,txpower:3,spreadingfactor:10,codingrate:7}
]);
assert.equal(prepared.rnode,undefined);
nodes['reticulum-rnode-port-2'].value='/dev/ttyUSB0';
assert.throws(()=>ctx.options(),/two different physical USB ports/);
nodes['reticulum-rnode-port-2'].value='/dev/ttyACM1';
nodes['reticulum-rnode-frequency-2'].value='868';
assert.throws(()=>ctx.options(),/902–928 MHz/);
function element(){return {children:[],textContent:'',className:'',
  classList:{toggle(){}},append(...items){this.children.push(...items);},
  replaceChildren(...items){this.children=[...items];}};}
const diagNodes=Object.fromEntries([
  'reticulum-interfaces','reticulum-announce-detail','reticulum-tcp-instructions',
  'reticulum-connection-brief','reticulum-traffic-summary'].map(id=>[id,element()]));
const diagSnippet=js.slice(js.indexOf('  const shown='),js.indexOf('  async function refreshDiagnostics(){'));
const diagCtx={diagNodes,document:{createElement:element}};
vm.runInNewContext(`const el=id=>globalThis.diagNodes[id]; ${diagSnippet}
  globalThis.renderDiagnostics=renderDiagnostics;`,diagCtx);
const stats=(rx,tx)=>({active:true,available:true,tcp_requested:false,interfaces:[
  {name:'OpenRF Optional USB RNode',up:true,reachable_peers:0,
    connected_clients:0,rx_bytes:rx,tx_bytes:tx}]});
diagCtx.renderDiagnostics(stats(100,40));
assert.match(diagNodes['reticulum-traffic-summary'].textContent,/No comparable previous counters/);
diagCtx.renderDiagnostics(stats(112,70));
assert.match(diagNodes['reticulum-traffic-summary'].textContent,/Compared 1 interface/);
assert.match(diagNodes['reticulum-interfaces'].children[1].children[3].textContent,
  /\+12 received \/ \+30 sent bytes/);
diagCtx.renderDiagnostics(stats(2,1));
assert.match(diagNodes['reticulum-traffic-summary'].textContent,/No comparable previous counters/,
  'Counter reset must not show a negative or invented packet rate');
diagCtx.renderDiagnostics({active:false,available:false,interfaces:[]});
assert.match(diagNodes['reticulum-traffic-summary'].textContent,/No live counters/);
console.log('PASS v0.2.104 distinct USB RNodes and honest interface diagnostics');
