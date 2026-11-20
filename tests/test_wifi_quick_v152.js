'use strict';
/* v0.2.152: header placement and opt-in scan/join behavior. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('openrf/static/index.html', 'utf8');
const css = fs.readFileSync('openrf/static/app.css', 'utf8');
const source = fs.readFileSync('openrf/static/wifi-quick.js', 'utf8');
assert(html.includes('id="header-wifi-button"'));
assert(html.indexOf('id="header-emergency-shortcut"') < html.indexOf('id="header-wifi-button"'));
assert(html.indexOf('id="header-wifi-button"') < html.indexOf('id="mesh-header-button"'));
assert(html.includes('type="password"') && html.includes('id="header-wifi-connect-form"'));
assert(css.includes('body.map-workspace .topbar .header-wifi-menu'));
assert(source.includes('X-OpenRF-Wifi-Consent'));
assert(!source.includes('localStorage'));

class Element {
  constructor() {this.events={};this.hidden=true;this.disabled=false;this.dataset={};
    this.value='';this.children=[];this.textContent='';this.attrs={};}
  addEventListener(name, handler) {this.events[name]=handler;}
  setAttribute(key, value) {this.attrs[key]=value;}
  replaceChildren(...children) {this.children=children;}
  append(...children) {this.children.push(...children);}
  focus() {}
}
const ids=['header-wifi-button','header-wifi-panel','header-wifi-status','header-wifi-list',
  'header-wifi-connect-form','header-wifi-password','header-wifi-scan',
  'header-wifi-close','header-wifi-cancel','header-wifi-selected',
  'header-wifi-password-row','header-wifi-connect'];
const nodes=Object.fromEntries(ids.map(id=>[id,new Element()]));
const calls=[];
const document={getElementById:id=>nodes[id],createElement:()=>new Element(),events:{},
  addEventListener(name, handler){this.events[name]=handler;}};
const fetch=async (path,options)=>{
  calls.push({path,options});
  if(path.includes('/status'))return {ok:true,json:async()=>({available:true,connected:false,interface:'wlan0'})};
  if(path.includes('/scan'))return {ok:true,json:async()=>({networks:[
    {ssid:'HomeWiFi',security_kind:'password',security:'WPA2',band:'2.4 GHz',signal_quality_percent:72,connected:false}
  ]})};
  return {ok:true,json:async()=>({connected:true,ssid:'HomeWiFi'})};
};
vm.runInNewContext(source,{document,fetch,console,Promise});
(async()=>{
  await Promise.resolve(); await Promise.resolve();
  assert.equal(calls.length,1,'Only read-only status at startup');
  await nodes['header-wifi-button'].events.click();
  assert.equal(calls.filter(x=>x.path.includes('/scan')).length,0);
  await nodes['header-wifi-scan'].events.click();
  assert.equal(nodes['header-wifi-list'].children.length,1);
  nodes['header-wifi-list'].children[0].events.click();
  nodes['header-wifi-password'].value='secretpass';
  await nodes['header-wifi-connect-form'].events.submit({preventDefault(){}});
  const join=calls.find(x=>x.path.includes('/connect'));
  assert(join,'Explicit join should invoke a NetworkManager request');
  assert.equal(join.options.headers['X-OpenRF-Wifi-Consent'],'connect');
  assert.equal(JSON.parse(join.options.body).password,'secretpass');
  assert.equal(nodes['header-wifi-password'].value,'','Passphrase must be erased after submission');
  console.log('PASS v0.2.152 Wi-Fi quick panel placement, status, explicit scan/connect and password clearance');
})().catch(error=>{console.error(error);process.exitCode=1;});
