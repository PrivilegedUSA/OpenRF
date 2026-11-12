'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const path=require('node:path');
const base=path.join(__dirname,'../openrf/static');
const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
const css=fs.readFileSync(path.join(base,'app.css'),'utf8');
const source=fs.readFileSync(path.join(base,'app.js'),'utf8');
const navSource=fs.readFileSync(path.join(base,'navigation.js'),'utf8');
const sandbox={window:{}};
vm.runInNewContext(navSource,sandbox);
const {point,preview}=sandbox.window.OpenRFNavigation;
assert.deepEqual(Array.from(point('38.1','-120.5')),[-120.5,38.1]);
for(const args of [['',0],[91,0],[1,'x'],['NaN',0],[0,'Infinity'],[-91,0],[0,181]]) {
  assert.throws(()=>point(...args), /Enter/);
}
const same=preview([-120,38],[-120,38]);
assert.equal(same.distance_km,0);
assert.equal(same.bearing_degrees,null);
assert.equal(same.is_driving_route,false);
assert.equal(same.type,'DIRECT_DISTANCE_ONLY');
const east=preview([-120,38],[-119,38]);
assert(east.distance_km>85&&east.distance_km<90);
assert(east.bearing_degrees>80&&east.bearing_degrees<100);
const crossing=preview([179,0],[-179,0]);
assert(crossing.distance_km>200&&crossing.distance_km<240,'shortest antimeridian distance');
assert(html.includes('id="map-destination-form"') && html.includes('id="map-trip-planner"') && html.includes('id="nav-preview-form"'));
assert(!html.includes('id="page-navigation"'), 'no separate navigation page: map is main workspace');
assert(html.indexOf('id="map-destination-form"') < html.indexOf('class="map-wrap"'), 'destination search above map');
assert(html.indexOf('class="map-wrap"') < html.indexOf('id="map-trip-planner"'), 'trip planner below map');
assert(html.indexOf('id="survey-waypoint-manager"') < html.indexOf('id="offline-basemap-settings"'), 'offline controls below GPS waypoints');
assert(html.indexOf('id="offline-basemap-settings"') < html.indexOf('id="offline-map-select"'), 'offline selector inside optional settings');
assert(html.indexOf('Accuracy meters (optional)') < html.indexOf('id="observation-use-location"'), 'location shortcut directly after accuracy');
assert(source.includes('if (!state.navOriginManual)') && source.includes("$('nav-start-lat').value=lat.toFixed(7)"), 'GPS fix defaults navigation origin');
assert(source.includes('quickDestinationPreview') && source.includes('findLocalDestination'), 'map-first local destination flow');
assert(html.includes('id="nav-pick-map"')&&html.includes('id="nav-use-location"'));
assert(html.includes('id="nav-destination-list"')&&html.includes('id="nav-save-destination"'));
assert(html.includes('id="navigation-preview-overlay"'));
assert(!html.includes('id="manual-entry"'),'remove redundant add observation button');
assert(html.includes('id="map-add-observation"'),'keep the compact + button');
assert(html.indexOf('Accuracy meters (optional)')<html.indexOf('id="observation-use-location"'),'move browser location below accuracy');
assert(html.includes('id="map-credits"')&&html.includes('www.openstreetmap.org/copyright'),'required credits remain available');
assert(css.includes('.map-survey-toggle {right:10px!important;bottom:10px!important;min-width:32px'));
assert(css.includes('.map-add-observation {right:50px;bottom:10px;width:32px'));
assert(source.includes('if (consumeNavigationPick(evt.lngLat.lng, evt.lngLat.lat)) return;'));
assert(source.includes('if (consumeNavigationPick(ll[0], ll[1])) return;'));
assert(source.includes("road.type!=='ROAD_ROUTE'") && source.includes('is_driving_route!==true'), 'only recognized Valhalla route responses can claim roads');
assert(source.includes('Direct-line reference only'));
assert(source.includes('previewNavigation()')&&source.includes('renderNavigationOverlay()'));
assert(!source.includes("$('manual-entry').addEventListener"));
const begin=source.indexOf('function findLocalDestination(');
const end=source.indexOf('\nfunction locationForQuickPreview()',begin);
assert(begin>=0 && end>begin);
const localSearch=Function('navGeometry',`${source.slice(begin,end)};return findLocalDestination`)({point});
const saved=[{name:'Home Base',latitude:38.4,longitude:-120.7},{name:'Survey Lot',latitude:38.5,longitude:-120.6}];
const named=localSearch('home base',saved);
assert.deepEqual(Array.from(named.coordinates),[-120.7,38.4]);
const coords=localSearch('38.48, -120.62',saved);
assert.deepEqual(Array.from(coords.coordinates),[-120.62,38.48]);
assert.throws(()=>localSearch('Main St, Jackson',saved),/This is an address/);
assert.throws(()=>localSearch('91, 10',saved),/Enter valid coordinates/);
assert.throws(()=>localSearch('',saved),/Enter a saved destination/);
assert(!source.includes('nominatim.openstreetmap.org'), 'no public Nominatim autocomplete');
console.log('v0.2.25 map-first destination search, geometry, offline settings, observation controls and attribution contracts passed.');

