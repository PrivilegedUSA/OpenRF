'use strict';
/* v0.2.148: tested route-coverage UI contract and unsent SOS -> manual radio flow. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const html=fs.readFileSync('openrf/static/index.html','utf8');
const app=fs.readFileSync('openrf/static/app.js','utf8');
const sos=fs.readFileSync('openrf/static/emergency-sos.js','utf8');
const handoff=fs.readFileSync('openrf/static/emergency-handoff.js','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
for(const id of ['map-route-offline-coverage','map-route-coverage-check',
  'map-route-coverage-status','map-route-coverage-results',
  'emergency-sos-save','emergency-sos-prepare-radio'])
  assert(html.includes(`id="${id}"`),`Missing ${id}`);
assert(html.includes('Save &amp; prepare radio send'));
assert(html.includes('This is <strong>not a 911 call</strong>'));
assert(app.includes("api('/api/navigation/route-coverage','POST',{points})"));
assert(app.includes('OpenRFRouteElevation?.sample(current.coordinates,13)'));
assert(app.includes('current!==state.navPreview'));
assert(app.includes('No single installed offline basemap contains all 13 sampled tiles'));
assert(handoff.includes('window.OpenRFEmergencyHandoff=Object.freeze({selectDraft})'));
assert(handoff.includes("'emergency-handoff-draft').dispatchEvent(new Event('change'))"));
assert(css.includes('.emergency-sos-actions'));

function elem(id,value=''){
  return {id,value,disabled:false,textContent:'',handlers:{},
    addEventListener(event,cb){this.handlers[event]=cb;},
    scrollIntoView(options){this.scrolledWith=options;},
    focus(options){this.focusedWith=options;}};
}
const nodes={
  'emergency-sos-template':elem('emergency-sos-template','NEED_HELP'),
  'emergency-sos-recipient':elem('emergency-sos-recipient','Family'),
  'emergency-sos-message':elem('emergency-sos-message','Need a ride'),
  'emergency-sos-preview':elem('emergency-sos-preview'),
  'emergency-sos-location':elem('emergency-sos-location'),
  'emergency-sos-locate':elem('emergency-sos-locate'),
  'emergency-sos-clear':elem('emergency-sos-clear'),
  'emergency-sos-form':elem('emergency-sos-form'),
  'emergency-sos-status':elem('emergency-sos-status'),
  'emergency-sos-save':elem('emergency-sos-save'),
  'emergency-sos-prepare-radio':elem('emergency-sos-prepare-radio'),
  'emergency-handoff-destination':elem('emergency-handoff-destination'),
  'emergency-handoff-form':elem('emergency-handoff-form'),
  'emergency-handoff-status':elem('emergency-handoff-status'),
};
const actions=[];let draftId=12;
const fakeWindow={OpenRFEmergencyHandoff:{async selectDraft(id){actions.push(['selected',id]);}},
  OpenRFEmergencyTabs:{open(tab){actions.push(['open',tab]);}}};
const mock={window:fakeWindow,Event:class{constructor(type){this.type=type;}},
  document:{getElementById:id=>nodes[id],dispatchEvent:evt=>actions.push(['dispatch',evt.type]),
    addEventListener:()=>{}},
  navigator:{},Date,Number,confirm:message=>(actions.push(['confirm',message]),true),
  fetch:async(path,request)=>{
    actions.push(['fetch',path,request]);
    return {ok:true,json:async()=>({record:{id:draftId++}})};
  }};
vm.runInNewContext(sos,mock);
(async()=>{
  assert.match(nodes['emergency-sos-preview'].value,/NOT TRANSMITTED/);
  await nodes['emergency-sos-form'].handlers.submit({preventDefault(){},
    submitter:{id:'emergency-sos-prepare-radio'}});
  assert.equal(actions.filter(a=>a[0]==='fetch').length,1);
  assert.deepEqual(actions.find(a=>a[0]==='selected'),['selected',12]);
  assert.deepEqual(actions.find(a=>a[0]==='open'),['open','radio']);
  assert(actions.find(a=>a[0]==='confirm')[1].includes('Nothing will transmit'));
  assert.equal(actions.find(a=>a[0]==='fetch')[1],'/api/emergency/sos/draft');
  assert.match(nodes['emergency-handoff-status'].textContent,/Nothing has transmitted/);
  assert.equal(nodes['emergency-handoff-destination'].focusedWith.preventScroll,true);
  assert.equal(nodes['emergency-handoff-form'].scrolledWith.block,'center');
  assert.equal(nodes['emergency-sos-save'].disabled,false);
  assert.equal(nodes['emergency-sos-prepare-radio'].disabled,false);
  actions.length=0;
  await nodes['emergency-sos-form'].handlers.submit({preventDefault(){},
    submitter:{id:'emergency-sos-save'}});
  assert.equal(actions.filter(a=>a[0]==='fetch').length,1);
  assert(!actions.some(a=>a[0]==='open' || a[0]==='selected'));
  assert.match(nodes['emergency-sos-status'].textContent,/NOT transmitted/);
  console.log('PASS v0.2.148 offline route tile checker and SOS manual radio handoff safety contract');
})().catch(error=>{console.error(error);process.exitCode=1;});
