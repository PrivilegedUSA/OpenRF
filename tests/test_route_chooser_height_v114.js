'use strict';
// Regression: at 800x480 two genuine routes had to scroll inside a short
// 260px chooser, and Firefox's overlay scrollbar overlapped the cards.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('openrf/static/app.js','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
const from=app.indexOf('function positionRouteChoicePanel(){');
const to=app.indexOf('function sameRoadCoordinates(',from);
assert(from>=0&&to>from);
const container={getBoundingClientRect(){return {top:8,bottom:487}}};
const panel={hidden:false,offsetParent:container,style:{}};
const directions={hidden:false,open:false,getBoundingClientRect(){return {bottom:98,height:36}}};
const $=id=>id==='map-route-choices'?panel:directions;
const context={$,state:{navPicking:false},mapSearchForm:{hidden:true},window:{innerHeight:500}};
vm.createContext(context);
vm.runInContext(app.slice(from,to),context);
context.positionRouteChoicePanel();
const top=Number.parseInt(panel.style.top,10);
const height=Number.parseInt(panel.style.maxHeight,10);
assert.equal(top,102,'route chooser begins 12px below wrapped Directions');
assert(height>=315,`Two cards should have room without scrolling at 800x480 (${height}px)`);
assert(top+8+height<=487-46,'Chooser ends above map credits/info and bottom actions');
assert(css.includes('.map-route-choices{max-height:min(72dvh,380px)'),
  'Fallback height permits the chooser to extend below 260px');
assert(css.includes('.route-choice-scroll{padding-right:7px;scrollbar-gutter:stable'),
  'Route buttons have a stable gutter and cannot touch Firefox overlay scrollbar');
assert(css.includes('.route-choice-footer{flex:0 0 auto'),
  'Start navigation and settings stay visible while exceptionally long text scrolls');
console.log('PASS v0.2.114 expanded two-route chooser and reserved scrollbar and credits clearance');
