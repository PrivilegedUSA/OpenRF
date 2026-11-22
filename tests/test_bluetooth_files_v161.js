'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
const source=fs.readFileSync('openrf/static/bluetooth-files.js','utf8');
const server=fs.readFileSync('openrf/server.py','utf8');

for(const id of ['bluetooth-file-panel','bluetooth-local-address','bluetooth-expected-peer',
  'bluetooth-destination','bluetooth-file-picker','bluetooth-send-form','bluetooth-send',
  'bluetooth-arm','bluetooth-cancel','bluetooth-refresh','bluetooth-file-transfers',
  'bluetooth-file-notice','bluetooth-receive-state'])
  assert(html.includes(`id="${id}"`),`Missing Bluetooth UI ${id}`);
assert(html.includes('/static/bluetooth-files.js?v='));
assert(css.includes('.bluetooth-file-grid'));
assert(server.includes("'/static/bluetooth-files.js'"));
assert(server.includes("'X-OpenRF-Bluetooth-Consent'"));
assert(!source.includes('innerHTML'),'Never interpolate untrusted peer names into HTML');
assert(source.includes('window.confirm(`Receive ONE Bluetooth file'));
assert(source.includes('window.confirm(`Send ${file.name}'));

const elements=new Map(), requests=[], handlers=new Map();
const node=id=>{
  if(elements.has(id))return elements.get(id);
  const item={id,hidden:false,disabled:false,open:false,value:'',files:[],textContent:'',style:{},
    classList:{contains:()=>id==='page-reticulum',toggle(){}},
    addEventListener(type,handler){handlers.set(`${id}:${type}`,handler);},
    replaceChildren(){this.children=[];},append(...children){this.children.push(...children);},
    children:[],setAttribute(name,value){this[name]=value;}};
  elements.set(id,item);return item;
};
const report={supported:true,local_address:'AA:BB:CC:DD:EE:10',receive_seconds:0,
  receive_peer:null,busy:false,transfers:[],inbox:null};
const fakeFetch=async(url,options)=>{
  requests.push({url,options});
  const action=url.rsplit?url.rsplit('/') : url.split('/').pop();
  const result=action==='status'?report:
    {status:'CONNECTING_NOT_DELIVERED',note:'Awaiting peer acknowledgement'};
  return {ok:true,json:async()=>result};
};
let confirms=0;
class FakeReader{
  readAsDataURL(file){this.result='data:application/octet-stream;base64,'+
    Buffer.from(file.bytes).toString('base64');this.onload();}
}
const context={document:{getElementById:node,createElement:tag=>({tagName:tag,
  style:{},className:'',textContent:'',children:[],append(...parts){this.children.push(...parts);},
  addEventListener(type,handler){this.handler=handler;}})},
  window:{confirm:()=>{confirms++;return true;}},fetch:fakeFetch,FileReader:FakeReader,
  setInterval:()=>1,Buffer,console};
vm.runInNewContext(source,context);
assert.equal(requests.length,0,'Opening OpenRF must never auto-scan or open a Bluetooth listener');
node('bluetooth-file-panel').open=true;
handlers.get('bluetooth-file-panel:toggle')();
const settle=()=>new Promise(resolve=>setTimeout(resolve,10));
(async()=>{
  await settle();
  assert.equal(requests.length,1,'Opening transfer section performs read-only status only');
  assert.equal(requests[0].url,'/api/bluetooth/status');
  assert.equal(node('bluetooth-local-address').textContent,'AA:BB:CC:DD:EE:10');
  node('bluetooth-expected-peer').value='AA:BB:CC:DD:EE:01';
  handlers.get('bluetooth-expected-peer:input')();
  assert.equal(node('bluetooth-arm').disabled,false);
  handlers.get('bluetooth-arm:click')();
  await settle();
  const arm=requests.find(x=>x.url==='/api/bluetooth/arm');
  assert(arm);
  assert.equal(arm.options.headers['X-OpenRF-Bluetooth-Consent'],'arm');
  assert.deepEqual(JSON.parse(arm.options.body),{
    address:'AA:BB:CC:DD:EE:01',confirm:true});
  node('bluetooth-destination').value='AA:BB:CC:DD:EE:02';
  node('bluetooth-file-picker').files=[{name:'trip.pdf',size:8,bytes:Buffer.from('12345678')}];
  handlers.get('bluetooth-destination:input')();
  assert.equal(node('bluetooth-send').disabled,false);
  const submitted=handlers.get('bluetooth-send-form:submit');
  await submitted({preventDefault(){}});
  const send=requests.find(x=>x.url==='/api/bluetooth/send');
  assert(send);
  assert.equal(send.options.headers['X-OpenRF-Bluetooth-Consent'],'send');
  assert.equal(JSON.parse(send.options.body).data_base64,Buffer.from('12345678').toString('base64'));
  assert.equal(confirms,2,'Both receive and send require separate operator confirmation');
  console.log('PASS v0.2.174 Bluetooth UI: opt-in, status-only open, exact paired address, send confirmation');
})().catch(error=>{console.error(error);process.exitCode=1;});
