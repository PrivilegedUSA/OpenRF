'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('openrf/static/app.js','utf8');
const begin=app.indexOf('function sameRoadCoordinates('),end=app.indexOf('function chooseRouteChoice(',begin);
assert(begin>0&&end>begin);
const values=new Map();
const $=id=>{
  if(!values.has(id))values.set(id,{hidden:false,open:false,textContent:'',attrs:{},setAttribute(k,v){this.attrs[k]=v}});
  return values.get(id);
};
const standard={type:'ROAD_ROUTE',is_driving_route:true,distance_miles:9.61,duration_seconds:1620,
  coordinates:[[-120.75,38.45],[-120.74,38.46]]};
const alternative={...standard,distance_miles:10.71,duration_seconds:2040,
  coordinates:[[-120.75,38.45],[-120.745,38.445],[-120.74,38.46]]};
const state={navPicking:false,navChoicePanelClosed:false,navFollowId:null,navChoiceSelection:'alternate',
  navRouteChoices:{standard,alternative,
    standard_cameras:{count:1,nearby_count:1,not_direction_matched_count:0,unknown_direction_count:0},
    alternative_cameras:{count:1,nearby_count:1,not_direction_matched_count:1,unknown_direction_count:0}}};
const context={$ ,state,mapSearchForm:{hidden:true},positionRouteChoicePanel(){}};
vm.createContext(context);
vm.runInContext(app.slice(begin,end)+'\nthis.render=renderRouteChoices;',context);
context.render();
assert.equal($('route-choice-alternate-details').textContent,
  '10.71 mi · ~34 min · 1 nearby camera report');
assert.equal($('route-choice-difference').textContent,
  '1.1 mi longer · 7 min slower · same number of nearby camera reports · 1 lens bearing estimate not matched (still counted)');
state.navRouteChoices.alternative_cameras={count:1,nearby_count:1,unknown_direction_count:1,not_direction_matched_count:0};
context.render();
assert($('route-choice-difference').textContent.includes('1 camera direction unknown'));
assert($('route-choice-difference').textContent.includes('same number of nearby camera reports'));
state.navRouteChoices.mode='maximum';state.navRouteChoices.preferred='alternate';
state.navRouteChoices.alternative_cameras={count:0,nearby_count:0,unknown_direction_count:0};
context.render();
assert($('route-choice-status').textContent.includes('Maximum avoidance recommends'));
assert($('route-choice-difference').textContent.includes('1 fewer nearby camera report'));
console.log('PASS v0.2.112 conservative nearby counts and maximum-avoidance comparison');
