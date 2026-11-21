'use strict';
// MeshCore direct chat: old-to-new chronology, follow only while near bottom.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const app=fs.readFileSync('openrf/static/app.js','utf8');
const server=fs.readFileSync('openrf/server.py','utf8');
const code=fs.readFileSync('openrf/static/meshcore.js','utf8');
assert(html.includes('id="meshcore-nav-item"')&&html.includes('data-page="meshcore"'));
assert(html.includes('/static/meshcore.js?v='));
assert(app.includes("'meshcore'"));
assert(server.includes("'/static/meshcore.js'"));
assert(code.includes("'/api/meshcore/send'"));
assert(!code.includes('send_advert')&&!code.includes('send_chan_msg'));
const elements={'meshcore-messages':{
  children:[],scrollTop:280,scrollHeight:500,clientHeight:200,
  replaceChildren(...items){this.children=items;},append(item){this.children.push(item);}
}};
const node=tag=>({tag,children:[],className:'',textContent:'',
  append(...items){this.children.push(...items);}});
const state={selected:'a'.repeat(64),lastSignature:'',rows:[]};
const context={elements,state,document:{createElement:node}};
const snippet=code.slice(code.indexOf('  function nearBottom('),code.indexOf('  function openThread('));
vm.runInNewContext(`const el=id=>elements[id];const state=globalThis.state;
const threadKey=row=>row.public_key||'unknown:'+String(row.sender_prefix||'');
const labelTime=value=>value;${snippet}
globalThis.renderConversation=renderConversation;globalThis.scrollLatest=scrollLatest;`,context);
const rows=[
  {id:1,public_key:state.selected,direction:'IN',text:'old',received_at_utc:'2026-11-20T01:00:00Z',delivery:'RECEIVED_FROM_RADIO'},
  {id:2,public_key:state.selected,direction:'OUT',text:'new',received_at_utc:'2026-11-20T03:00:00Z',delivery:'SUBMITTED_TO_RADIO_NOT_ACKNOWLEDGED'},
  {id:3,public_key:state.selected,direction:'IN',text:'middle',received_at_utc:'2026-11-20T02:00:00Z',delivery:'RECEIVED_FROM_RADIO'}
];
const box=elements['meshcore-messages'];
state.rows=rows;
context.renderConversation(true);
assert.deepEqual(box.children.map(x=>x.children[0].textContent),['old','middle','new']);
assert.equal(box.scrollTop,500);
assert.match(box.children[2].children[1].textContent,/ACK not received/);
box.scrollTop=0;
state.rows=[...rows,{...rows[1],id:4,text:'latest',received_at_utc:'2026-11-20T04:00:00Z'}];
context.renderConversation();
assert.equal(box.scrollTop,0,'Do not steal scroll from someone reading older messages');
box.scrollTop=280;
state.rows=[...state.rows,{...rows[0],id:5,text:'final',received_at_utc:'2026-11-20T05:00:00Z'}];
context.renderConversation();
assert.equal(box.scrollTop,500,'Follow newest when already close to the bottom');
state.rows[1].delivery='NETWORK_ACK_REPORTED_NOT_READ';
context.renderConversation();
assert.match(box.children[2].children[1].textContent,/Network ACK reported/);
console.log('PASS v0.2.172 MeshCore isolation, chat chronology, status and scroll follow');
