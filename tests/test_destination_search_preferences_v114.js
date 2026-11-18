'use strict';
// Do not lose a half-entered destination when opening the navigation gear.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const js=fs.readFileSync('openrf/static/app.js','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
const start=js.indexOf('function cameraPanelVisibility(open){');
const end=js.indexOf('function openCameraRouteOptions(){',start);
assert(start>=0&&end>start);
const nodes=new Map();
function $(id){
  if(!nodes.has(id))nodes.set(id,{hidden:true,open:false,attrs:{},
    setAttribute(name,value){this.attrs[name]=String(value)}});
  return nodes.get(id);
}
const state={navCameraPanelOpen:false,navPreview:{type:'ROAD_ROUTE'}};
let collapsed=0;
const context={$,state,activeMapTool:null,setMapSearchCollapsed(){collapsed++},closeMapToolOverlay(){}};
vm.createContext(context);
vm.runInContext(js.slice(start,end),context);
context.cameraPanelVisibility(true);
assert.equal($('map-navigation-options').open,true,'Gear opens over the destination search');
assert.equal(state.navCameraPanelOpen,true);
assert.equal(collapsed,0,'Opening route preferences must not collapse Where to?');
assert.equal(state.navPreview.type,'ROAD_ROUTE','Existing road plan is not erased by the gear');
context.cameraPanelVisibility(false);
assert.equal($('map-navigation-options').open,false);
assert.equal(collapsed,0,'Closing route preferences also leaves Where to? in its prior state');
assert(!js.includes('<span class="map-search-caption">Close search</span>'),
  'Expanded search button contains only the close glyph');
assert(js.includes('<span class="map-search-close-mark" aria-hidden="true">×</span>'));
assert(js.includes("'Close destination search'"),'Accessible label still explains the X');
assert(css.includes('.map-destination-panel:not(.is-collapsed) .map-search-toggle{'),
  'The expanded X is compact and does not crowd the destination address field');
console.log('PASS v0.2.114 retained Where to? behind route preferences and compact close X');
