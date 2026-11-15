'use strict';
// Opening the editor must not destroy a route or treat a coordinate pair as
// an address search. A route is replaced only by an explicit destination.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const src=fs.readFileSync('openrf/static/app.js','utf8');
function between(start,end){
  const i=src.indexOf(start),j=src.indexOf(end,i);
  assert(i>=0&&j>i,`missing source region ${start}`);
  return src.slice(i,j);
}
const js=[
  between('function navigationTypedCoordinates(value) {','function locationForQuickPreview()'),
  between("let navAddressTimer=null;","$('map-destination-query').addEventListener('keydown'"),
  between("$('map-destination-query').addEventListener('focus'", "$('map-online-address').addEventListener('change'")
].join('\n');
const listeners={};
const query={value:'38.4660509, -120.6527355',addEventListener(k,fn){listeners[k]=fn;},dispatchEvent(e){listeners[e.type]?.();}};
const nodes={
  'map-destination-query':query,
  'map-online-address':{checked:true}
};
const oldRoute={is_driving_route:true,type:'ROAD_ROUTE'};
const state={navPreview:oldRoute,navRouteChoices:{standard:oldRoute},navPickedPoint:[-120.65,38.46],
  navSelectedAddress:null,navDestinations:[],navStreetMatches:[],navSearchToken:0};
const stats={clears:0,lookups:0,scheduled:0,notices:[]};
const context={state,$:id=>nodes[id],navGeometry:{point(lat,lon){
    const a=Number(lat),b=Number(lon);
    if(!Number.isFinite(a)||!Number.isFinite(b)||Math.abs(a)>90||Math.abs(b)>180)throw Error('invalid coordinates');
    return [b,a];
  }},
  navAddressCache:new Map(),addressProviderInfo:{maptiler_configured:true},
  hideMapAddressMatches(){},setMapDestinationStatus(msg){stats.notices.push(msg);},
  resetRouteForNewDestination(){stats.clears++;state.navPreview=null;},
  api(){stats.lookups++;return Promise.resolve({results:[]});},
  navigationLookupIsComplete(){return false;},navigationSuggestionDelay(){return 450;},
  setTimeout(){stats.scheduled++;return 1;},clearTimeout(){},
  Event:class {constructor(type){this.type=type;}}
};
vm.createContext(context);
vm.runInContext(js,context);
assert.equal(context.navigationTypedCoordinates(query.value).join(','),'-120.6527355,38.4660509');
query.dispatchEvent({type:'focus'});
assert.equal(stats.clears,0,'focus on old coordinates must not invalidate prior route');
assert.equal(stats.lookups,0,'focus on coordinates must not call MapTiler');
assert.equal(stats.scheduled,0,'focus on coordinates must not queue MapTiler');
assert.equal(state.navPreview,oldRoute);
query.dispatchEvent({type:'input'});
assert.equal(stats.clears,0,'reusing a coordinate pair must not clear old directions');
assert.equal(stats.lookups,0,'coordinate input is local, not geocoding');
assert.equal(stats.scheduled,0,'coordinate input must not schedule remote geocoding');
assert(stats.notices.some(s=>s.includes('Coordinates ready')));
query.value='25005 State Hwy 88, Pioneer, CA';
query.dispatchEvent({type:'input'});
assert.equal(stats.clears,0,'draft address text must not invalidate the old route');
assert.equal(state.navPreview,oldRoute,'old route remains while typing');
assert(stats.scheduled>=1,'a real typed address can still queue normal suggestions');
console.log('PASS v0.2.76 map coordinates bypass MapTiler and drafting does not clear a route');
