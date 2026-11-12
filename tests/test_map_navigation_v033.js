'use strict';
// v0.2.33: real map DOM layout and coarse browser geolocation behavior.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const dir=path.join(__dirname,'../openrf/static');
const routeGuide=require('../openrf/static/route_guidance.js');
const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
const js=fs.readFileSync(path.join(dir,'app.js'),'utf8');
const css=fs.readFileSync(path.join(dir,'app.css'),'utf8');
const after=(part)=>html.slice(html.indexOf(part));
assert.equal((html.match(/id="map-destination-form"/g)||[]).length,1);
assert(html.indexOf('id="map-destination-form"')<html.indexOf('id="map-navigation-options"'));
assert(html.indexOf('id="map-destination-form"')<html.indexOf('</form>',html.indexOf('id="map-destination-form"')));
assert(html.indexOf('id="map-navigation-options"')>html.indexOf('</form>',html.indexOf('id="map-destination-form"')));
assert(html.indexOf('id="map-provider-config"')>html.indexOf('id="map-navigation-options"'));
assert(!html.includes('Online address search & provider settings'));
assert(html.includes('class="map-navigation-options map-navigation-settings"'));
assert(html.includes('aria-label="Address search and navigation settings"'));
assert(html.includes('class="map-follow-details"'));
assert(css.includes('#page-map .map-navigation-settings[open]'));
assert(html.includes('id="map-settings-close"') && css.includes('.map-settings-popup'), 'persistent gear with separate X-close panel');
assert(css.includes('bottom:50px;left:8px'));
assert(js.includes("$('map-online-address').checked=stored === null ? true : stored === 'on'"));
assert(js.includes("window.localStorage?.setItem('openrf-address-online'"));
assert(js.includes('if(!consent && !localPhoton) return;'),'remote lookup remains conditional on consent');
const start=js.indexOf('function navigationNearestShape(');
const end=js.indexOf("$('map-begin-guidance').addEventListener('click'",start);
assert(start>0&&end>start);
const els={
  'map-follow-instruction':{textContent:''},
  'map-follow-quality':{textContent:''},
  'map-follow-distance':{textContent:''},'map-follow-hud':{classList:{toggle(){},remove(){}}},
  map:{clientHeight:600}
};
let updates=0;
const camera=[];
const state={navFollowId:42,navFollowLast:0,navFollowProgress:0,mapReady:true,
  map:{easeTo(o){camera.push(o)}},rasterMap:null,
  navPreview:{type:'ROAD_ROUTE',is_driving_route:true,
    coordinates:[[-120.6,38.4],[-120.599,38.4],[-120.598,38.4]],
    maneuvers:[{instruction:'Turn right onto Ponderosa Way',shape_index:2}]}};
const {followPosition}=Function('state','$','updateBrowserLocationMarker','stopNavigationFollow','routeGuide',
 `${js.slice(start,end)};return {followPosition}`)(state,id=>els[id],()=>updates++,()=>{},routeGuide);
const now=Date.now();
followPosition({timestamp:now,coords:{latitude:38.4,longitude:-120.6,accuracy:107,heading:null,speed:null}});
assert.match(els['map-follow-instruction'].textContent,/^Planned: Turn right onto Ponderosa Way/);
assert.match(els['map-follow-distance'].textContent,/Approximate location.*107 m.*LIVE turn timing paused/i);
assert.match(els['map-follow-quality'].textContent,/not a verified road position/i);
assert(els['map-follow-instruction'].textContent.startsWith('Planned:'),'approximate fix must not be called LIVE turn guidance');
assert.equal(camera.at(-1).zoom,15.25);
assert.equal(camera.at(-1).pitch,42);
assert(camera.at(-1).bearing>70 && camera.at(-1).bearing<110);
assert.equal(updates,1,'a coarse but recent fix updates the unsaved location dot');
state.navFollowLast=0;
followPosition({timestamp:now-30000,coords:{latitude:38.4,longitude:-120.6,accuracy:8}});
assert.match(els['map-follow-instruction'].textContent,/No recent valid browser location/);
assert.equal(updates,1,'stale fixes must not update marker');
state.navFollowLast=0;
followPosition({timestamp:Date.now(),coords:{latitude:38.4,longitude:-120.6,accuracy:10,heading:125,speed:10}});
assert.equal(els['map-follow-instruction'].textContent,'Turn right onto Ponderosa Way');
assert.equal(camera.at(-1).pitch,48);
assert.equal(camera.at(-1).bearing,125);
assert.equal(state.navFollowProgress,0);
assert.match(els['map-follow-distance'].textContent,/ft|mi/);
assert(camera.at(-1).offset[1]>0,'forward-view camera places the driver below center');
assert(!js.slice(start,end).includes("api('/api/survey/waypoints'"));
console.log('v0.2.33 compact settings, opt-in persisted state, precise/coarse/stale GPS and route safeguards passed.');
