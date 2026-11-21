'use strict';
// The API supplies ascending event order, both live and from private history.
// Chats show oldest first and scroll to the newest message at the bottom.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const script=fs.readFileSync('openrf/static/reticulum.js','utf8');
const html=fs.readFileSync('openrf/static/index.html','utf8');
assert(html.includes('aria-label="Reticulum LXMF conversation, oldest first with latest at bottom"'));

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
  globalThis.renderInbox=renderInbox;
  globalThis.scrollToLatest=scrollToLatest;`,context);
const messageTexts=()=>elements['reticulum-messages'].children.map(item=>item.children[1].textContent);
context.renderInbox(rows);
assert.deepEqual(messageTexts(),['oldest','middle','newest'],'All inbox rows oldest-first');
assert(elements['reticulum-messages'].children[0].className.includes('message-inbound'),
  'Received LXMF text uses incoming bubble');
assert(elements['reticulum-messages'].children[1].className.includes('message-outbound'),
  'Queued LXMF text uses outgoing bubble without claiming delivery');
assert.deepEqual(rows.map(row=>row.text),['oldest','middle','newest'],'Input order preserved');
assert.deepEqual(context.state.messages.map(row=>row.text),['oldest','middle','newest']);
context.renderInbox(rows);
assert.deepEqual(messageTexts(),['oldest','middle','newest'],'Repeated polling must not flip order');
elements['reticulum-conversation'].value=a;
context.renderInbox(rows);
assert.deepEqual(messageTexts(),['oldest','newest'],'Peer-specific inbox oldest-first');
elements['reticulum-conversation'].value='all';
context.renderInbox(rows);
assert.deepEqual(messageTexts(),['oldest','middle','newest'],'All view stays oldest-first');
const box=elements['reticulum-messages'];
box.scrollTop=180;
const update=[...rows,{direction:'IN',destination:a,text:'new arrival',utc:'2026-11-17T10:03:00+00:00'}];
context.renderInbox(update);
assert.equal(box.scrollTop,300,'Near-bottom conversation follows latest');
box.scrollTop=0;
context.renderInbox([...update,{direction:'IN',destination:a,text:'another arrival',utc:'2026-11-17T10:04:00+00:00'}]);
assert.equal(box.scrollTop,0,'Reading older messages is not interrupted by polling');
context.scrollToLatest();
assert.equal(box.scrollTop,300,'Opening a conversation jumps to newest message');
const before=rows.map(row=>row.text);
context.renderInbox([{...rows[1],utc:'2026-11-17T10:01:00+00:00'},rows[2],rows[0]]);
assert.deepEqual(messageTexts(),['oldest','middle','newest'],'Chronology uses UTC, not persistence order');
assert.deepEqual(rows.map(row=>row.text),before,'Source records remain unchanged');
context.renderInbox([{...rows[0],direction:'OUT',status:'DELIVERED_LXMF'},
  {...rows[1],status:'FAILED_LXMF'}]);
assert.match(elements['reticulum-messages'].children[0].children[2].textContent,/receipt confirmed/,
  'A delivery callback is shown independently of queue acceptance');
assert.match(elements['reticulum-messages'].children[1].children[2].textContent,/Delivery failed/);
console.log('PASS v0.2.165 Reticulum oldest-first chat, UTC ordering and bottom-follow behavior');
