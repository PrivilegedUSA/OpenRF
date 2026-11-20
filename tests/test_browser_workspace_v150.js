'use strict';
/* v0.2.150: browser workspace remains opt-in, private and sandboxed. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const script=fs.readFileSync('openrf/static/browser-workspace.js','utf8');
const app=fs.readFileSync('openrf/static/app.js','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
const ids=['page-browser','browser-tabs','browser-tab-add','browser-address-form',
  'browser-address','browser-back','browser-forward','browser-reload','browser-home',
  'browser-go','browser-open-external','browser-network-status','browser-status',
  'browser-preview','browser-placeholder','browser-bookmark-add','browser-bookmarks'];
for(const id of ids)assert(html.includes(`id="${id}"`),`Missing ${id}`);
assert(html.includes('data-page="browser"'));
assert(html.includes('/static/browser-workspace.js?v=0.2.150'));
assert(html.includes('sandbox="allow-scripts allow-forms"'));
assert(html.includes('referrerpolicy="no-referrer"'));
assert(html.includes('rel="noopener noreferrer"'));
assert(!html.includes('sandbox="allow-scripts allow-same-origin'));
assert(app.includes("'browser'"));
assert(css.includes('.browser-viewport'));
assert(css.includes('max-width:720px'));
assert(!script.includes('fetch('),'Browser must not proxy arbitrary websites via local backend');

class FakeElement {
  constructor(tag='div'){
    this.tagName=tag;this.children=[];this.listeners={};this.attributes={};
    this.textContent='';this.className='';this.hidden=false;this.disabled=false;
    this.value='';this.href='';this.tabIndex=0;this.src='about:blank';
  }
  addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
  dispatch(name,event={}){for(const fn of this.listeners[name]||[])fn({preventDefault(){},...event});}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=items;}
  setAttribute(name,val){this.attributes[name]=String(val);}
  getAttribute(name){return this.attributes[name]??null;}
  removeAttribute(name){delete this.attributes[name];if(name==='href')this.href='';}
  focus(){}
}
const elements=Object.fromEntries(ids.map(id=>[id,new FakeElement()]));
const created=[];
const memory=new Map();
const localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};
const document={getElementById:id=>elements[id],createElement:tag=>{
  const element=new FakeElement(tag);created.push(element);return element;
},listeners:{},addEventListener(name,fn){this.listeners[name]=fn;}};
const window={localStorage,listeners:{},addEventListener(name,fn){this.listeners[name]=fn;}};
const context={window,document,navigator:{onLine:true},URL};
vm.runInNewContext(script,context);
const browser=window.OpenRFBrowserWorkspace;
assert(browser,'Browser helper must load');
assert.equal(elements['browser-preview'].src,'about:blank','Startup must not fetch a website');
assert.equal(elements['browser-preview'].hidden,true);
assert.match(elements['browser-network-status'].textContent,/not verified/);
assert.equal(elements['browser-open-external'].getAttribute('aria-disabled'),'true');
assert.equal(browser.normalizeAddress('example.org'),'https://example.org/');
assert.equal(browser.normalizeAddress('OpenStreetMap tiles'),
  'https://duckduckgo.com/?q=OpenStreetMap%20tiles');
for(const url of ['javascript:alert(1)','file:///etc/passwd','http://127.0.0.1:2947',
  'http://localhost:2947','https://printer.local/','https://node.internal/',
  'https://user:password@example.org/','http://[::1]/','https://192.168.1.1/']){
  assert.throws(()=>browser.normalizeAddress(url),undefined,`Should reject ${url}`);
}

const go=(text)=>{
  elements['browser-address'].value=text;
  elements['browser-address-form'].dispatch('submit');
};
go('https://example.org/');
assert.equal(browser.current(),'https://example.org/');
assert.equal(elements['browser-preview'].src,'https://example.org/');
assert.equal(elements['browser-open-external'].href,'https://example.org/');
assert.equal(elements['browser-open-external'].getAttribute('aria-disabled'),'false');
assert.equal(elements['browser-back'].disabled,true);
assert.equal(elements['browser-bookmark-add'].disabled,false);
elements['browser-bookmark-add'].dispatch('click');
assert.equal(elements['browser-bookmarks'].children.length,1);
go('http://example.com/news');
assert.equal(browser.current(),'http://example.com/news');
assert.equal(elements['browser-preview'].hidden,true,'Insecure HTTP must not embed');
assert.match(elements['browser-status'].textContent,/Full browser/);
elements['browser-back'].dispatch('click');
assert.equal(browser.current(),'https://example.org/');
elements['browser-forward'].dispatch('click');
assert.equal(browser.current(),'http://example.com/news');
elements['browser-tab-add'].dispatch('click');
assert.equal(browser.current(),'');
assert.equal(elements['browser-tabs'].children.length,2);
go('https://www.openstreetmap.org');
assert.equal(browser.current(),'https://www.openstreetmap.org/');
assert.equal(elements['browser-bookmarks'].children.length,1);
const saved=memory.get('openrf.browser.workspace.v1');
assert(saved && JSON.parse(saved).tabs.length===2);
// A fresh process restores only addresses/bookmarks, without contacting sites.
const document2={...document};
const elements2=Object.fromEntries(ids.map(id=>[id,new FakeElement()]));
document2.getElementById=id=>elements2[id];
const window2={localStorage,listeners:{},addEventListener(name,fn){this.listeners[name]=fn;}};
vm.runInNewContext(script,{window:window2,document:document2,navigator:{onLine:false},URL});
assert.equal(elements2['browser-preview'].src,'about:blank');
assert.equal(elements2['browser-preview'].hidden,true);
assert.equal(elements2['browser-tabs'].children.length,2);
assert.equal(elements2['browser-bookmarks'].children.length,1);
assert.equal(elements2['browser-address'].value,'https://www.openstreetmap.org/');
assert.match(elements2['browser-network-status'].textContent,/offline/);
// Manually editing an address to a blocked target cannot be opened from Go.
elements2['browser-address'].value='http://127.0.0.1:2947';
elements2['browser-address-form'].dispatch('submit');
assert.match(elements2['browser-status'].textContent,/rejected/);
assert.equal(window2.OpenRFBrowserWorkspace.current(),'https://www.openstreetmap.org/');
console.log('PASS v0.2.150 opt-in browser tabs/bookmarks, restored session, sandbox and URL boundaries');
