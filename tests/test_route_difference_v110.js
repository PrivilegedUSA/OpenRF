'use strict';
// Only a meaningfully different Valhalla road belongs in the chooser.
// Summaries compare route cost and mapped reports, not verified camera safety.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('openrf/static/app.js','utf8');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
for(const id of ['route-choice-standard-details','route-choice-alternate-details','route-choice-difference'])
  assert(html.includes(`id="${id}"`),`${id} has a dedicated text region`);
assert(css.includes('.route-choice-buttons{grid-template-columns:minmax(0,1fr)'),
  'Route choices stack instead of squeezing into two columns');
assert(css.includes('.route-choice-btn small{display:block'),
  'The alternate difference appears in its own line');
const a=app.indexOf('function sameRoadCoordinates('),b=app.indexOf('function chooseRouteChoice(',a);
assert(a>0&&b>a);
const routeCode=app.slice(a,b);
const elements=new Map();
function $(id){
  if(!elements.has(id))elements.set(id,{hidden:false,open:false,disabled:false,textContent:'',attrs:{},
    setAttribute(key,val){this.attrs[key]=String(val)}});
  return elements.get(id);
}
const state={navPicking:false,navChoicePanelClosed:false,navFollowId:null,navChoiceSelection:'standard'};
const ctx={$ ,state,mapSearchForm:{hidden:true},positionRouteChoicePanel(){ctx.positioned++},positioned:0};
vm.createContext(ctx);
vm.runInContext(routeCode+'\nthis.render=renderRouteChoices;this.same=sameRoadCoordinates;this.diff=routeChoiceDifferenceSummary;',ctx);
const main={type:'ROAD_ROUTE',is_driving_route:true,distance_miles:30.8,duration_seconds:2520,
  coordinates:[[-121.0,38.0],[-120.8,38.0],[-120.6,38.0]]};
const identical={...main,coordinates:main.coordinates.map(p=>[...p])};
const other={...main,coordinates:[[-121.0,38.0],[-120.8,38.02],[-120.6,38.0]]};
const reports=count=>({count,incomplete:false});
assert.equal(ctx.same(main,identical),true,'Copied arrays still mean one road');
state.navRouteChoices={standard:main,alternative:identical,standard_cameras:reports(6),alternative_cameras:reports(6)};
ctx.render();
assert.equal($('map-route-choices').hidden,true,'Do not present duplicated route cards');
assert.equal($('route-choice-alternate').hidden,true);
state.navRouteChoices={standard:main,alternative:other,standard_cameras:reports(6),alternative_cameras:reports(6)};
ctx.render();
assert.equal($('map-route-choices').hidden,false,
  'Same miles, minutes and reports do NOT hide a physically different route');
assert.equal($('route-choice-difference').textContent,
  'same distance · same estimated time · same number of nearby camera reports');
state.navRouteChoices={standard:main,alternative:{...other,distance_miles:32.8,duration_seconds:2820},
  standard_cameras:reports(6),alternative_cameras:reports(2)};
ctx.render();
assert.equal($('route-choice-difference').textContent,
  '2.0 mi longer · 5 min slower · 4 fewer nearby camera reports');
assert.equal($('route-choice-standard-details').textContent,'30.8 mi · ~42 min · 6 nearby camera reports');
assert.equal($('route-choice-alternate-details').textContent,'32.8 mi · ~47 min · 2 nearby camera reports');
assert.equal($('route-choice-alternate').attrs['aria-pressed'],'false');
state.navRouteChoices.alternative_cameras.incomplete=true;
assert(ctx.diff(state.navRouteChoices).includes('partial camera data'),
  'Incomplete catalog counts are clearly qualified');
console.log('PASS v0.2.114 duplicate routes rejected; stacked card and relative distance/time/camera counts');
