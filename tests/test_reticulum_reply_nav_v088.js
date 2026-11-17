'use strict';
// Exercise incoming LXMF Reply/Copy actions without a network or real radio.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
const js=fs.readFileSync('openrf/static/reticulum.js','utf8');
const app=fs.readFileSync('openrf/static/app.js','utf8');
const mesh=fs.readFileSync('openrf/static/mesh.js','utf8');

const meshPage=html.split('id="page-messages"')[1].split('id="page-reticulum"')[0];
const reticPage=html.split('id="page-reticulum"')[1].split('id="page-hamradio"')[0];
assert(meshPage.includes('id="mesh-messages"') && meshPage.includes('id="mesh-compose"'));
assert(!meshPage.includes('id="reticulum-messages"'));
assert(reticPage.includes('id="reticulum-messages"') && reticPage.includes('id="reticulum-compose"'));
assert(!reticPage.includes('id="mesh-messages"'));
for(const id of ['messages-nav-toggle','messages-nav-subpages'])assert(html.includes(`id="${id}"`));
for(const page of ['messages','reticulum'])assert(html.includes(`data-page="${page}"`));
assert(html.includes('aria-expanded="false" aria-controls="messages-nav-subpages"'));
assert(css.includes('.sidebar .nav-subpages[hidden]{display:none!important}'));
assert(css.includes('#page-reticulum .mesh-chat-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr)'));
assert(app.includes("new Event('openrf:reticulum-shown')"));
assert(app.includes("$('messages-nav-toggle').addEventListener('click'"));
assert(js.includes("document.addEventListener('openrf:reticulum-shown'"));
assert(!mesh.includes('header.dataset.jump='),'The header now uses a two-inbox dropdown');
assert(html.includes('id="header-messages-choices"'));

function node(tag){return {tag,children:[],events:{},textContent:'',value:'',scrollTop:0,scrollHeight:0,clientHeight:100,
  classList:{},append(...items){this.children.push(...items);},replaceChildren(){this.children=[];},
  addEventListener(type,fn){this.events[type]=fn;},setAttribute(key,value){this[key]=value;},
  focus(){this.focused=true;},select(){this.selected=true;},scrollIntoView(){this.scrolled=true;}};}
const nodes={'reticulum-messages':node('div'),'reticulum-recipient':node('input'),
  'reticulum-text':node('textarea'),'reticulum-compose':node('form')};
const copied=[],notes=[];
const document={createElement:node};
const context={nodes,document,navigator:{clipboard:{writeText:async address=>{copied.push(address);}}},
  updates:0,notes};
const snippet=js.slice(js.indexOf('  function renderInbox(rows){'),js.indexOf('  const shown='));
assert(snippet.includes('function prefillReply') && snippet.includes('function copySenderAddress'));
vm.runInNewContext(`const el=id=>globalThis.nodes[id];
  const updateControls=()=>{globalThis.updates++;};
  const note=text=>{globalThis.notes.push(text);};
  ${snippet}
  globalThis.renderInbox=renderInbox;`,context);
const sender='0123456789abcdef0123456789abcdef';
const messages=[{direction:'IN',destination:sender,text:'Hello from Sideband',status:'RECEIVED_VALID_SIGNATURE',utc:'UTC'},
  {direction:'OUT',destination:sender,text:'sent'},{direction:'IN',destination:'invalid',text:'bad address'}];
context.renderInbox(messages);
const incoming=nodes['reticulum-messages'].children[0];
const buttons=incoming.children.find(child=>child.className==='reticulum-message-actions').children;
assert.equal(buttons.length,2);
assert.deepEqual(buttons.map(button=>button.textContent),['Reply','Copy address']);
assert.equal(nodes['reticulum-messages'].children[1].children.length,3,'Sent messages have no reply actions');
assert.equal(nodes['reticulum-messages'].children[2].children.length,3,'Invalid sender cannot become a reply');
buttons[0].events.click();
assert.equal(nodes['reticulum-recipient'].value,sender);
assert(nodes['reticulum-text'].focused && nodes['reticulum-compose'].scrolled);
assert.equal(context.updates,1);
assert(notes.at(-1).includes('press Send'));
// The click handlers never submit the form or send a message.
assert(!snippet.includes("'/api/reticulum/send'"));
(async()=>{
  await buttons[1].events.click();
  assert.deepEqual(copied,[sender]);
  assert(notes.at(-1).includes('copied to clipboard'));
  context.navigator.clipboard=null;
  await buttons[1].events.click();
  assert(nodes['reticulum-recipient'].selected,'Clipboard-denied fallback selects the address');
  assert(notes.at(-1).includes('Clipboard unavailable'));
  assert(!js.includes('innerHTML'));
  console.log('PASS v0.2.90 separate inboxes and explicit, safe LXMF Reply/Copy');
})().catch(error=>{console.error(error);process.exitCode=1;});
