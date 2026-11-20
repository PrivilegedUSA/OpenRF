'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
const script=fs.readFileSync('openrf/static/emergency-tabs.js','utf8');
for(const key of ['dashboard','sos','radio','plans','device']){
  assert(html.includes(`data-emergency-tab="${key}"`));
  assert(html.includes(`aria-controls="emergency-tab-panel-${key}"`));
}
assert(html.indexOf('class="panel emergency-notice"')<html.indexOf('id="emergency-tabs"'));
assert.match(html,/emergency-tabs\.js\?v=0\.2\.144/);
assert.match(css,/emergency-tab-panel\[hidden\]\{display:none!important\}/);
assert.match(css,/background:transparent;border:0;border-radius:0;box-shadow:none;backdrop-filter:none\}/,
  'Five independent tab buttons should have no outer tray card');
assert.match(script,/ArrowRight|ArrowLeft/);
assert.match(script,/nothing is sent automatically/);

const els=new Map();
class E {
  constructor(id,cls=''){this.id=id;this.children=[];this.attrs={};this.handlers={};this.hidden=false;
    this.classList={contains:name=>cls.split(' ').includes(name)};this.tabIndex=-1;this.dataset={};}
  append(...nodes){this.children.push(...nodes);}
  prepend(node){this.children=this.children.filter(n=>n!==node);this.children.unshift(node);}
  setAttribute(k,v){this.attrs[k]=v;}
  addEventListener(k,cb){this.handlers[k]=cb;}
  focus(options){this.focused=true;this.focusOptions=options;}
  scrollIntoView(){this.scrolled=true;window.scrollY=0;}
  after(node){this.next=node;}
  querySelector(selector){
    if(this.id==='emergency-tabs')return els.get(selector.match(/data-emergency-tab="(.*?)"/)?.[1]);
    for(const key of selector.split(',')){
      const id=key.trim().slice(1);
      if(this.has.includes(id))return {id};
    }
    return null;
  }
}
const root=new E('page-emergency'),tabs=new E('emergency-tabs');
els.set(root.id,root);els.set(tabs.id,tabs);
const keys=['dashboard','sos','radio','plans','device'];
for(const key of keys)els.set(key,new E(`emergency-tab-${key}`));
const panels=[
  ['emergency-backup-panel',[]],['emergency-survival-panel',[]],['emergency-ops-panel',[]],
  ['readiness',['emergency-readiness']],['sos',['emergency-sos-form']],
  ['checkin',['emergency-checkin-form']],['protocol',['emergency-protocol-form']],
  ['inbox',['emergency-inbox-board']],['handoff',['emergency-handoff-form']],
  ['team',['emergency-team-form']],['plans',['emergency-form']],['library',['emergency-library-results']]
].map(([id,has])=>{const p=new E(id,'panel');p.has=has;els.set(id,p);return p;});
root.append(new E('notice','panel emergency-notice'),...panels);
const document={getElementById:id=>els.get(id),createElement(tag){return new E(tag);}};
const window={scrollY:637};
vm.runInNewContext(script,{document,window,console});
assert.equal(window.OpenRFEmergencyTabs.current(),'dashboard');
const content=tabs.next;
const pane=key=>content.children.find(item=>item.id===`emergency-tab-panel-${key}`);
assert.equal(pane('dashboard').children[0].id,'emergency-ops-panel',
  'Operations snapshot must be the first dashboard card');
assert.equal(pane('dashboard').children[1].id,'emergency-survival-panel',
  'Departure and power checks come directly after operations');
assert(pane('sos').children.some(n=>n.id==='checkin'));
assert(pane('radio').children.some(n=>n.id==='handoff'));
assert.equal(pane('device').children[0].id,'emergency-backup-panel');
assert(pane('plans').children.some(n=>n.id==='plans'));
assert(root.children.some(n=>n.id==='notice'),'Immediate-danger notice always stays visible');
const sos=els.get('sos');sos.handlers.click();
assert.equal(window.OpenRFEmergencyTabs.current(),'sos');
assert.equal(window.scrollY,637,'Clicking SOS must not scroll the page');
assert(!tabs.scrolled,'Tab clicks must not call scrollIntoView');
assert.equal(sos.attrs['aria-selected'],'true');
assert.equal(els.get('dashboard').attrs['aria-selected'],'false');
let prevented=false;
sos.handlers.keydown({key:'ArrowRight',preventDefault(){prevented=true;}});
assert(prevented);
assert.equal(window.OpenRFEmergencyTabs.current(),'radio');
assert(els.get('radio').focused);
assert.equal(els.get('radio').focusOptions.preventScroll,true,'Keyboard tab focus must not scroll');
assert.equal(window.scrollY,637,'Keyboard tab switches must preserve scroll');
assert(pane('device').hidden);
window.OpenRFEmergencyTabs.open('device');
assert(!pane('device').hidden);
assert(pane('radio').hidden);
assert.equal(window.scrollY,637,'Programmatic tab switching must not scroll');
els.get('dashboard').handlers.click();
assert.equal(window.scrollY,637,'Switching back to Dashboard must not scroll');
assert.equal(window.OpenRFEmergencyTabs.current(),'dashboard');
console.log('PASS v0.2.144 accessible emergency tabs, dashboard, quick tools and original form ownership');
