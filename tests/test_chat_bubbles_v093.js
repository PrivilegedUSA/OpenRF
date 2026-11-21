'use strict';
// Text-like message bubbles: incoming left, outgoing right, latest at bottom.
// Status remains truthful: submission to a radio is not proof of delivery.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const mesh=fs.readFileSync('openrf/static/mesh.js','utf8');
const reticulum=fs.readFileSync('openrf/static/reticulum.js','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
assert(css.includes('.mesh-message.message-bubble'));
assert(css.includes('.mesh-message.message-outbound'));
assert(css.includes('align-self:flex-end'));
assert(css.includes('max-width:88%'),'Bubbles fit small screens');
assert(reticulum.includes("message.direction==='IN'?'message-inbound':'message-outbound'"));
assert(reticulum.includes('Queued with LXMF · delivery not confirmed'));
assert(mesh.includes('Submitted to connected radio; delivery not confirmed.'));

function node(tag){
  return {tag,children:[],value:'all',textContent:'',scrollTop:0,scrollHeight:300,clientHeight:100,
    className:'',disabled:false,events:{},
    replaceChildren(...items){this.children=[...items];},
    append(...items){this.children.push(...items);},
    addEventListener(name,callback){this.events[name]=callback;},
    focus(){this.focused=true;}};
}
const elements={'mesh-messages':node('div'),'mesh-conversation':node('select'),
  'mesh-reply-conversation':node('button'),'mesh-destination':node('input'),
  'mesh-channel':node('select'),'mesh-text':node('textarea')};
const doc={createElement:node};
const context={elements,document:doc};
context.Option=class{constructor(label,value){this.textContent=label;this.value=value;}};
const snippet=mesh.slice(mesh.indexOf('  let lastRenderedSignature='),mesh.indexOf('  async function loadMessages()'));
vm.runInNewContext(`const el=id=>globalThis.elements[id];
  const state={connected:true};
  const nicknames={'!aaaaaaaa':'Phone'};
  let latestRows=[];
  ${snippet}
  globalThis.renderMessages=renderMessages;`,context);
const rows=[
  {direction:'IN',node:'!aaaaaaaa',channel:0,text:'Old hello',received_at_utc:'2026-11-17T08:00:00Z'},
  {direction:'OUT',node:'!aaaaaaaa',channel:0,text:'Queued reply',received_at_utc:'2026-11-17T08:01:00Z'},
  {direction:'IN',node:'!bbbbbbbb',channel:1,text:'New hello',received_at_utc:'2026-11-17T08:02:00Z'}
];
const messageBox=elements['mesh-messages'];
const texts=()=>messageBox.children.map(item=>item.children[1].textContent);
context.renderMessages(rows);
assert.deepEqual(texts(),['Old hello','Queued reply','New hello'],'Mesh inbox oldest first');
assert.match(messageBox.children[0].className,/message-inbound/);
assert.match(messageBox.children[1].className,/message-outbound/);
assert.match(messageBox.children[1].children[2].textContent,/delivery not confirmed/);
assert.deepEqual(rows.map(item=>item.text),['Old hello','Queued reply','New hello'],
  'UI does not mutate the backend message array');
elements['mesh-conversation'].value='!aaaaaaaa|0';
context.renderMessages(rows);
assert.deepEqual(texts(),['Old hello','Queued reply'],'Per-peer mesh chat oldest-first');
elements['mesh-conversation'].value='all';
context.renderMessages(rows);
assert.deepEqual(texts(),['Old hello','Queued reply','New hello']);
console.log('PASS v0.2.167 mesh and Reticulum chat bubbles, newest at bottom');
