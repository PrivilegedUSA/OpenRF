'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
const client=fs.readFileSync('openrf/static/field_hotspot.js','utf8');
const server=fs.readFileSync('openrf/server.py','utf8');
const ids=['field-hotspot-interface','field-hotspot-ssid','field-hotspot-passphrase',
  'field-hotspot-start','field-hotspot-stop','field-hotspot-refresh',
  'field-hotspot-generate','field-hotspot-visibility','field-hotspot-status'];
for(const id of ids)assert(html.includes(`id="${id}"`),id);
assert(html.includes('/static/field_hotspot.js?v=0.2.104'));
assert(css.includes('#page-hardware > .mesh-connections-panel,') &&
       css.includes('#page-hardware > .field-network-panel,') &&
       css.includes('#page-hardware > .halow-panel{margin-top:16px;margin-bottom:16px}'));
assert(css.includes('.field-hotspot-box{min-width:0'));
assert(server.includes("'/api/network/hotspot/start'"));
assert(!client.includes('localStorage')&&!client.includes('sessionStorage'));
assert(!client.includes('innerHTML')&&!client.includes('geolocation'));
function node(tag){return {tag,value:'',textContent:'',disabled:false,children:[],listeners:{},
  classList:{contains(){return false;}},
  setAttribute(name,value){this[name]=value;},
  replaceChildren(...children){this.children=children;this.value='';},
  append(child){this.children.push(child);},
  addEventListener(name,fn){this.listeners[name]=fn;}};}
const nodes=Object.fromEntries([...ids,'page-hardware'].map(id=>[id,node('div')]));
nodes['field-hotspot-ssid'].value='OpenRF-Field';
nodes['field-hotspot-passphrase'].type='password';
nodes['field-hotspot-start'].disabled=true;
nodes['field-hotspot-stop'].disabled=true;
nodes['field-hotspot-interface'].disabled=true;
const events={};
const calls=[];
let confirmNext=false;
let status={kind:'OPT_IN_LOCAL_WIFI_HOTSPOT',network_manager_available:true,
  eligible_idle_status_not_verified:['wlan0'],managed_profile_present:false,
  active_on_adapter:false,interface:null,ssid:null};
const context={
  document:{getElementById:id=>nodes[id],createElement:node,
    addEventListener:(event,handler)=>{events[event]=handler;}},
  window:{confirm:()=>confirmNext},
  crypto:{getRandomValues:array=>{for(let i=0;i<array.length;i++)array[i]=i+1;return array;}},
  fetch:async(path,options)=>{
    calls.push({path,options});
    if(path.endsWith('/start')){
      const body=JSON.parse(options.body);
      assert.equal(body.confirm,true);
      assert.equal(body.interface,'wlan0');
      assert.equal(body.ssid,'OpenRF-Field');
      assert(body.passphrase.length>=12);
      status={...status,managed_profile_present:true,active_on_adapter:true,
        interface:body.interface,ssid:body.ssid};
    }else if(path.endsWith('/stop')){
      assert.equal(JSON.parse(options.body).confirm,true);
      status={...status,managed_profile_present:false,active_on_adapter:false,
        interface:null,ssid:null};
    }
    return {ok:true,json:async()=>status};
  }
};
vm.runInNewContext(client,context);
(async()=>{
  assert.equal(calls.length,0,'No background network actions on loading JS');
  assert.equal(nodes['field-hotspot-start'].disabled,true);
  await events['openrf:hardware-shown']();
  assert.deepEqual(calls.map(x=>x.path),['/api/network/hotspot/status']);
  assert.equal(nodes['field-hotspot-interface'].value,'wlan0');
  assert.equal(nodes['field-hotspot-start'].disabled,false);
  nodes['field-hotspot-generate'].listeners.click();
  assert(nodes['field-hotspot-passphrase'].value.length>=22);
  nodes['field-hotspot-visibility'].listeners.click();
  assert.equal(nodes['field-hotspot-passphrase'].type,'text');
  nodes['field-hotspot-visibility'].listeners.click();
  assert.equal(nodes['field-hotspot-passphrase'].type,'password');
  await nodes['field-hotspot-start'].listeners.click();
  assert.equal(calls.length,1,'Canceling confirmation sends zero POST requests');
  confirmNext=true;
  await nodes['field-hotspot-start'].listeners.click();
  assert.equal(calls[1].path,'/api/network/hotspot/start');
  assert.equal(calls[1].options.method,'POST');
  assert.equal(nodes['field-hotspot-start'].disabled,true);
  assert.equal(nodes['field-hotspot-stop'].disabled,false);
  assert.match(nodes['field-hotspot-status'].textContent,/ACTIVE/);
  assert(!nodes['field-hotspot-status'].textContent.includes(nodes['field-hotspot-passphrase'].value),
    'Password never shown in status');
  await nodes['field-hotspot-stop'].listeners.click();
  assert.equal(calls[2].path,'/api/network/hotspot/stop');
  assert.equal(nodes['field-hotspot-passphrase'].value,'');
  assert.equal(nodes['field-hotspot-stop'].disabled,true);
  status={...status,eligible_idle_status_not_verified:[]};
  await nodes['field-hotspot-refresh'].listeners.click();
  assert.equal(nodes['field-hotspot-start'].disabled,true);
  assert.match(nodes['field-hotspot-status'].textContent,/No Linux-visible ordinary Wi-Fi adapter/);
  console.log('PASS v0.2.104 opt-in hotspot UI, consent, spacing, password hygiene');
})().catch(err=>{console.error(err);process.exitCode=1;});
