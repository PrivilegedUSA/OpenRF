'use strict';
// The unread badge is derived from genuine received-event sequence changes,
// not outgoing text, historical rows, or simulated packets.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const app=fs.readFileSync('openrf/static/app.js','utf8');
const mesh=fs.readFileSync('openrf/static/mesh.js','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');

for(const name of ['radio','messages','hamradio']){
  assert(html.includes(`data-page="${name}"`),`${name} in navigation`);
  assert(html.includes(`id="page-${name}"`),`${name} page`);
  assert(app.includes(`${name}:'`),`${name} title`);
}
const radio=html.split('id="page-radio"')[1].split('id="page-messages"')[0];
const messages=html.split('id="page-messages"')[1].split('id="page-hamradio"')[0];
const ham=html.split('id="page-hamradio"')[1].split('id="page-sessions"')[0];
assert(radio.includes('id="radio-frequency"'));
assert(!radio.includes('id="mesh-compose"')&&!radio.includes('id="chirp-import-form"'));
assert(messages.includes('id="mesh-compose"')&&messages.includes('id="mesh-messages"'));
assert(messages.indexOf('id="mesh-messages"')<messages.indexOf('id="mesh-compose"'));
assert(ham.includes('id="chirp-import-form"')&&!ham.includes('id="mesh-compose"'));
assert(html.includes('id="mesh-header-button"')&&html.includes('id="mesh-header-unread"'));
assert(html.includes('id="mesh-nav-unread"')&&html.includes('id="mesh-global-announcer"'));
assert(css.includes('body.map-workspace .topbar .messages-header-button'));
assert(app.includes("new Event('openrf:messages-shown')"));
assert(mesh.includes("document.addEventListener('openrf:messages-shown',async()=>{"));
assert(!mesh.includes("document.addEventListener('openrf:radio-shown',refresh)"));
assert(!mesh.includes('innerHTML'));

const snippet=mesh.slice(mesh.indexOf('  function renderUnread(){'),mesh.indexOf('  const note='));
assert(snippet.includes('function trackInbox'));
const nodes=Object.fromEntries(['mesh-header-unread','mesh-nav-unread','mesh-header-button','mesh-global-announcer']
  .map(id=>[id,{hidden:true,textContent:'',title:'',setAttribute(name,value){this[name]=value;}}]));
const context={state:{receiveSequence:null,unread:0},nodes,visible:false,
  document:{body:{classList:{contains:()=>false}}}};
vm.runInNewContext(`const state=globalThis.state;
  const el=id=>globalThis.nodes[id];
  const viewingMessages=()=>globalThis.visible;
  ${snippet}
  globalThis.track=trackInbox;`,context);
context.track({receive_sequence:6,messages:[{direction:'IN'}]});
assert.equal(context.state.unread,0,'Initial stored messages are not new');
context.track({receive_sequence:8});
assert.equal(context.state.unread,2,'Two new received texts off the messages page');
assert.equal(nodes['mesh-header-unread'].textContent,'2');
assert.equal(nodes['mesh-header-unread'].hidden,false);
context.track({receive_sequence:8});
assert.equal(context.state.unread,2,'An outgoing send leaves received sequence unchanged');
context.visible=true;
context.track({receive_sequence:9});
assert.equal(context.state.unread,3,'Inbound while Messages is visible still counts as unread');
assert.equal(nodes['mesh-nav-unread'].hidden,false);
context.visible=false;
context.track({receive_sequence:10});
assert.equal(context.state.unread,4,'Leaving Messages continues the same notification count');
context.track({receive_sequence:0});
assert.equal(context.state.unread,4,'Backend restart does not invent received messages');
console.log('PASS v0.2.77 dedicated radio/message/ham pages and genuine unread sequence');
