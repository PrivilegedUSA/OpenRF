/* v0.2.191: selected-list playback, cross-workspace reload and shared USB preview. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const read=f=>fs.readFileSync(`openrf/static/${f}.js`,'utf8');
const ui=read('surveillance'),html=fs.readFileSync('openrf/static/index.html','utf8');
assert(html.includes('surveillance-recording-detail'));
assert(html.includes('/static/tab-session.js?v=0.2.191'));
assert(ui.includes('surveillance-recording-table'));
assert(ui.includes('surveillance-recording-open'));
assert(ui.includes('surveillance-selected-player'));
assert(ui.includes('renderedRecordingKey === key && detail.childElementCount'));
assert(ui.includes("window.OpenRFWorkspaceTabs?.remember('surveillance', tab)"));
assert(!ui.includes('usbPreviewResume.add(camera.id); stopView(camera.id);'));
const modules=['surveillance','emergency-tabs','hardware-tabs','messaging-tabs','reticulum-tabs','weather'];
for(const f of modules) {
  const source=read(f);
  assert(source.includes('OpenRFWorkspaceTabs?.restore('),`${f} missing reload restore`);
  assert(source.includes('OpenRFWorkspaceTabs?.remember('),`${f} missing tab choice persistence`);
}
// Helper must accept only legitimate local tab names, never unknown state.
const vm=require('node:vm'),source=read('tab-session');
const store=new Map(), nav={type:'navigate'};
const context={window:{performance:{getEntriesByType:()=>[nav]},sessionStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)}}};
vm.runInNewContext(source,context);
const t=context.window.OpenRFWorkspaceTabs;
t.remember('surveillance','recordings');
assert.equal(t.restore('surveillance',['overview','recordings'],'overview'),'overview');
nav.type='reload';
assert.equal(t.restore('surveillance',['overview','recordings'],'overview'),'recordings');
assert.equal(t.restore('emergency',['dashboard','sos'],'dashboard'),'dashboard');
t.remember('emergency','__invalid__');
assert.equal(t.restore('emergency',['dashboard','sos'],'dashboard'),'dashboard');
console.log('PASS v191 list viewer and tab persistence');
