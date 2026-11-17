'use strict';
// A conversation opens a dedicated thread with one composer and no per-text
// Reply/Copy controls. Real network actions are intentionally not invoked.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
const js=fs.readFileSync('openrf/static/reticulum.js','utf8');
for(const id of ['reticulum-thread-browser','reticulum-thread-list','reticulum-thread-view',
  'reticulum-new-thread','reticulum-thread-back','reticulum-thread-name','reticulum-thread-address',
  'reticulum-thread-copy','reticulum-thread-save','reticulum-recipient-label','reticulum-compose'])
  assert(html.includes(`id="${id}"`),`Missing ${id}`);
assert(css.includes('#page-reticulum .reticulum-thread-view:not([hidden]){display:flex!important;'));
assert(css.includes('#page-reticulum #reticulum-thread-view[hidden]'));
assert(html.indexOf('id="reticulum-messages"')<html.indexOf('id="reticulum-compose"'));

function element(tag){
  return {tag,children:[],textContent:'',className:'',hidden:false,disabled:false,value:'all',
    scrollTop:0,scrollHeight:300,clientHeight:100,events:{},classList:{toggle(){}},
    replaceChildren(...items){this.children=[...items];},
    append(...items){this.children.push(...items);},
    setAttribute(name,value){this[name]=value;},
    addEventListener(name,callback){this.events[name]=callback;},
    focus(){this.focused=true;},
    scrollIntoView(){this.scrolled=true;}};
}
const ids=['reticulum-thread-browser','reticulum-thread-list','reticulum-thread-view',
  'reticulum-thread-name','reticulum-thread-address','reticulum-thread-copy',
  'reticulum-thread-save','reticulum-recipient-label','reticulum-quick-contact',
  'reticulum-recipient','reticulum-text','reticulum-conversation','reticulum-messages',
  'reticulum-byte-count','reticulum-compose'];
const elements=Object.fromEntries(ids.map(id=>[id,element('div')]));
const a='a'.repeat(32),b='b'.repeat(32),c='c'.repeat(32);
const state={contacts:[{address:a,alias:'Sideband'},{address:c,alias:'Idle contact'}],
  messages:[],activeThread:null,drafts:Object.create(null),enabled:true,busy:false};
const data=[
  {direction:'IN',destination:a,text:'First from phone',utc:'2026-11-17T08:00:00Z',
    status:'RECEIVED_VALID_SIGNATURE'},
  {direction:'OUT',destination:b,text:'Queued elsewhere',utc:'2026-11-17T08:01:00Z',
    status:'QUEUED_WITH_LXMF_NOT_DELIVERED'},
  {direction:'IN',destination:a,text:'Last from phone',utc:'2026-11-17T08:02:00Z',
    status:'RECEIVED_VALID_SIGNATURE'}
];
const context={elements,state,TextEncoder,document:{createElement:element}};
context.Option=class{constructor(label,value){this.textContent=label;this.value=value;}};
const snippet=js.slice(js.indexOf('  function contactName('),js.indexOf('  const shown='));
vm.runInNewContext(`const el=id=>globalThis.elements[id];
  const state=globalThis.state;
  const updateControls=()=>{};
  const note=()=>{};
  ${snippet}
  globalThis.openThread=openThread;
  globalThis.backToConversations=backToConversations;
  globalThis.renderInbox=renderInbox;
  globalThis.prefillReply=prefillReply;`,context);
context.renderInbox(data);
const list=elements['reticulum-thread-list'];
assert.equal(list.children.length,3,'Two peers and one saved contact without messages');
assert.equal(list.children[0].children[1].children[0].textContent,'Sideband',
  'Most recently active conversation comes first');
assert.match(list.children[0].children[1].children[1].textContent,/Last from phone/);
assert.equal(list.children[2].children[1].children[0].textContent,'Idle contact');
list.children[0].events.click();
assert.equal(state.activeThread,a);
assert.equal(elements['reticulum-thread-browser'].hidden,true);
assert.equal(elements['reticulum-thread-view'].hidden,false);
assert.equal(elements['reticulum-thread-name'].textContent,'Sideband');
assert.equal(elements['reticulum-recipient'].value,a);
assert.equal(elements['reticulum-recipient-label'].hidden,true,'No address field repeated for known thread');
assert.equal(elements['reticulum-thread-save'].hidden,true,'Saved contact needs no Save button');
assert.equal(elements['reticulum-messages'].children.length,2,'Thread filters other peers');
assert.equal(elements['reticulum-messages'].children[0].children[1].textContent,'Last from phone');
assert.equal(elements['reticulum-messages'].children[0].children.length,3,
  'Reply and Copy are no longer repeated under each received bubble');
elements['reticulum-text'].value='Draft for Sideband';
context.backToConversations();
assert.equal(elements['reticulum-thread-view'].hidden,true);
assert.equal(elements['reticulum-thread-browser'].hidden,false);
context.openThread(b);
assert.equal(elements['reticulum-recipient'].value,b);
assert.equal(elements['reticulum-thread-save'].hidden,false,'Unknown peer can be saved from thread header');
assert.equal(elements['reticulum-text'].value,'','Drafts cannot carry across contacts');
assert.match(elements['reticulum-messages'].children[0].children[2].textContent,/delivery not confirmed/);
context.openThread(a);
assert.equal(elements['reticulum-text'].value,'Draft for Sideband','Unsent draft is kept within its own thread');
context.openThread(null);
assert.equal(state.activeThread,'new');
assert.equal(elements['reticulum-recipient-label'].hidden,false);
assert.equal(elements['reticulum-thread-copy'].disabled,true);
assert.equal(elements['reticulum-messages'].children.length,1,'New thread has no invented history');
context.prefillReply(a);
assert.equal(state.activeThread,a);
assert(elements['reticulum-text'].focused);
assert(!snippet.includes("'/api/reticulum/send'"),'Opening and replying do not send data');
console.log('PASS v0.2.99 full-width Reticulum thread navigation, drafts and truthful chat');
