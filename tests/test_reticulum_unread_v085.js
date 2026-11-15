'use strict';
// Simulate two independent, genuine inbound message streams sharing the same
// header badge. No DOM network, radio, LXMF SDK or fake notification traffic.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
const mesh=fs.readFileSync('openrf/static/mesh.js','utf8');
const reticulum=fs.readFileSync('openrf/static/reticulum.js','utf8');

assert(html.includes('id="mesh-header-unread"')&&html.includes('id="mesh-nav-unread"'));
assert(html.includes('class="reticulum-tcp-label-text"'));
assert(css.includes('.reticulum-tcp-settings .switchline{width:100%;min-width:0;max-width:100%;white-space:normal;'));
assert(css.includes('.reticulum-tcp-settings .reticulum-tcp-label-text{display:block;flex:1 1 0;min-width:0;white-space:normal;'));
assert(css.includes('.reticulum-interface strong,#page-messages #reticulum-announce-detail{overflow-wrap:anywhere;white-space:normal}'));
assert(reticulum.includes("if(state.enabled&&!state.busy)refreshInbox()"),
  'Poll while another page is open, never start the backend automatically');

const nodes=Object.fromEntries(['mesh-header-unread','mesh-nav-unread','mesh-header-button','mesh-global-announcer']
  .map(id=>[id,{hidden:true,textContent:'',title:'',setAttribute(name,value){this[name]=value;}}]));
const handlers={};
const document={
  body:{classList:{contains:()=>false}},
  addEventListener(name,callback){handlers[name]=callback;},
  dispatchEvent(event){handlers[event.type]?.(event);}
};
const meshContext={state:{receiveSequence:null,unread:0,reticulumUnread:0},nodes,document,viewing:false};
const meshSnippet=mesh.slice(mesh.indexOf('  function renderUnread(){'),mesh.indexOf('  const note='));
const meshListener=mesh.slice(mesh.indexOf("  document.addEventListener('openrf:reticulum-unread'"),
  mesh.indexOf("  document.addEventListener('openrf:messages-shown'"));
vm.runInNewContext(`const state=globalThis.state;
  const el=id=>globalThis.nodes[id];
  const viewingMessages=()=>globalThis.viewing;
  ${meshSnippet}
  ${meshListener}
  globalThis.track=trackInbox;`,meshContext);

const reticContext={state:{receiveSequence:null,unread:0},document,nodes,viewing:false};
const reticSnippet=reticulum.slice(reticulum.indexOf('  const viewingMessages='),reticulum.indexOf('  const note='));
vm.runInNewContext(`const state=globalThis.state;
  const el=id=>id==='page-reticulum'?{classList:{contains:()=>globalThis.viewing}}:globalThis.nodes[id];
  class CustomEvent{constructor(type,options){this.type=type;this.detail=options.detail;}}
  ${reticSnippet}
  globalThis.track=trackInbox;`,reticContext);

reticContext.track({receive_sequence:7,messages:[{direction:'IN'}]});
assert.equal(nodes['mesh-header-unread'].hidden,true,'Initial received sequence only sets a baseline');
reticContext.track({receive_sequence:8});
assert.equal(nodes['mesh-header-unread'].textContent,'1','Reticulum incoming text updates header');
assert.equal(nodes['mesh-nav-unread'].textContent,'1','Reticulum also updates sidebar');
meshContext.track({receive_sequence:3});
meshContext.track({receive_sequence:5});
assert.equal(nodes['mesh-header-unread'].textContent,'3','2 mesh plus 1 Reticulum unread');
assert.match(nodes['mesh-header-button'].title,/Meshtastic: 2, Reticulum: 1/);
reticContext.track({receive_sequence:8});
assert.equal(nodes['mesh-header-unread'].textContent,'3','No count change for outgoing or repeat polls');
meshContext.viewing=true;
reticContext.track({receive_sequence:9});
meshContext.track({receive_sequence:5});
assert.equal(nodes['mesh-header-unread'].textContent,'2','Mesh inbox does not mark unseen Reticulum messages as read');
meshContext.viewing=false;
reticContext.viewing=true;
reticContext.track({receive_sequence:9});
assert.equal(nodes['mesh-header-unread'].hidden,true,'Reading Messages clears both counts');
reticContext.viewing=false;
reticContext.track({receive_sequence:10});
assert.equal(nodes['mesh-header-unread'].textContent,'1','A new inbound after leaving Messages is counted');
reticContext.track({receive_sequence:0});
assert.equal(nodes['mesh-header-unread'].hidden,true,'A restarted worker does not fabricate unread messages');
assert(!reticulum.includes('innerHTML')&&!mesh.includes('innerHTML'));
console.log('PASS v0.2.88 combined genuine unread counts and touch-safe wrapping');
