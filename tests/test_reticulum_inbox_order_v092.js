'use strict';
// The API supplies ascending event order, both live and from private history.
// Every inbox and filtered conversation must show the newest message first.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const script=fs.readFileSync('openrf/static/reticulum.js','utf8');
const html=fs.readFileSync('openrf/static/index.html','utf8');
assert(html.includes('aria-label="Reticulum LXMF conversation, newest first"'));

function node(tag){
  return {tag,children:[],value:'all',scrollTop:0,scrollHeight:300,clientHeight:100,
    textContent:'',classList:{toggle(){}},
    replaceChildren(...items){this.children=[...items];},
    append(...items){this.children.push(...items);},
    addEventListener(){},setAttribute(){},focus(){},scrollIntoView(){}};
}
const a='a'.repeat(32),b='b'.repeat(32);
const elements={
  'reticulum-messages':node('div'),'reticulum-conversation':node('select'),
  'reticulum-recipient':node('input'),'reticulum-text':node('textarea'),
  'reticulum-compose':node('form')
};
const rows=[
  {direction:'IN',destination:a,text:'oldest',utc:'2026-11-17T10:00:00+00:00'},
  {direction:'OUT',destination:b,text:'middle',utc:'2026-11-17T10:01:00+00:00'},
  {direction:'IN',destination:a,text:'newest',utc:'2026-11-17T10:02:00+00:00'}
];
const context={elements,state:{contacts:[],messages:[]},
  document:{createElement:node},
  navigator:{clipboard:{writeText:async()=>{}}}};
context.Option=class{constructor(label,value){this.textContent=label;this.value=value;}};
const snippet=script.slice(script.indexOf('  function contactName(address){'),script.indexOf('  const shown='));
vm.runInNewContext(`const el=id=>globalThis.elements[id];
  const state=globalThis.state;
  const updateControls=()=>{};
  const note=()=>{};
  ${snippet}
  globalThis.renderInbox=renderInbox;`,context);
const messageTexts=()=>elements['reticulum-messages'].children.map(item=>item.children[1].textContent);
context.renderInbox(rows);
assert.deepEqual(messageTexts(),['newest','middle','oldest'],'All inbox rows newest-first');
assert(elements['reticulum-messages'].children[0].className.includes('message-inbound'),
  'Received LXMF text uses incoming bubble');
assert(elements['reticulum-messages'].children[1].className.includes('message-outbound'),
  'Queued LXMF text uses outgoing bubble without claiming delivery');
assert.deepEqual(rows.map(row=>row.text),['oldest','middle','newest'],'Input order preserved');
assert.deepEqual(context.state.messages.map(row=>row.text),['oldest','middle','newest']);
context.renderInbox(rows);
assert.deepEqual(messageTexts(),['newest','middle','oldest'],'Repeated polling must not flip order');
elements['reticulum-conversation'].value=a;
context.renderInbox(rows);
assert.deepEqual(messageTexts(),['newest','oldest'],'Peer-specific inbox newest-first');
elements['reticulum-conversation'].value='all';
context.renderInbox(rows);
assert.deepEqual(messageTexts(),['newest','middle','oldest'],'All view stays newest-first');
const box=elements['reticulum-messages'];
box.scrollTop=70;
context.renderInbox(rows);
assert.equal(box.scrollTop,70,'Polling does not jump to latest while reading older rows');
box.scrollTop=0;
context.renderInbox(rows);
assert.equal(box.scrollTop,0,'Latest stays visible at top');
console.log('PASS v0.2.95 Reticulum newest-first inbox, filters and scroll stability');
