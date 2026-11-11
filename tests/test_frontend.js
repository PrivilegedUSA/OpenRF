// Dependency-free frontend regression: pure web mercator conversions and basic markup.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const src = fs.readFileSync('openrf/static/app.js', 'utf8');
const css = fs.readFileSync('openrf/static/app.css', 'utf8');
const html = fs.readFileSync('openrf/static/index.html', 'utf8');
const begin = src.indexOf('function worldPixel(');
const end = src.indexOf('function startRasterMap(', begin);
assert(begin >= 0 && end > begin);
const { worldPixel, pixelWorld } = Function(`${src.slice(begin, end)};return {worldPixel,pixelWorld}`)();
for (const position of [[-120.5, 38.1], [0, 0], [179.5, -15], [22.4, 71]]) {
  const pixel = worldPixel(position[0], position[1], 10);
  const roundtrip = pixelWorld(pixel[0], pixel[1], 10);
  assert(Math.abs(roundtrip[0] - position[0]) < 0.000001, `longitude ${position}`);
  assert(Math.abs(roundtrip[1] - position[1]) < 0.000001, `latitude ${position}`);
}
assert(/margin:0 auto;align-self:stretch/.test(css), 'page header must top-align');
assert(/#page-scanner > \.two-columns \{ margin-bottom: 20px; \}/.test(css), 'scanner panel gap');
assert(html.includes('/static/vendor/maplibre-gl.js'), 'must prefer optional local MapLibre release');
assert(html.includes('id="map-mode"'), 'explicit raster fallback');
assert(html.includes('id="device-inventory"'), 'hardware device inventory');
assert(html.includes('id="map-location-status"'), 'map auto-location status notice');
assert(html.includes('id="scan-wifi-once"'), 'one-shot Linux Wi-Fi control');
assert(src.includes('locateMap(false)') && src.includes('state.autoLocateAttempted'), 'map should attempt geolocation once');
assert(src.includes('locationZoom(accuracy)') && src.includes('maximumAge:60000'), 'accuracy-aware automatic location');
assert(src.includes("$('map-mode').addEventListener('click'"), 'raster fallback switch must have a click handler');
assert(src.includes('state.browserLocation') && src.includes('updateBrowserLocationMarker'), 'browser position marker');
assert(css.includes('.browser-location-marker'), 'browser position styling');
console.log('Frontend regressions passed: projection, shared header alignment, scanner spacing, map and inventory controls.');

// v0.2.3: embedded scanner/map layer and handheld requirements.
assert(html.includes('id="map-survey-toggle"') && html.includes('id="map-survey-panel"'), 'map-first wireless drawer');
assert(html.includes('id="map-scan-wifi"') && html.includes('id="scan-wifi-once"'), 'same one-shot driver available in Map and Analysis');
assert(html.includes('data-map-kind="WIFI"') && html.includes('data-map-kind="BLE"'), 'map wireless layer checkboxes');
assert(src.includes('function mapVisibleObservations()') && src.includes('Number.isFinite(o.latitude)'), 'only geolocated observations may be pinned');
assert(src.includes('state.mapKinds.has(o.kind)') && src.includes("o.source !== 'DEMO'"), 'per-kind filters and DEMO default exclusion');
assert(src.includes('mapVisibleObservations().forEach') && src.includes('const observations = mapVisibleObservations();'), 'vector and raster filters agree');
assert(src.includes('async function scanWifiOnce()') && src.includes("$('map-scan-wifi').addEventListener('click', scanWifiOnce)"), 'shared scan action');
assert(src.includes('Not geolocated or mapped'), 'Wi-Fi scan list must never imply transmitter pins');
assert(css.includes('.map-survey-panel {position:fixed') && css.includes('env(safe-area-inset-bottom)'), 'handheld drawer and nav safe areas');
assert(html.includes('id="menu-toggle"') && html.includes('id="menu-backdrop"') && html.includes('id="menu-close"'), 'hamburger drawer controls');
assert(html.includes('id="map-geolocate-sheet"') && src.includes("$('map-geolocate-sheet').addEventListener('click',()=>locateMap(true))"), 'handheld geolocation preserved');
console.log('v0.2.3 map-first and touchscreen contract checks passed.');

// v0.2.4: no horizontally scrolling tabs/tables on compact touchscreen widths.
assert(src.includes('function setNavigationOpen(') && src.includes("event.key === 'Escape'"), 'drawer can be opened and dismissed with Escape');
assert(src.includes('mainSidebar.inert = compact && !navigationOpen') && src.includes("document.querySelector('.main').inert = compact && navigationOpen"), 'closed drawer and background are non-focusable as appropriate');
assert(src.includes('if (navigationOpen) {') && src.includes("$('page-title').focus({preventScroll: true})"), 'drawer closes and moves focus to destination on navigation');
assert(css.includes('.data-table td:before {content:attr(data-label)') && src.includes('data-label="BSSID"') && src.includes('data-label="RSSI"'), 'measurement tables become stacked labeled rows');
assert(css.includes('.sidebar .nav {display:grid;grid-template-columns:minmax(0,1fr)') && css.includes('transform:translateX(-110%)'), 'mobile navigation is vertical rather than scrolling horizontally');
console.log('v0.2.4 menu and non-scrolling table contract checks passed.');

// v0.2.5 right-side field controls, map camera and server-backed sensor receipts.
assert(html.indexOf('id="menu-toggle"') > html.indexOf('id="runtime-pill"'), 'hamburger belongs at top-right of header');
assert(css.includes('right:0;transform:translateX(110%)'), 'mobile drawer should slide in from right');
assert(html.includes('class="map-scan-symbol"') && !html.includes('Layers &amp; Scan <span'), 'icon-only map control');
assert(css.includes('bottom:14px!important'), 'map control anchored at bottom-right');
assert(src.includes('function applyPendingLocation()') && src.includes("state.map.on('style.load'"), 'apply location when map style loads');
assert(src.includes('state.pendingLocationView') && src.includes('state.map.jumpTo({center:pending.center, zoom:pending.zoom})'), 'explicit camera jump at map ready');
assert(src.includes('saveWifiReading(') && src.includes('/api/sensors/networkmanager-wifi/save'), 'verified scan result saves via server receipt');
assert(html.includes('id="sensor-registry-list"'), 'sensor registry is visible');
console.log('v0.2.5 map control, GPS and sensor pipeline checks passed.');

// v0.2.6: scan-time survey position, explicit snapshot recording and quality units.
assert(html.includes('id="map-save-scan"') && html.includes('id="scanner-save-scan"'), 'explicit save-snapshot actions on Map and Analysis');
assert(html.includes('id="map-capture-location"') && html.includes('id="scanner-capture-location"'), 'optional scan-time browser location opt-in');
assert(html.includes('id="captures-list"') && html.includes('id="sensor-diagnostics"'), 'session capture history and sensor diagnostics');
assert(src.includes('state.wifiScan.observerAtRequest = atScanPosition'), 'browser location is latched at time of scan request');
assert(src.includes('async function saveScanSnapshot()') && src.includes('/api/sensors/networkmanager-wifi/save-scan'), 'batch save must use server-owned scan receipt');
assert(src.includes('scan.scan_id = null'), 'frontend must disable replaying the saved receipt');
assert(src.includes('signal_quality_percent') && src.includes("const unit = rssi.length ? 'dBm' : '% NetworkManager quality'"), 'plot only same-unit measurements');
assert(css.includes('.capture-actions') && css.includes('.capture-actions .btn{width:100%;}'), 'touchscreen snapshot controls avoid horizontal overflow');
console.log('v0.2.6 survey snapshot, quality units, and small-screen contract checks passed.');

// v0.2.7 standardized external serial sensor handshake and snapshot UI.
assert(html.includes('id="usb-sensor-port"') && html.includes('id="usb-sensor-probe"') && html.includes('id="usb-sensor-capture"'), 'explicit USB sensor controls required');
assert(html.includes('id="usb-sensor-location"') && html.includes('USB sensor setup'), 'opt-in survey position and map path to hardware');
assert(src.includes('async function runSerialSensor(snapshot)') && src.includes('/api/sensors/serial/snapshot'), 'hardware snapshot must be user-triggered');
assert(src.includes('recentSerialSurveyLocation()') && src.includes('seconds > 60'), 'only recent observer position may be attached');
assert(css.includes('@media(max-width:900px){.usb-sensor-actions{grid-template-columns:minmax(0,1fr)') , 'USB controls must stack on handheld display');
console.log('v0.2.7 USB serial field controls and compact layout contract passed.');

// v0.2.9: no OSM public raster fetches, offline map package and local asset hooks.
assert(!src.includes('https://tile.openstreetmap.org/'), 'public OSM raster service must never be requested by fallback');
assert(src.includes('/api/maps/') && src.includes('tiles/${tileZoom}/'), 'offline raster tiles must come from local API');
assert(src.includes('mapVisibleObservations().forEach'), 'offline view keeps survey pins');
assert(html.includes('id="offline-map-select"') && html.includes('id="offline-map-status"'), 'touchscreen local map selector exists');
assert(html.includes('/static/vendor/maplibre-gl.css'), 'optional local MapLibre CSS hook');
assert(css.includes('.offline-map-manager') && css.includes('grid-template-columns:minmax(0,1fr) auto'), 'compact offline selector layout');
console.log('v0.2.9 local mapping controls, offline tiles, and OSM policy checks passed.');

// v0.2.10: only operator-selected local files are imported; do not enable remote tile download.
assert(html.includes('id="map-area-manager"') && html.includes('id="offline-map-import"') && html.includes('id="offline-map-file"'), 'compact browser-based local MBTiles import');
assert(html.includes('id="offline-map-zoom"') && html.includes('id="offline-map-remove"'), 'coverage view and explicit removal controls');
assert(src.includes("fetch('/api/maps/import'") && src.includes('application/octet-stream'), 'stream browser-selected file to loopback API');
assert(src.includes('function renderOfflineAreaDetail()') && src.includes('function zoomToOfflineArea(pack)'), 'package coverage and zoom functions');
assert(src.includes('confirm(`Remove the local map file') && src.includes("'/api/maps'"), 'deletion is explicitly confirmed and catalog is refreshed');
assert(!src.includes('tile.openstreetmap.org'), 'public OSM tile downloads remain disabled');
assert(css.includes('.map-area-manager') && css.includes('grid-template-columns:minmax(0,1fr)'), 'area manager responsive handheld layout');
console.log('v0.2.10 map area manager import, removal, local-only and touch layout contract passed.');

// v0.2.11: two-click planned region and local-only offline subset generation.
assert(html.includes('id="area-plan-choose"') && html.includes('id="area-plan-viewport"') && html.includes('id="area-plan-cancel"'), 'two-corner / viewport / cancel controls');
assert(html.includes('id="area-plan-west"') && html.includes('id="area-plan-north"') && html.includes('id="area-saved-select"'), 'manual bounds and saved plans');
assert(html.includes('id="area-build-source"') && html.includes('id="area-license-confirm"'), 'explicit source and derivative license check');
assert(src.includes('function consumeAreaClick(lon, lat)') && src.includes('function renderAreaOverlay()'), 'shared vector and offline raster region selection');
assert(src.includes('if (consumeAreaClick(evt.lngLat.lng, evt.lngLat.lat)) return;') && src.includes('if (consumeAreaClick(ll[0], ll[1])) return;'), 'planning clicks cannot create survey observations');
assert(src.includes("'/api/maps/areas'") && src.includes('rights_confirmed:true') && src.includes('.geojson'), 'private area API, acknowledged local subset, GeoJSON');
assert(css.includes('.area-coordinate-grid') && css.includes('@media(max-width:620px){.area-coordinate-grid'), 'touch-friendly area editor');
console.log('v0.2.11 user-planned regions, local subset rights check, and dual-map interaction contracts passed.');

// v0.2.12: offline-authorized raster tile ZIP acquisition, never public tile scraping.
assert(html.includes('id="area-saved-tile-plan"') && html.includes('id="area-zip-file"'), 'provider-neutral tile plan export and local archive picker');
assert(html.includes('id="area-zip-source"') && html.includes('id="area-zip-attribution"') && html.includes('id="area-zip-rights"'), 'source, attribution, license controls');
assert(src.includes('/api/maps/areas/${plan.id}/import-xyz'), 'local import uses plan endpoint');
assert(src.includes("'X-OpenRF-Rights-Confirmed':'true'") && src.includes('body:file'), 'raw file upload requires explicit license acknowledgement');
assert(css.includes('.area-zip-fields') && css.includes('@media(max-width:620px){.area-zip-fields'), 'new ZIP controls stack on touchscreen widths');
assert(!src.includes('tile.openstreetmap.org'), 'no public raster prefetching');
console.log('v0.2.12 offline tile ZIP creation and license-aware UI contracts passed.');

// v0.2.15: initial map camera starts one more step out while preserving smooth location flyover.
const cameraBegin = src.indexOf('function reduceMapMotion() {');
const cameraEnd = src.indexOf('\nfunction locateMap(', cameraBegin);
assert(cameraBegin >= 0 && cameraEnd > cameraBegin, 'camera behavior must be testable');
function cameraHandler(s, reduced = false) {
  return Function('state', 'window', `${src.slice(cameraBegin, cameraEnd)}; return applyPendingLocation`)(
    s, {matchMedia: () => ({matches: reduced})});
}
const target = {center:[-120.5,38.1],zoom:15,epoch:0,manual:false};
const spy = {flights:[], jumps:[], flyTo(o){this.flights.push(o);}, jumpTo(o){this.jumps.push(o);}};
const moving = {map:spy,mapReady:true,rasterMap:null,pendingLocationView:{...target},mapNavigationEpoch:0};
cameraHandler(moving)();
assert.equal(spy.flights.length,1, 'location should smoothly fly when style is ready');
assert.equal(spy.jumps.length,0, 'normal location must not jump');
assert.deepEqual(spy.flights[0].center, target.center);
assert.equal(spy.flights[0].zoom, target.zoom);
assert.equal(spy.flights[0].duration, 2600, 'flight must use an explicit visible duration to avoid snapping');
assert.equal(moving.pendingLocationView,null, 'consumed fix must not replay on later style switches');
const reduced = {map:spy,mapReady:true,rasterMap:null,pendingLocationView:{...target},mapNavigationEpoch:0};
cameraHandler(reduced, true)();
assert.equal(spy.jumps.length,1,'OS reduced-motion preference must avoid flight');
const deferred = {map:spy,mapReady:false,rasterMap:null,pendingLocationView:{...target},mapNavigationEpoch:0};
cameraHandler(deferred)();
assert(deferred.pendingLocationView, 'location before style load must remain pending');
const stale = {map:spy,mapReady:true,rasterMap:null,pendingLocationView:{...target},mapNavigationEpoch:3};
cameraHandler(stale)();
assert.equal(stale.pendingLocationView,null, 'user map gesture takes precedence over automatic location');
assert.equal(spy.flights.length,1, 'stale GPS must not override map gesture');
const rasterSpy = {flights:[],flyTo(o){this.flights.push(o);}};
const fallback = {map:null,mapReady:false,rasterMap:rasterSpy,pendingLocationView:{...target},mapNavigationEpoch:0};
cameraHandler(fallback)();
assert.deepEqual(rasterSpy.flights[0], {center:target.center,zoom:target.zoom});
assert.equal(fallback.pendingLocationView,null);
assert(src.includes('const initial = state.preferredView || {center:[-98.5,39.8], zoom:2}'), 'initial map camera must start far enough out to show the whole U.S. overview');
assert(src.includes('const camera = state.map ?') && !src.includes('const camera = state.pendingLocationView ||'), 'fallback should retain overview until pending location flies');
assert(src.includes('const tick = now =>') && src.includes('requestAnimationFrame(tick)') && src.includes('state.rasterMap.stop();'), 'offline coordinate map should animate and allow interruption');
console.log('v0.2.15 fuller overview, non-snapping GPS camera, reduced motion, readiness, user gesture and raster fallback tests passed.');

// Exercise the actual raster animation callbacks without a browser or mock RF data.
const rasterBegin = src.indexOf('    stop() {',src.indexOf('function startRasterMap('));
const rasterEnd = src.indexOf('    resize() {',rasterBegin);
assert(rasterBegin > 0 && rasterEnd > rasterBegin);
const frames = [], cancelled = [];
const rasterEnvironment = {rasterMap:null};
const makeRaster = Function('state','reduceMapMotion','performance','requestAnimationFrame','cancelAnimationFrame',
  `let flightFrame = null; const raster = {center:[-98.5,39.8],zoom:2,render(){},${src.slice(rasterBegin,rasterEnd)}}; state.rasterMap=raster; return raster;`);
const rasterCamera = makeRaster(rasterEnvironment,()=>false,{now:()=>0}, fn=>{frames.push(fn);return frames.length;}, id=>cancelled.push(id));
rasterCamera.flyTo({center:[-120.5,38.1],zoom:15});
assert.equal(rasterCamera.zoom,2, 'raster flight should not snap immediately');
frames.shift()(1300);
assert(rasterCamera.zoom > 2 && rasterCamera.zoom < 15, 'raster mid-flight should be zooming');
assert(rasterCamera.center[0] < -98.5 && rasterCamera.center[0] > -120.5, 'raster mid-flight should be panning');
frames.shift()(2600);
assert.deepEqual(rasterCamera.center,[-120.5,38.1], 'raster flight should reach exact final coordinates');
assert.equal(rasterCamera.zoom,15);
rasterCamera.flyTo({center:[-121,38],zoom:12});
rasterCamera.stop();
assert(cancelled.length > 0, 'raster user interaction must cancel the active animation');
const noMotionState = {rasterMap:null};
const noMotionFrames=[];
const noMotionRaster = makeRaster(noMotionState,()=>true,{now:()=>0}, fn=>{noMotionFrames.push(fn); return 1;},()=>{});
noMotionRaster.flyTo({center:[-121,38],zoom:12});
assert.deepEqual(noMotionRaster.center,[-121,38]);
assert.equal(noMotionRaster.zoom,12);
assert.equal(noMotionFrames.length,0, 'reduced motion must not schedule animation frames');
console.log('v0.2.15 raster frame interpolation, completion, interruption and accessibility passed.');
