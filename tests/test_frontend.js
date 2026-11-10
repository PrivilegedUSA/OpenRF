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
assert(html.includes('maplibre-gl@5.24.0/dist/maplibre-gl.js'), 'must load compatible UMD MapLibre release');
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
