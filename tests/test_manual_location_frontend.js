'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', 'openrf', 'static');
const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'app.css'), 'utf8');

// Exercise refresh() itself: the original v0.2.21 regression requested readiness
// but failed to destructure the result, throwing ReferenceError and mislabeling
// the client exception as a server connection error.
const refreshStart = src.indexOf('async function refresh() {');
const refreshEnd = src.indexOf('\n// Browser geolocation', refreshStart);
assert(refreshStart > 0 && refreshEnd > refreshStart);
const endpoints = {
  '/api/observations': {observations: []},
  '/api/sessions': {sessions: []},
  '/api/stats': {observations: 0, mapped: 0, sessions: 0, demo: 0},
  '/api/hardware': {environment:'WSL', wifi_one_shot: {possible:false}},
  '/api/sensors': {sensors:[],serial_transport:null},
  '/api/captures': {captures:[]},
  '/api/sensors/diagnostics': {receiver_status:'unavailable'},
  '/api/hardware/readiness': {checklist:[],schema_version:1},
  '/api/survey/waypoints': {waypoints:[],truncated:false}
};
const nodes = new Map();
const $ = id => {if(!nodes.has(id)) nodes.set(id,{textContent:''}); return nodes.get(id);};
const state = {observations:[],sessions:[],waypoints:[],sensors:[],captures:[]};
let calls = 0;
const noop = () => {calls++;};
const refresh = Function('api','state','$','refreshDiscoverySessions','renderDiscoveries','renderSessions',
  'renderCaptures','renderHardware','renderSensorRegistry','renderSerialPorts',
  'renderHardwareReadiness','renderSignals','updateMap','renderMapSurveyPanel','renderWaypoints',
  src.slice(refreshStart,refreshEnd) + '\nreturn refresh;')(
  async url => {assert(Object.hasOwn(endpoints,url), `Unexpected API call: ${url}`); return endpoints[url];},
  state, $, ...Array.from({length:12},()=>noop));

// Use simulated browser callbacks to verify location works without submitting,
// and that earlier callback results cannot override a later dialog.
const observationStart = src.indexOf('let observationLocationRequestId = 0;');
const observationEnd = src.indexOf('// v0.2.16:',observationStart);
assert(observationStart>0 && observationEnd>observationStart);
const form = {elements:{},reset(){for(const field of Object.values(this.elements))field.value='';}};
for(const name of ['latitude','longitude','accuracy_m','location_source','fix_age_seconds']) {
  form.elements[name] = {value:''};
}
const dialog = {open:false,showModal(){this.open=true;},close(){this.open=false;}};
const button = {disabled:false};
const status = {textContent:''};
const inputNodes = {
  'observation-form':form,'observation-dialog':dialog,
  'observation-use-location':button,'observation-location-status':status
};
let getPosition = null;
const navigator = {geolocation:{getCurrentPosition(onSuccess,onError,options){getPosition={onSuccess,onError,options};}}};
const clock = {now:()=>100000};
const locationHandlers = Function('$','navigator','Date',src.slice(observationStart,observationEnd)+
  '\nreturn {openObservation,observationCoordinateEdited,useLocationForObservation};')(
  id=>{assert(Object.hasOwn(inputNodes,id),id);return inputNodes[id];},navigator,clock);

(async()=>{
  await refresh();
  assert.deepEqual(state.readiness,{checklist:[],schema_version:1});
  assert.equal(state.diagnostics.receiver_status,'unavailable');
  assert.equal(state.waypoints.length,0);
  assert(calls>=12, 'renderers should execute after refresh completes');

  assert(html.includes('id="observation-use-location"'));
  assert(html.includes('id="observation-location-status"'));
  assert(html.includes('name="location_source" value="UNSPECIFIED"'));
  assert(css.includes('.observation-location-tools'));
  assert(src.includes("'BROWSER_REPORTED'"));
  assert(src.includes('Browser location is now over 60 seconds old'));
  assert(!src.includes('Unable to reach local OpenRF server:'));

  locationHandlers.openObservation();
  assert(dialog.open);
  assert.equal(form.elements.latitude.value,'');
  locationHandlers.useLocationForObservation();
  assert(button.disabled);
  assert.equal(getPosition.options.maximumAge,0);
  assert.equal(getPosition.options.enableHighAccuracy,true);
  assert.equal(form.elements.latitude.value, ''); // never saved or filled prematurely
  getPosition.onSuccess({coords:{latitude:38.4862578,longitude:-120.622998,accuracy:107.25},timestamp:99500});
  assert.equal(button.disabled,false);
  assert.equal(form.elements.latitude.value,'38.4862578');
  assert.equal(form.elements.longitude.value,'-120.6229980');
  assert.equal(form.elements.accuracy_m.value,'107.3');
  assert.equal(form.elements.location_source.value,'BROWSER_REPORTED');
  assert.match(status.textContent,/Desktop\/VPN location may be approximate/);
  form.elements.latitude.value='38.5';
  locationHandlers.observationCoordinateEdited();
  assert.equal(form.elements.location_source.value,'MANUAL_ENTRY');
  assert.equal(form.elements.accuracy_m.value,'');
  assert.equal(form.elements.fix_age_seconds.value,'');

  // A fresh request whose permission is denied cannot clobber entered coords.
  locationHandlers.useLocationForObservation();
  getPosition.onError({code:1});
  assert.equal(form.elements.latitude.value,'38.5');
  assert.match(status.textContent,/permission denied/);

  locationHandlers.useLocationForObservation();
  getPosition.onSuccess({coords:{latitude:38,longitude:-120,accuracy:10},timestamp:1000});
  assert.equal(form.elements.latitude.value,'38.5'); // stale browser fix refused

  locationHandlers.useLocationForObservation();
  const staleCallback = getPosition.onSuccess;
  locationHandlers.openObservation('39','-121');
  staleCallback({coords:{latitude:50,longitude:40,accuracy:5},timestamp:100000});
  assert.equal(form.elements.latitude.value,'39');
  assert.equal(form.elements.location_source.value,'MANUAL_ENTRY');
  assert.equal(button.disabled,false);

  console.log('v0.2.22 refresh/readiness and opt-in observation geolocation behavior passed.');
})().catch(err=>{console.error(err);process.exitCode=1;});
