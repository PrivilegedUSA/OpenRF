'use strict';
// Realistic messenger chronology for the separate Meshtastic transport.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const code=fs.readFileSync('openrf/static/mesh.js','utf8');
function node(tag){
  return {tag,children:[],textContent:'',value:'all',disabled:false,scrollTop:0,
    scrollHeight:500,clientHeight:200,classList:{toggle(){}},
    replaceChildren(...items){this.children=[...items];},
    append(...items){this.children.push(...items);},
    setAttribute(){},addEventListener(){}};
}
const elements={
  'mesh-conversation':node('select'),
  'mesh-reply-conversation':node('button'),
  'mesh-messages':node('div')
};
const context={elements,document:{createElement:node},
  Option:class{constructor(name,value){this.textContent=name;this.value=value;}},
  state:{connected:false},nicknames:{}};
const snippet=code.slice(code.indexOf('  function friendlyMessageTime('),
  code.indexOf('  async function loadMessages('));
assert(snippet.includes('function renderMessages(rows)'));
vm.runInNewContext(`const el=id=>globalThis.elements[id];
  const state=globalThis.state;const nicknames=globalThis.nicknames;
  let latestRows=[];let lastRenderedSignature='';
  ${snippet}
  globalThis.renderMessages=renderMessages;
  globalThis.scrollMeshToLatest=scrollMeshToLatest;`,context);
const rows=[
  {node:'!00000001',channel:0,direction:'IN',text:'oldest',received_at_utc:'2026-11-20T01:00:00Z'},
  {node:'!00000001',channel:0,direction:'OUT',text:'newest',received_at_utc:'2026-11-20T03:00:00Z'},
  {node:'!00000001',channel:0,direction:'IN',text:'middle',received_at_utc:'2026-11-20T02:00:00Z'}
];
const box=elements['mesh-messages'];
context.renderMessages(rows);
const messageTexts=()=>box.children.map(item=>item.children[1].textContent);
assert.deepEqual(messageTexts(),['oldest','middle','newest']);
context.scrollMeshToLatest();
assert.equal(box.scrollTop,500);
box.scrollTop=0;
context.renderMessages([...rows,{...rows[0],text:'last',received_at_utc:'2026-11-20T04:00:00Z'}]);
assert.equal(box.scrollTop,0,'Reading old messages should not jump on a new arrival');
box.scrollTop=280;
context.renderMessages([...rows,{...rows[0],text:'next',received_at_utc:'2026-11-20T05:00:00Z'}]);
assert.equal(box.scrollTop,500,'When near bottom, continue following new messages');
console.log('PASS v0.2.165 Meshtastic chat chronology, initial bottom and new-message following');