// v0.2.24: location recenter remains user-triggered and never persists points.
assert(source.includes("state.map.addControl({") && source.includes("openrf-recenter-control"),
  'MapLibre must place a distinct location button below its navigation controls');
assert(source.includes("controls.append(plus, minus, recenter)"),
  'raster map must provide the same recenter button directly after zoom controls');
assert(source.includes('Center map on my browser location') && css.includes('.openrf-recenter-control'),
  'recenter has an accessible label and compact styling');
const recenterStart=source.indexOf('function recenterMapToBrowserLocation() {');
const recenterEnd=source.indexOf('\nfunction makeMapRecenterButton()',recenterStart);
assert(recenterStart>=0&&recenterEnd>recenterStart,'recenter logic must remain isolated and testable');
const recenterCode=source.slice(recenterStart,recenterEnd);
assert(!recenterCode.includes('fetch(')&&!recenterCode.includes('api('),'recenter does not save or send observations');
function runRecenter(browserLocation) {
  const calls={locate:0,apply:0};
  const s={browserLocation,mapNavigationEpoch:4,pendingLocationView:null};
  const ref={textContent:''};
  const fn=Function('state','Date','locateMap','applyPendingLocation','locationZoom','$',
    `${recenterCode};return recenterMapToBrowserLocation;`)(s,{now:()=>100000},
      manual=>{assert.equal(manual,true);calls.locate++;},()=>{calls.apply++;},()=>14,()=>ref);
  fn();return {s,calls,ref};
}
const recent=runRecenter({lat:38.48,lon:-120.62,accuracy:35,capturedAt:80000});
assert.equal(recent.calls.locate,0);assert.equal(recent.calls.apply,1);
assert.deepEqual(recent.s.pendingLocationView.center,[-120.62,38.48]);
assert.equal(recent.s.pendingLocationView.manual,true);
assert.equal(recent.s.mapNavigationEpoch,5);
assert.match(recent.ref.textContent,/no location was saved/i);
const stale=runRecenter({lat:38.48,lon:-120.62,accuracy:35,capturedAt:30000});
assert.equal(stale.calls.locate,1);assert.equal(stale.calls.apply,0);
const missing=runRecenter(null);
assert.equal(missing.calls.locate,1);
console.log('v0.2.25 user-triggered recenter, old-fix rejection, privacy and map-mode placement passed.');

// v0.2.25: real road route only from local Valhalla, optional address search, stops and dark map.
assert(html.includes('id="map-address-options"') && html.includes('id="nav-add-stop"') && html.includes('id="nav-stops"'));
assert(html.indexOf('id="map-trip-planner"') < html.indexOf('id="map-control-settings"'), 'trip planner accordion above map settings');
assert(html.includes('id="nav-start-query"') && html.includes('id="nav-dest-query"'), 'trip planner uses address inputs, not just coordinates');
assert(source.includes("style: 'liberty'"), 'restore standard readable map style');
assert(css.includes('.openrf-recenter-button{background:#fff!important'), 'white location button');
assert(css.includes('stroke:#101820!important'), 'dark crosshair on white background');
assert(source.includes("'/api/navigation/route'") && source.includes('nav-stop-query'), 'backend route with ordered stops');
assert(source.includes('renderNavigationOverlay') && source.includes('road-route'), 'draw actual road geometry');
assert(source.includes('/api/navigation/geocode?q=') && source.includes('setTimeout(async()=>'), 'debounced optional address suggestions');
assert(!source.includes('map-open-trip'), 'main map no longer uses extra large Plan a trip button');
console.log('v0.2.26 Valhalla trip UI, optional address autocomplete, map theme, and recenter contrast passed.');

// v0.2.26: full-width destination, explicit opt-in address search, and clear route action.
assert(html.includes('id="map-start-navigation"') && html.includes('Start navigation'), 'start button remains labeled and accessible');
assert(html.includes('class="nav-start-icon"') && html.includes('id="map-online-address"'), 'button has paper-plane icon and explicit public search checkbox');
const destinationForm=html.slice(html.indexOf('id="map-destination-form"'),html.indexOf('</form>',html.indexOf('id="map-destination-form"')));
assert(destinationForm.indexOf('map-address-input-wrap') < destinationForm.indexOf('map-destination-actions'), 'destination input occupies full width, action appears afterward');
assert(!destinationForm.includes('<button class="btn primary" type="submit">Route</button>'), 'old Route button removed');
assert(css.includes('.map-destination-row{display:block') && css.includes('.map-destination-actions'), 'full-width input and separate action styling');
assert(source.includes("style: 'liberty'"), 'lighter basemap is default');
assert(source.includes('function addressLookupUrl(q)') && source.includes("'&online=1'"), 'outbound search requires explicit opt-in');
assert(source.includes('async function freshNavigationOrigin()') && source.includes('navigator.geolocation.getCurrentPosition'), 'start navigation requests one-shot location when old');
assert(source.includes("setMapDestinationStatus(err.message,'error')") && source.includes("finally {button.disabled=false;}"), 'route errors stay visible and button recovers');
assert(source.includes('Direct-line reference only') && source.includes('setNavigationRoutePreview(direct)'), 'no Valhalla must still draw labeled reference');
console.log('v0.2.26 map-first full-width destination, route action, opt-in address search and visible errors passed.');
