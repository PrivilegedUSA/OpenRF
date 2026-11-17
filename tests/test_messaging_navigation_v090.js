'use strict';
// v0.2.101: inbox selection, page state, and genuine receive counters.
// No radio, LAN transmission, location API, or third-party DOM library.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const app=fs.readFileSync('openrf/static/app.js','utf8');
const mesh=fs.readFileSync('openrf/static/mesh.js','utf8');
const retic=fs.readFileSync('openrf/static/reticulum.js','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');

const nav=html.match(/<nav class="nav">([\s\S]*?)<\/nav>/)?.[1]||'';
assert(nav.indexOf('data-page="map"')>=0 && nav.indexOf('data-page="map"')<nav.indexOf('data-page="overview"'));
assert(html.includes('<section class="page active" id="page-map"'));
assert(html.includes('<section class="page" id="page-overview"'));
assert(html.includes('id="mesh-header-button" aria-label="Choose message inbox"'));
assert(html.includes('aria-expanded="false" aria-controls="header-messages-choices"'));
assert(html.includes('id="header-messages-choices"') &&
  html.includes('id="mesh-header-mesh-unread"')&&html.includes('id="mesh-header-reticulum-unread"'));
const dropdown=html.split('id="header-messages-choices"')[1].split('</div>')[0];
assert(dropdown.includes('data-page="messages"')&&dropdown.includes('data-page="reticulum"'));
assert(!html.match(/id="mesh-header-button"[^>]*data-jump=/));
assert(css.includes('.topbar .header-messages-choices[hidden]{display:none!important}'));
assert(css.includes('body.map-workspace .topbar .header-messages-menu{display:none!important}'));
assert(app.includes('function closeHeaderMessageMenu('));
assert(app.includes("$('mesh-header-button').addEventListener('click'"));
assert(app.includes("event.key==='Escape'"));
assert(app.includes('if(!event.target.closest(\'#header-messages-menu\'))closeHeaderMessageMenu()'));
assert(app.includes('closeHeaderMessageMenu();\n  rememberPage(page);'));

// Check tab-scoped state and graceful failure when storage is unavailable.
const pageCode=app.slice(app.indexOf('const SELECTED_PAGE_SESSION_KEY'),app.indexOf('const escapeHTML'));
const pageData=new Map();
const storage={getItem:key=>pageData.get(key)||null,setItem:(key,value)=>pageData.set(key,value)};
function pages(sessionStorage){
  const context={window:{sessionStorage}};
  vm.runInNewContext(pageCode+'\nglobalThis.getPage=rememberedPage;globalThis.setPage=rememberPage;',context);
  return context;
}
let tab=pages(storage);
assert.equal(tab.getPage(),'map','An empty tab must launch Map, even on desktop');
tab.setPage('overview');
assert.equal(pages(storage).getPage(),'overview','Refreshing the same tab restores the page');
tab.setPage('reticulum');
assert.equal(pages(storage).getPage(),'reticulum','Messaging pages also survive refresh');
pageData.set('openrf.selected-page.v1','not-a-page');
assert.equal(pages(storage).getPage(),'map','Invalid saved routes must be ignored');
assert.equal(pages({getItem(){throw Error('denied')},setItem(){throw Error('denied')}}).getPage(),'map');
assert.equal(pages({}).getPage(),'map','Storage is optional');
assert(app.includes('showPage(rememberedPage());'),'Both desktop and touchscreen restore or default to Map');

function inboxFixture(source,system,sessionStorage){
  const nodes={};
  const mk=()=>({hidden:true,textContent:'',title:'',classList:{toggle(){}},
    setAttribute(name,value){this[name]=value;}});
  for(const id of ['mesh-header-unread','mesh-nav-unread','reticulum-nav-unread',
    'mesh-header-mesh-unread','mesh-header-reticulum-unread','mesh-header-button',
    'messages-nav-toggle','mesh-nav-item','reticulum-nav-item','mesh-global-announcer'])nodes[id]=mk();
  const messages=[];
  const context={window:{sessionStorage},viewing:false,messages};
  context.document={getElementById(id){
    if(id==='page-messages'||id==='page-reticulum')return {classList:{contains:()=>context.viewing}};
    return nodes[id]||null;
  },body:{classList:{contains:()=>false}},
  dispatchEvent(event){messages.push({type:event.type,count:event.detail.count});}};
  context.CustomEvent=class {constructor(type,opts){this.type=type;this.detail=opts.detail;}};
  const pre=source.slice(source.indexOf('  const unreadKey='),source.indexOf('  const viewingMessages='));
  const actions=source.slice(source.indexOf('  const viewingMessages='),source.indexOf('  const note='));
  vm.runInNewContext('const el=id=>document.getElementById(id);\n'+pre+actions+
    '\nglobalThis.track=trackInbox;globalThis.unreadState=state;',context);
  return {context,nodes};
}
function memoryStore(){
  const values=new Map();
  return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
}
for(const [name,source] of [['mesh',mesh],['reticulum',retic]]){
  const sessionStorage=memoryStore();
  const first=inboxFixture(source,name,sessionStorage);
  first.context.track({receive_sequence:12});
  assert.equal(first.context.unreadState.unread,0,`${name}: old messages aren't new`);
  first.context.track({receive_sequence:14});
  assert.equal(first.context.unreadState.unread,2,`${name}: count only genuine inbound events`);
  first.context.track({receive_sequence:14});
  assert.equal(first.context.unreadState.unread,2,`${name}: send/repeated poll cannot increase count`);
  const refreshed=inboxFixture(source,name,sessionStorage);
  assert.equal(refreshed.context.unreadState.unread,2,`${name}: retain count across refresh`);
  refreshed.context.track({receive_sequence:14});
  assert.equal(refreshed.context.unreadState.unread,2,`${name}: no duplicate on refresh`);
  refreshed.context.track({receive_sequence:15});
  assert.equal(refreshed.context.unreadState.unread,3,`${name}: count new delivery after refresh`);
  refreshed.context.track({receive_sequence:0});
  assert.equal(refreshed.context.unreadState.unread,3,`${name}: service restart must not erase unread`);
  refreshed.context.viewing=true;
  refreshed.context.track({receive_sequence:0});
  assert.equal(refreshed.context.unreadState.unread,3,`${name}: merely viewing the inbox does not mark it read`);
  assert.equal(inboxFixture(source,name,sessionStorage).context.unreadState.unread,3,
    `${name}: unread state survives refresh even while on its page`);
  if(name==='mesh'){
    assert.equal(first.nodes['mesh-header-unread'].textContent,'2');
    assert.equal(first.nodes['mesh-header-mesh-unread'].textContent,'2');
  }else assert(first.context.messages.some(item=>item.count===2));
}
const reticStatus=retic.slice(retic.indexOf('  function renderStatus('),retic.indexOf('  function renderInbox('));
assert(!reticStatus.includes('state.unread=0'),'A connection status change must not clear a message badge');
assert(mesh.includes('if(!state.busy)loadMessages();'),'Disconnected local inbox still checks last receipts');
assert(!mesh.includes('innerHTML')&&!retic.includes('innerHTML'));
console.log('PASS v0.2.101 header inbox chooser, page restore, and persistent genuine unread counters');
