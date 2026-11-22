'use strict';
// The two newer messaging tab controllers must move—not replace—live UI nodes.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
const code=fs.readFileSync('openrf/static/messaging-tabs.js','utf8');
assert(html.includes('/static/messaging-tabs.js?v='));
assert(html.includes('id="mesh-nav-item" data-page="messages" type="button"><span class="nav-label">Meshtastic</span>'));
assert(html.includes('data-page="messages">Meshtastic'));
assert(html.includes('id="meshcore-contact-directory"'));
assert(css.includes('.messaging-tab-panel[hidden]'));
assert(!code.includes('scrollIntoView('));

class Node {
  constructor(id=''){
    this.id=id;this.hidden=false;this.children=[];this.events={};
    this.attributes={};this.tabIndex=-1;this.open=false;this.scrollTop=0;this.scrollHeight=500;
  }
  append(...items){for(const item of items){
    if(item.parent){const idx=item.parent.children.indexOf(item);if(idx>=0)item.parent.children.splice(idx,1);}
    this.children.push(item);item.parent=this;}}
  setAttribute(key,value){this.attributes[key]=value;}
  addEventListener(key,fn){this.events[key]=fn;}
  focus(options){this.focusOptions=options;}
}
const elements=new Map();
function create(id){const value=new Node(id);elements.set(id,value);return value;}
const layouts={
  meshtastic:{parent:'mesh-panel',groups:{dashboard:['mesh-dashboard-title','mesh-status','mesh-dashboard-intro','mesh-device-settings','mesh-history-settings'],inbox:['mesh-inbox-heading','mesh-read-actions','mesh-chat-grid'],contacts:['mesh-node-directory']},messages:'mesh-messages'},
  meshcore:{parent:'meshcore-panel',groups:{dashboard:['meshcore-dashboard-title','meshcore-status','meshcore-device-settings','meshcore-privacy-note'],inbox:['meshcore-inbox-heading','meshcore-read-actions','meshcore-layout'],contacts:['meshcore-contact-directory']},messages:'meshcore-messages'}
};
for (const layout of Object.values(layouts)) {
  for (const id of Object.values(layout.groups).flat()) {
    assert(html.includes(`id="${id}"`),`Actual page must expose movable ${id}`);
  }
}
for(const [key,layout] of Object.entries(layouts)){
  create(`${key}-tabs`);
  for(const tab of ['dashboard','inbox','contacts'])create(`${key}-tab-${tab}`);
  const parent=create(layout.parent);
  for(const id of Object.values(layout.groups).flat())parent.append(create(id));
  create(layout.messages);
}
const doc={getElementById:id=>elements.get(id)||null,createElement:()=>new Node()};
const context={document:doc,window:{}};
vm.runInNewContext(code,context);
for(const [key,layout] of Object.entries(layouts)){
  const controller=context.window.OpenRFMessagingTabs[key];
  const parent=elements.get(layout.parent);
  assert.equal(controller.current(),'dashboard');
  assert.deepEqual(parent.children.map(item=>item.id),
    ['dashboard','inbox','contacts'].map(name=>`${key}-tab-panel-${name}`));
  const sections=Object.fromEntries(parent.children.map(item=>[item.id.split('-').at(-1),item]));
  for(const [category,ids] of Object.entries(layout.groups)){
    assert.deepEqual(sections[category].children.map(item=>item.id),ids);
    assert.equal(sections[category].hidden,category!=='dashboard');
  }
  const inbox=elements.get(`${key}-tab-inbox`);
  inbox.events.click();
  assert.equal(controller.current(),'inbox');
  assert.equal(sections.inbox.hidden,false);
  assert.equal(elements.get(layout.messages).scrollTop,500);
  assert.equal(inbox.attributes['aria-selected'],'true');
  assert.equal(inbox.tabIndex,0);
  let prevented=false;
  inbox.events.keydown({key:'ArrowRight',preventDefault(){prevented=true;}});
  assert(prevented);
  assert.equal(controller.current(),'contacts');
  assert.equal(elements.get(`${key}-tab-contacts`).focusOptions.preventScroll,true);
  controller.open('dashboard');
  assert.equal(controller.current(),'dashboard');
}
assert.equal(elements.get('mesh-node-directory').open,true,'Contacts panel opens Meshtastic directory');
assert.equal(elements.get('mesh-device-settings').open,true,'Meshtastic connection controls are accessible');
assert.equal(elements.get('meshcore-device-settings').open,false,'Test double retains original state; live HTML defaults it open');
console.log('PASS v0.2.174 unified Meshtastic/MeshCore navigation, preserved nodes, scroll and keyboard');
