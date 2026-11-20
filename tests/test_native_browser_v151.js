'use strict';
/* v0.2.151: optional native Chromium bridge, sandbox and retained live views. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {isPublicWebUrl,isSafeRemoteRequest,parseLocalAppUrl,safeBounds}=require('../tools/openrf-electron/security');
const script=fs.readFileSync('openrf/static/browser-workspace.js','utf8');
const nativeMain=fs.readFileSync('tools/openrf-electron/main.js','utf8');
const preload=fs.readFileSync('tools/openrf-electron/preload.js','utf8');
const html=fs.readFileSync('openrf/static/index.html','utf8');
for(const url of ['https://example.com/','http://openstreetmap.org','https://www.example.org/a?q=1'])
  assert(isPublicWebUrl(url),url);
for(const url of ['file:///etc/passwd','javascript:alert(1)','http://localhost:8765/',
  'http://127.0.0.1/','http://192.168.1.1/','https://user:secret@example.com/',
  'http://device.local/','http://[::1]/','https://example.internal/'])
  assert(!isPublicWebUrl(url),url);
assert(isSafeRemoteRequest('data:image/png;base64,AA=='));
assert(!isSafeRemoteRequest('file:///home/pi/.ssh/id_rsa'));
assert(!isSafeRemoteRequest('http://localhost:8765/api/observations'));
assert.equal(parseLocalAppUrl('http://127.0.0.1:8765/'),'http://127.0.0.1:8765/');
assert.throws(()=>parseLocalAppUrl('https://evil.example/'));
assert.throws(()=>parseLocalAppUrl('http://0.0.0.0:8765/'));
assert.deepEqual(safeBounds({x:250,y:130,width:780,height:500},[1280,800]),
  {x:250,y:130,width:780,height:500});
assert.equal(safeBounds({x:-10,y:50,width:100,height:100},[1280,800]),null);
assert(nativeMain.includes('new WebContentsView('));
assert(nativeMain.includes('nodeIntegration:false,contextIsolation:true,webSecurity:true'));
assert(nativeMain.includes('setPermissionRequestHandler'));
assert(nativeMain.includes('onBeforeRequest'));
assert(nativeMain.includes("win.contentView.addChildView(view)"));
assert(nativeMain.includes('webContents.close()'));
assert(!nativeMain.includes('webviewTag:true'));
assert(preload.includes('contextBridge.exposeInMainWorld'));
assert(html.includes('id="browser-viewport"'));

class Element{
  constructor(){this.children=[];this.events={};this.value='';this.hidden=true;
    this.src='about:blank';this.attrs={};this.classList={contains:()=>true};}
  addEventListener(key,fn){this.events[key]=fn;}
  dispatch(key,arg){this.events[key]?.({preventDefault(){},...arg});}
  setAttribute(k,v){this.attrs[k]=v;}
  removeAttribute(k){delete this.attrs[k];}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;}
  remove(){}
  focus(){}
  getBoundingClientRect(){return {x:240,y:120,left:240,top:120,width:780,height:480};}
}
const ids=['page-browser','browser-viewport','browser-tabs','browser-tab-add','browser-address-form',
  'browser-address','browser-back','browser-forward','browser-reload','browser-home',
  'browser-go','browser-open-external','browser-network-status','browser-status',
  'browser-preview','browser-placeholder','browser-placeholder-info','browser-security-note',
  'browser-bookmark-add','browser-bookmarks'];
const nodes=Object.fromEntries(ids.map(id=>[id,new Element()]));
const storage=new Map(),actions=[],nativeEvents={};
const native={available:true,
  onLocation:fn=>nativeEvents.location=fn,onStatus:fn=>nativeEvents.status=fn};
for(const key of ['open','select','resize','hide','close','back','forward','reload'])
  native[key]=(...args)=>{actions.push({key,args});return Promise.resolve({ok:true});};
const document={getElementById:id=>nodes[id],createElement:()=>new Element(),events:{},
  addEventListener(k,fn){this.events[k]=fn;}};
const window={openrfNativeBrowser:native,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
  addEventListener(){}};
vm.runInNewContext(script,{document,window,navigator:{onLine:true},URL,Promise});
assert(!actions.some(x=>x.key==='open'),'No remote site opens at startup');
nodes['browser-address'].value='https://example.org/';
nodes['browser-address-form'].dispatch('submit');
assert(actions.some(x=>x.key==='open'&&x.args[1]==='https://example.org/'));
const openCount=actions.filter(x=>x.key==='open').length;
nodes['browser-tab-add'].dispatch('click');
nodes['browser-tabs'].children[0].children[0].dispatch('click');
assert.equal(actions.filter(x=>x.key==='open').length,openCount,'Switching tabs must not re-open Chromium');
assert(actions.some(x=>x.key==='select'&&x.args[0]===1));
nativeEvents.location({id:1,url:'https://example.org/details'});
assert.equal(window.OpenRFBrowserWorkspace.current(),'https://example.org/details');
document.events['openrf:browser-hidden']();
assert.equal(actions.at(-1).key,'hide');
console.log('PASS v0.2.151 native Chromium retained views, private sandbox, URL boundaries and bridge lifecycle');
