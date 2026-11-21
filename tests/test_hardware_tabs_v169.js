'use strict';
// UI grouping of existing controls must preserve nodes and never cause radio actions.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
const js=fs.readFileSync('openrf/static/hardware-tabs.js','utf8');
const groups={
  dashboard:['hardware-manager-panel','hardware-cards','wifi-driver-status'],
  radios:['mesh-connections-panel','field-network-panel','halow-panel'],
  sensors:['hardware-inventory-panel','sensor-registry-panel','usb-sensor-panel'],
  system:['hardware-readiness-panel','hardware-environment-panel'],
};
const names=Object.keys(groups);
assert(html.includes('/static/hardware-tabs.js?v=0.2.169'));
assert(html.includes('id="page-hardware"'));
for(const group of names){
  assert(html.includes(`id="hardware-tab-${group}"`));
  assert(html.includes(`aria-controls="hardware-panel-${group}"`));
}
for(const id of Object.values(groups).flat())assert(html.includes(`id="${id}"`),`missing movable ${id}`);
assert(css.includes('#page-hamradio > .panel + .panel,#page-sessions > .panel + .panel{margin-top:16px}'));
assert(css.includes('.hardware-tab-panel[hidden]'));
assert(css.includes('.hardware-tab-panel > .panel{min-width:0;margin-top:0;margin-bottom:16px}'));
assert(!/scrollIntoView\(|fetch\(|WebSocket\(|\.click\(\)/.test(js),'no network or auto-device actions');

class Node {
  constructor(id=''){
    this.id=id;this.hidden=false;this.children=[];this.events={};this.attributes={};
    this.tabIndex=-1;this.value='user draft';this.scrollTop=13;
  }
  append(...nodes){for(const n of nodes){
    if(n.parent){const old=n.parent.children.indexOf(n);if(old>=0)n.parent.children.splice(old,1);}
    n.parent=this;this.children.push(n);
  }}
  setAttribute(key,value){this.attributes[key]=value;}
  addEventListener(key,fn){this.events[key]=fn;}
  focus(options){this.focusOptions=options;}
}
const nodes=new Map();
function item(id){const n=new Node(id);nodes.set(id,n);return n;}
const parent=item('page-hardware');item('hardware-tabs');
for(const name of names)item(`hardware-tab-${name}`);
for(const id of Object.values(groups).flat())parent.append(item(id));
const original=Object.fromEntries([...nodes].map(([id,n])=>[id,n]));
const context={document:{getElementById:id=>nodes.get(id)||null,createElement:()=>new Node()},window:{}};
vm.runInNewContext(js,context);
const controller=context.window.OpenRFHardwareTabs;
assert(controller, 'controller initialized from original elements');
assert.equal(controller.current(),'dashboard');
assert.deepEqual(parent.children.map(n=>n.id),names.map(name=>`hardware-panel-${name}`));
for(const name of names){
  const panel=nodes.get(`hardware-panel-${name}`); // Dynamically created nodes aren't in lookup, use parent.
  const live=parent.children.find(n=>n.id===`hardware-panel-${name}`);
  assert(live);
  assert.deepEqual(live.children.map(n=>n.id),groups[name]);
  assert.equal(live.hidden,name!=='dashboard');
  for(const node of live.children)assert.strictEqual(node,original[node.id],`${node.id} was moved, not copied`);
}
nodes.get('hardware-tab-radios').events.click();
assert.equal(controller.current(),'radios');
assert.equal(nodes.get('hardware-tab-radios').attributes['aria-selected'],'true');
assert.equal(nodes.get('hardware-tab-radios').tabIndex,0);
let prevented=false;
nodes.get('hardware-tab-radios').events.keydown({key:'ArrowRight',preventDefault(){prevented=true;}});
assert(prevented);
assert.equal(controller.current(),'sensors');
assert.equal(nodes.get('hardware-tab-sensors').focusOptions.preventScroll,true);
controller.open('system');
assert.equal(controller.current(),'system');
assert.equal(original['usb-sensor-panel'].value,'user draft','existing fields keep state');
console.log('PASS v0.2.169 Hardware tabs, existing control preservation, 16px card gaps, keyboard');
