'use strict';
// Check contact labeling and per-peer message filtering without a radio or network.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const js=fs.readFileSync('openrf/static/reticulum.js','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
for(const id of ['reticulum-contacts-panel','reticulum-contact-form','reticulum-contact-address',
  'reticulum-contact-alias','reticulum-contacts-list','reticulum-conversation',
  'reticulum-save-history','reticulum-clear-history','reticulum-storage-label',
  'reticulum-connection-brief'])assert(html.includes(`id="${id}"`),`Missing ${id}`);
assert(html.includes('/static/reticulum.js?v=0.2.161'));
assert(css.includes('.reticulum-contact-form{display:grid;'));
assert(css.includes('@media(max-width:500px){#page-reticulum .reticulum-contact-form{'));
assert(js.includes("'/api/reticulum/contacts'"));
assert(js.includes("'/api/reticulum/contacts/delete'"));
assert(js.includes("'/api/reticulum/history/clear'"));
assert(js.includes('Message delivery not confirmed.'));
assert(js.includes('Queued with LXMF · delivery not confirmed'));
assert(!js.includes('innerHTML'),'Contact aliases and message text must never become executable HTML');

function node(tag){
  return {tag,children:[],textContent:'',value:'all',className:'',scrollTop:0,scrollHeight:0,clientHeight:100,
    events:{},classList:{toggle(){}},
    addEventListener(type,listener){this.events[type]=listener;},
    setAttribute(name,value){this[name]=value;},
    replaceChildren(...children){this.children=[...children];},
    append(...children){this.children.push(...children);},
    focus(){this.focused=true;},select(){this.selected=true;},scrollIntoView(){this.scrolled=true;}};
}
const a='a'.repeat(32), b='b'.repeat(32);
const elements={
  'reticulum-messages':node('div'),'reticulum-conversation':node('select'),
  'reticulum-recipient':node('input'),'reticulum-text':node('textarea'),
  'reticulum-compose':node('form'),'reticulum-contact-count':node('span'),
  'reticulum-contact-status':node('p'),'reticulum-contacts-list':node('div'),
  'reticulum-contact-address':node('input'),'reticulum-contact-alias':node('input'),
  'reticulum-contact-submit':node('button'),'reticulum-contact-cancel':node('button')
};
const data=[
  {direction:'IN',destination:a,text:'Hello from my phone',status:'RECEIVED_VALID_SIGNATURE',utc:'time1'},
  {direction:'OUT',destination:b,text:'Queued only',status:'QUEUED_WITH_LXMF_NOT_DELIVERED',utc:'time2'}
];
const context={elements,updates:0,notes:[],state:{contacts:[{address:a,alias:'My phone'}],messages:[]},
  document:{createElement:node},
  navigator:{clipboard:{writeText:async()=>{}}}};
context.Option=class{constructor(label,value){this.textContent=label;this.value=value;}};
const snippet=js.slice(js.indexOf('  function contactName(address){'),js.indexOf('  const shown='));
vm.runInNewContext(`const el=id=>globalThis.elements[id];
  const state=globalThis.state;
  const updateControls=()=>globalThis.updates++;
  const note=text=>globalThis.notes.push(text);
  ${snippet}
  globalThis.renderInbox=renderInbox;
  globalThis.renderContacts=renderContacts;`,context);
context.renderInbox(data);
assert.equal(elements['reticulum-conversation'].children.length,3,'All plus two distinct correspondents');
const rows=elements['reticulum-messages'].children;
assert.equal(rows.length,2);
assert.match(rows[0].children[2].textContent,/delivery not confirmed/);
assert.match(rows[1].children[0].textContent,/My phone/);
assert.match(rows[1].children[2].textContent,/valid LXMF signature/);
elements['reticulum-conversation'].value=a;
context.renderInbox(data);
assert.equal(elements['reticulum-messages'].children.length,1,'Conversation selection filters to one peer');
const incoming=elements['reticulum-messages'].children[0];
incoming.children[3].children[0].events.click();
assert.equal(elements['reticulum-recipient'].value,a,'Reply fills actual LXMF address, not nickname');
assert(elements['reticulum-text'].focused,'Reply focuses composer but does not send');
context.renderContacts();
assert.equal(elements['reticulum-contact-count'].textContent,'1 saved');
const contact=elements['reticulum-contacts-list'].children[0];
assert.equal(contact.children[0].children[0].textContent,'My phone');
assert.equal(contact.children[0].children[1].textContent,a);
contact.children[1].children[1].events.click();
assert.equal(elements['reticulum-contact-address'].value,a);
assert.equal(elements['reticulum-contact-alias'].value,'My phone');
assert(!snippet.includes("'/api/reticulum/send'"),'Neither selecting nor editing a contact transmits');
console.log('PASS v0.2.104 Reticulum contacts, conversations and truthful message status UI');
