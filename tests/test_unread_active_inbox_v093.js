'use strict';
// A live incoming message is unread even if its inbox is the active page.
// Only a deliberate acknowledgement should clear the channel's badge.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
const mesh=fs.readFileSync('openrf/static/mesh.js','utf8');
const reticulum=fs.readFileSync('openrf/static/reticulum.js','utf8');
for(const id of ['mesh-mark-read','reticulum-mark-read','mesh-inbox-unread','reticulum-inbox-unread'])
  assert(html.includes(`id="${id}"`));
assert(mesh.includes("document.addEventListener('openrf:messages-shown',async()=>{"));
assert(reticulum.includes("document.addEventListener('openrf:reticulum-shown',async()=>{"));
assert(css.includes('body.map-workspace.has-message-unread .topbar .header-messages-menu{display:flex!important;'));

function fixture(source,type,sessionStorage){
  const nodes={},notices=[],notes=[],viewing=true,bodyClasses=new Set();
  const make=()=>({textContent:'',hidden:true,disabled:true,events:{},title:'',
    classList:{contains:()=>viewing,toggle(){}},
    addEventListener(event,handler){this.events[event]=handler;},
    setAttribute(name,value){this[name]=value;}});
  for(const id of ['mesh-mark-read','reticulum-mark-read','mesh-inbox-unread',
    'reticulum-inbox-unread','mesh-header-unread','mesh-nav-unread',
    'reticulum-nav-unread','mesh-header-mesh-unread','mesh-header-reticulum-unread',
    'mesh-header-button','messages-nav-toggle','mesh-nav-item','reticulum-nav-item',
    'mesh-global-announcer','page-messages','page-reticulum'])
    nodes[id]=make();
  const context={nodes,notices,notes,bodyClasses,window:{sessionStorage},document:{
    body:{classList:{contains:()=>false,toggle(name,enabled){
      if(enabled)bodyClasses.add(name);else bodyClasses.delete(name);}}},
    dispatchEvent(event){notices.push({type:event.type,count:event.detail.count});}},
    CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}}};
  const beginning=source.slice(source.indexOf('  const unreadKey='),source.indexOf('  const viewingMessages='));
  const tracking=source.slice(source.indexOf('  const viewingMessages='),source.indexOf('  const note='));
  const hook=type==='mesh'
    ?source.slice(source.indexOf("  el('mesh-mark-read').addEventListener"),
      source.indexOf("  el('mesh-serial').addEventListener"))
    :source.slice(source.indexOf("  el('reticulum-mark-read').addEventListener"),
      source.indexOf("  document.addEventListener('openrf:reticulum-shown'"));
  vm.runInNewContext(`const el=id=>globalThis.nodes[id];
    const note=text=>globalThis.notes.push(text);
    ${beginning}
    ${tracking}
    ${hook}
    globalThis.track=trackInbox;
    globalThis.stateForTest=state;`,context);
  return {context,nodes,notices,notes,button:nodes[type==='mesh'?'mesh-mark-read':'reticulum-mark-read']};
}
for(const [type,source] of [['mesh',mesh],['reticulum',reticulum]]){
  const memory=new Map(),storage={
    getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value)};
  const run=fixture(source,type,storage);
  run.context.track({receive_sequence:50}); // Establish genuine inbound baseline.
  run.context.track({receive_sequence:51});
  assert.equal(run.context.stateForTest.unread,1,`${type}: new message counts on active page`);
  assert.equal(run.button.disabled,false,`${type}: Mark read becomes available`);
  run.context.track({receive_sequence:53});
  assert.equal(run.context.stateForTest.unread,3,`${type}: further active-page receipts add up`);
  if(type==='mesh')assert(run.context.bodyClasses.has('has-message-unread'),
    'The map only reveals its header envelope while messages are unread');
  run.context.track({receive_sequence:53}); // Poll or outgoing send.
  assert.equal(run.context.stateForTest.unread,3,`${type}: no duplicated counter`);
  const persisted=fixture(source,type,storage);
  assert.equal(persisted.context.stateForTest.unread,3,`${type}: active-page unread survives refresh`);
  persisted.context.track({receive_sequence:53});
  assert.equal(persisted.context.stateForTest.unread,3);
  persisted.button.events.click();
  assert.equal(persisted.context.stateForTest.unread,0,`${type}: only explicit click clears`);
  if(type==='mesh')assert(!persisted.context.bodyClasses.has('has-message-unread'),
    'Map envelope becomes unobtrusive again after acknowledgment');
  assert.equal(persisted.button.disabled,true,`${type}: Mark read disabled after acknowledgment`);
  assert.match(persisted.notes.at(-1),/marked as read/);
  const afterClear=fixture(source,type,storage);
  assert.equal(afterClear.context.stateForTest.unread,0,`${type}: acknowledged state survives refresh`);
  afterClear.context.track({receive_sequence:54});
  assert.equal(afterClear.context.stateForTest.unread,1,`${type}: later active-page message is newly unread`);
}
console.log('PASS v0.2.104 active-page unread badges, explicit acknowledgement, persistence');
