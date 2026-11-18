'use strict';
// Regression: the route chooser previously hid Start navigation inside a
// collapsed destination search. Lower-right popups could cover the hamburger.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const app=fs.readFileSync('openrf/static/app.js','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');

assert.match(html,/<div class="route-choice-footer">\s*<button type="button" id="route-choice-start" class="btn primary route-choice-start" disabled>Start navigation<\/button>/,
  'Route choice sheet has a prominent opt-in Start navigation button');
assert(html.includes('id="map-begin-guidance"'),'Original guarded GPS-follow control remains present');
assert(css.includes('.route-choice-scroll{flex:1 1 auto;min-height:0;overflow-y:auto'),
  'Route comparison scrolls without hiding the Start button');
assert(css.includes('.route-choice-footer{flex:0 0 auto'),
  'Start navigation remains visible below scrollable card details');

function sourceBetween(start,end){
  const from=app.indexOf(start),to=app.indexOf(end,from+start.length);
  assert(from>=0&&to>from,`Cannot isolate ${start}`);
  return app.slice(from,to);
}
const elements=new Map();
function $(id){
  if(!elements.has(id))elements.set(id,{disabled:false,textContent:'',clicks:0,
    click(){this.clicks++},setAttribute(){}});
  return elements.get(id);
}
const state={navFollowId:null,navPreview:null,navChoiceSelection:'standard',navChoicePanelClosed:false};
const main={type:'ROAD_ROUTE',is_driving_route:true,coordinates:[[0,0],[1,1]]};
const alternate={type:'ROAD_ROUTE',is_driving_route:true,coordinates:[[0,0],[1,2]]};
const context={$,state,sameRoadCoordinates(){return false},renderRouteChoices(){},renderNavigationOverlay(){},
  setNavigationRoutePreview(route){state.navPreview=route},setMapDestinationStatus(){}};
vm.createContext(context);
vm.runInContext(sourceBetween('function chooseRouteChoice(key){',"$('route-choice-standard').addEventListener"),context);
vm.runInContext(sourceBetween('function startSelectedRouteNavigation(){',"$('route-choice-start').addEventListener"),context);
state.navRouteChoices={standard:main,alternative:alternate,standard_cameras:{},alternative_cameras:{}};
state.navPreview=main;
context.chooseRouteChoice('alternate');
assert.equal(state.navPreview,alternate,'Selecting Alternate puts that route in the GPS follow preview');
assert.equal(state.navChoiceSelection,'alternate');
context.startSelectedRouteNavigation();
assert.equal($('map-begin-guidance').clicks,1,'New button invokes the existing opt-in GPS flow');
state.navFollowId=9;
context.startSelectedRouteNavigation();
assert.equal($('map-begin-guidance').clicks,1,'Cannot launch GPS follow a second time');
state.navFollowId=null;
state.navPreview={type:'DIRECT_LINE',is_driving_route:false};
context.startSelectedRouteNavigation();
assert.equal($('map-begin-guidance').clicks,1,'Direct-line preview cannot start road guidance');
assert.match($('route-choice-status').textContent,/valid Valhalla road route/);

state.navPreview=main;
state.navRouteChoices={standard:main,alternative:alternate};
state.navCameraComparison={standard_cameras:{count:1}};
state.navDestinations=[{name:'Saved place'}];state.navAvoidSaved=[{name:'Saved road'}];
state.navPickedPoint=[-120,38];state.navPickedOrigin=[-121,38];
state.navSelectedAddress={name:'Old route'};state.navOriginManual=true;
state.navSearchToken=4;state.navPicking=true;
for(const id of ['map-destination-query','nav-dest-query','nav-dest-name','nav-dest-lat','nav-dest-lon',
  'map-origin-query','nav-start-query','nav-start-lat','nav-start-lon'])$(id).value='old trip';
let reRendered=0;
let reopenedSearch=0;
Object.assign(context,{
  resetRouteForNewDestination(){state.navPreview=null;state.navRouteChoices=null;state.navCameraComparison=null;$('map-begin-guidance').disabled=true;},
  hideMapAddressMatches(){},syncMapOriginSummary(){},syncDestinationPickMode(){},syncMapPickedAction(){},
  cameraPanelVisibility(){},setNavigationStatus(){},renderNavigationOverlay(){reRendered++;},
  setMapSearchCollapsed(collapsed){if(collapsed===false)reopenedSearch++;},
});
vm.runInContext(sourceBetween('function discardChosenRoute(){',"$('route-choice-close').addEventListener"),context);
context.discardChosenRoute();
for(const id of ['map-destination-query','nav-dest-query','nav-dest-name','nav-dest-lat','nav-dest-lon',
  'map-origin-query','nav-start-query','nav-start-lat','nav-start-lon'])
  assert.equal($(id).value,'',`Discard clears unsaved ${id}`);
assert.equal(state.navPickedPoint,null,'Discard removes destination pin');
assert.equal(state.navPickedOrigin,null,'Discard removes temporary starting pin');
assert.equal(state.navRouteChoices,null,'Discard removes both route choices');
assert.equal(state.navPreview,null,'Discard removes drawn route');
assert.equal(state.navCameraComparison,null,'Discard drops stale report comparison');
assert.equal(state.navOriginManual,false,'Custom start resets to default');
assert.equal(state.navSearchToken,5,'Discard invalidates pending address suggestions');
assert.equal(state.navPicking,false);
assert.equal(state.navDestinations[0].name,'Saved place','Saved places are not discarded');
assert.equal(state.navAvoidSaved[0].name,'Saved road','Saved avoidance rules are retained');
assert.equal($('map-begin-guidance').disabled,true,'Discard cannot leave navigation enabled');
assert(reRendered>0,'Map lines and pins are rerendered');
assert.equal(reopenedSearch,1,'Discarded route reopens Where to? for a new destination');

const popup={styles:{},style:{setProperty(key,value){popup.styles[key]=value}}};
const map={getBoundingClientRect(){return {left:8,right:812,top:8,bottom:488,width:804,height:480}}};
const placementCtx={window:{innerWidth:840,innerHeight:500},$(){return {querySelector(){return map}}}};
vm.createContext(placementCtx);
vm.runInContext(sourceBetween('function alignBottomMapPopup(popup){','function alignMapSettingsPopup(){'),placementCtx);
placementCtx.alignBottomMapPopup(popup);
const px=name=>Number.parseInt(popup.styles[`--openrf-map-popup-${name}`],10);
assert(px('top')>=68,'Popup top starts below hamburger controls');
assert(px('left')+px('width')<=812-56,'Popup right stays left of the map control rail');
assert(px('top')+px('height')<=488-52,'Popup bottom stays above bottom controls');
assert.equal(px('width'),360,'Bottom-right sheets share a compact width');
for(const selector of ['#page-map .map-navigation-settings[open] .map-settings-popup',
  '#page-map #map-survey-panel:not([hidden])','#observation-dialog.map-observation-popup'])
  assert(css.includes(selector),'Shared popup geometry applies to '+selector);
assert(app.includes("dialog.classList.toggle('map-observation-popup',fromMap)"),
  'Only map-opened observation dialogs use the compact popover layout');
assert(app.includes('function realignBottomMapPopups(){'),
  'All map sheets realign on resizing and scrolling');
console.log('PASS v0.2.114 selected-route Start navigation and three aligned popups');
