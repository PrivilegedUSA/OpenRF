'use strict';
// v0.2.30: interactive, headless DOM simulation of map autocomplete.
// This tests event ordering and selection, not just presence of CSS strings.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../openrf/static/app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../openrf/static/index.html'),'utf8');
assert.match(html,/id="map-destination-query"[^>]*type="search"/);
assert.match(html,/id="map-destination-query"[^>]*autocomplete="off"/);
assert(!/id="map-destination-query"[^>]*\slist=/.test(html),'no Firefox native datalist on search');
assert(html.indexOf('id="map-maptiler-key"')>html.indexOf('</form>',html.indexOf('id="map-destination-form"')),
  'the password field must not share a form with destination search');
const start=source.indexOf('function hideMapAddressMatches() {');
const end=source.indexOf("$('map-online-address').addEventListener('change'",start);
assert(start>0 && end>start);
let index=0;
class FakeElement {
  constructor(tag='div') {
    this.tag=tag;this.hidden=false;this.children=[];this.attrs={};
    this.listeners={};this.value='';this.textContent='';this.checked=false;
  }
  addEventListener(type,callback){ (this.listeners[type]??=[]).push(callback); }
  dispatchEvent(ev){const type=ev.type;for(const fn of (this.listeners[type]||[]))fn(ev);}
  click(){this.dispatchEvent({type:'click'});}
  replaceChildren(...nodes){this.children=nodes;}
  append(node){this.children.push(node);}
  querySelectorAll(sel){return this.children.filter(e=>e.className===sel.slice(1));}
  querySelector(sel){return this.querySelectorAll(sel)[0]||null;}
  setAttribute(key,value){this.attrs[key]=String(value);}
  getAttribute(key){return this.attrs[key]??null;}
  removeAttribute(key){delete this.attrs[key];}
  scrollIntoView(){}
}
const nodes={
  'map-destination-query':new FakeElement('input'),
  'map-address-options':new FakeElement(),
  'map-online-address':new FakeElement('input'),
};
const $=id=>{assert(nodes[id],`missing ${id}`);return nodes[id];};
const doc={createElement:tag=>new FakeElement(tag)};
const state={navDestinations:[{name:'Home Base',latitude:38.4,longitude:-120.7}],
  navSearchToken:0,navSearchCredit:'',navSelectedAddress:null};
const navAddressCache=new Map();
const timers=new Map();
let timerCounter=0;
function setTimeoutMock(fn,delay){const id=++timerCounter;timers.set(id,{fn,delay});return id;}
function clearTimeoutMock(id){timers.delete(id);}
async function flushTimers(){for(const [id,task] of [...timers.entries()]){
  timers.delete(id);await task.fn();
}}
const calls=[];
const status=[];
let reply={results:[],attribution:'U.S. Census Bureau'};
const api=async url=>{calls.push(url);return reply;};
const addressProviderInfo={local_photon:false,maptiler_configured:false};
const make=Function('$','state','navAddressCache','addressProviderInfo','api','addressLookupUrl',
  'setMapDestinationStatus','document','setTimeout','clearTimeout',
  `${source.slice(start,end)};return {showMapAddressMatches,navigationSuggestionDelay,navigationLookupIsComplete}`);
const lookup=(q,final=false,auto=false)=>`/api/navigation/geocode?q=${encodeURIComponent(q)}&online=1${auto?'&mode=auto':(final?'&mode=final':'')}`;
const {navigationLookupIsComplete,navigationSuggestionDelay}=make($,state,navAddressCache,
  addressProviderInfo,api,lookup,(msg,kind)=>status.push([msg,kind]),doc,setTimeoutMock,clearTimeoutMock);
const input=nodes['map-destination-query'];
const box=nodes['map-address-options'];
async function main(){
  assert.equal(navigationLookupIsComplete('25005 State Hwy 88, Pioneer, CA'),true);
  assert.equal(navigationLookupIsComplete('25005 State Hwy 88, Pioneer'),false);
  assert.equal(navigationLookupIsComplete('25'),false);
  assert.equal(navigationSuggestionDelay({maptiler_configured:true},'Main'),450);
  // Offline saved destination suggests immediately, without network.
  input.value='Home';input.dispatchEvent({type:'input'});
  assert.equal(box.hidden,false);
  assert.equal(box.querySelectorAll('.address-option').length,1);
  assert.equal(calls.length,0);
  // Incomplete numeric address does not call Photon or Census at all.
  input.value='25005 State Hwy 88, Pioneer';input.dispatchEvent({type:'input'});
  await flushTimers();
  assert.equal(calls.length,0);
  assert.equal(box.hidden,true);
  // Opt-in is mandatory, even for a completed address.
  input.value='25005 State Hwy 88, Pioneer, CA';input.dispatchEvent({type:'input'});
  await flushTimers();assert.equal(calls.length,0);
  nodes['map-online-address'].checked=true;
  reply={results:[{name:'25005 STATE HWY 88, PIONEER, CA, 95666',longitude:-120.622,latitude:38.488,source:'us-census-opt-in',accuracy_note:'Approximate address-range geocode'}],
         attribution:'U.S. Census Bureau / TIGER address ranges'};
  input.dispatchEvent({type:'input'});
  assert.equal(box.hidden,true,'network results must not appear before response');
  await flushTimers();
  assert.equal(calls.length,1);
  assert.match(calls[0],/mode=auto/);
  assert.equal(box.hidden,false,'Census suggestion should appear while typing, before pressing Start');
  assert.equal(input.getAttribute('aria-expanded'),'true');
  assert.match(box.querySelectorAll('.address-option')[0].textContent,/25005 STATE HWY/);
  const ev={type:'keydown',key:'ArrowDown',preventDefault(){this.prevented=true;}};
  input.dispatchEvent(ev);
  assert.equal(ev.prevented,true);
  assert.equal(box.querySelectorAll('.address-option')[0].getAttribute('aria-selected'),'true');
  input.dispatchEvent({type:'keydown',key:'Enter',preventDefault(){}});
  assert.equal(state.navSelectedAddress.name,'25005 STATE HWY 88, PIONEER, CA, 95666');
  assert.deepEqual(state.navSelectedAddress.coordinates,[-120.622,38.488]);
  assert(status.some(line=>line[0].includes('Approximate Census address-range')), 'selection explains positional uncertainty');
  assert.equal(box.hidden,true);
  assert.equal(input.getAttribute('aria-expanded'),'false');
  assert.equal(navAddressCache.has(state.navSelectedAddress.name),true);
  // Editing selection invalidates its coordinate binding.
  input.value='25005 STATE HWY 88, PIONEER, CA, 9566';input.dispatchEvent({type:'input'});
  assert.equal(state.navSelectedAddress,null);
  assert.equal(box.hidden,true);
  console.log('v0.2.30 live input, offline saved matches, consent, Census before Start, keyboard selection, and password-form isolation passed.');
}
main().catch(err=>{console.error(err);process.exitCode=1;});
