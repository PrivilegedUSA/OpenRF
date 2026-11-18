'use strict';
// The primary Where to? flow must expose the same manual origin used by
// Plan a trip, without altering an already selected destination.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const js=fs.readFileSync('openrf/static/app.js','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
const part=(start,end)=>{const a=js.indexOf(start),b=js.indexOf(end,a);assert(a>=0&&b>a,start);return js.slice(a,b);};

for(const id of ['map-origin-control','map-origin-caption','map-origin-edit','map-origin-editor',
  'map-origin-query','map-origin-pick','map-origin-use-location','map-picked-origin',
  'map-router-check','map-router-result'])assert(html.includes(`id="${id}"`),`Missing ${id}`);
assert(html.indexOf('id="map-origin-control"')<html.indexOf('id="map-destination-query"'),
  'From is visible before destination in the main search');
assert(html.includes('id="nav-start-query"'),'Optional trip planner retains its origin');
assert(html.includes('data-map-tool="settings"'),'Right-rail Map settings must be untouched');
assert(css.includes('#page-map .map-origin-editor[hidden]{display:none!important}'));
assert(css.includes('#page-map .map-origin-control{'));
assert(js.includes("$('map-picked-origin').addEventListener('click'"),
  'Map-selected destination must provide Change start');
assert(js.includes('setMapSearchCollapsed(false);\n  setMapOriginEditor(true,true);\n  syncMapPickedAction();'),
  'Change start opens the quick editor and hides the old destination popup');
assert(js.includes('state.navOriginPickReturnToSearch=returnToSearch;'),
  'Quick map-origin selection returns to the main Where to? flow');
assert(js.includes("$('map-origin-pick').addEventListener('click',()=>beginOriginMapPick({returnToSearch:true}));"));
assert(js.includes("api('/api/navigation/routing/status')"));
assert(js.includes('docker start openrf-valhalla'),
  'The quick router check offers an actionable local Docker restart hint');

const handlers=new Map(),elements=new Map();
function makeElement(id){
  const attr=new Map(),events=new Map();
  const element={id,value:'',hidden:id==='map-origin-editor',disabled:false,textContent:'',
    attributes:attr,events,children:[],classList:{toggle(){}},
    parentElement:{classList:{add(){}},append(child){this.child=child;}},
    setAttribute(name,value){attr.set(name,String(value))},
    addEventListener(name,fn){(events.get(name)||events.set(name,[]).get(name)).push(fn)},
    focus(){this.focused=true},replaceChildren(){this.children=[]}};
  return element;
}
function $(id){if(!elements.has(id))elements.set(id,makeElement(id));return elements.get(id);}
const state={navOriginManual:false,navPickedOrigin:null,navPickedPoint:[-121.45,38.15],
  navPreview:{is_driving_route:true},navRouteChoices:null,navCameraComparison:null};
let reset=0,rendered=0;
const ctx={$,state,document:{createElement:tag=>makeElement(tag)},
  updateNavOverlayLayout(){},renderNavigationOverlay(){rendered++},
  setMapDestinationStatus(){},resetRouteForNewDestination(){reset++;state.navPreview=null;},
  navigationSuggestionDelay(){return 100},addressProviderInfo:null,navAddressCache:new Map(),
  setTimeout(){return 1},clearTimeout(){},Date,Boolean,String,Math};
vm.createContext(ctx);
const setup=part('function syncMapOriginSummary(){','function setMapSearchCollapsed(');
const lookup=part('function wireTripAddressField(input) {','// v0.2.30: explicit one-tap map destination selection');
vm.runInContext(setup+'\n'+lookup,ctx);
function emit(id,event){for(const handler of $(id).events.get(event)||[])handler();}
assert.equal($('map-origin-caption').textContent,'Current location');
assert.equal($('map-origin-query').value,'');
emit('map-origin-edit','click');
assert.equal($('map-origin-editor').hidden,false,'Change expands the main origin field');
assert.equal($('map-origin-query').focused,true);
$('map-origin-query').value='38.500, -121.500';
emit('map-origin-query','input');
assert.equal(state.navOriginManual,true);
assert.equal($('nav-start-query').value,'38.500, -121.500',
  'Quick origin and Plan a trip must share exactly the same value');
assert.equal($('map-origin-caption').textContent,'38.500, -121.500');
assert.equal(reset,1,'Changing the starting point invalidates an old road route');
assert.equal(state.navPickedPoint[0],-121.45,'Destination remains unchanged');
assert(rendered>0);

$('nav-start-query').value='Jackson, CA';
emit('nav-start-query','input');
assert.equal($('map-origin-query').value,'Jackson, CA',
  'Editing the trip planner origin updates the quick From input');
assert.equal($('map-origin-caption').textContent,'Jackson, CA');
emit('map-origin-use-location','click');
assert.equal(state.navOriginManual,false,'Current location restores browser-origin default');
assert.equal($('nav-start-query').value,'');
assert.equal($('map-origin-query').value,'');
assert.equal($('map-origin-caption').textContent,'Current location');
assert.equal($('map-origin-editor').hidden,true);
assert.equal(state.navPickedPoint[0],-121.45);
console.log('PASS v0.2.113 quick From editor, mirrored origins, map start action and router check');
