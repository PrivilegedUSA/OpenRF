/* v0.2.52 retains map-first, with floating tool panels instead of scroll jump. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'openrf/static/index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'openrf/static/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'openrf/static/app.css'), 'utf8');
assert.equal((html.match(/id="map-destination-form"/g) || []).length, 1);
assert(!html.includes('id="field-map-toggle"'), 'focus toggle removed');
assert(!js.includes('fieldMapActive'), 'focus-only JS removed');
assert(!css.includes('body.field-map-mode'), 'focus-only CSS removed');
for(const id of ['map-search-toggle','map-destination-panel','map-tool-rail','map-tool-overlay','map-tool-close','map-picked-action'])
  assert(html.includes(`id="${id}"`), `missing ${id}`);
assert(html.includes('class="map-destination-panel is-collapsed"'), 'search compact before JS');
assert(html.includes('id="map-destination-form" class="map-destination-form" hidden'), 'route form hidden before JS');
assert(html.includes('aria-controls="map-destination-form" aria-expanded="false"'), 'accessible default search state');
assert(js.includes('mapSearchForm.hidden = isCollapsed'), 'search can expand/collapse');
assert(js.includes("setMapSearchCollapsed(true);"), 'compact search by default');
assert(js.includes("document.body.classList.toggle('map-workspace', page === 'map')"), 'normal map is default workspace');
assert(!js.includes("$('map-tools-anchor').scrollIntoView"), 'no scroll-to-tools jump');
assert(js.includes('openMapToolOverlay(kind)') && js.includes('closeMapToolOverlay('), 'floating tool panels');
assert(css.includes('body.map-workspace #page-map .map-wrap{height:100dvh!important'), 'map fills the viewport');
assert(css.includes('body.map-workspace .topbar .menu-toggle'), 'hamburger floats above map');
assert(html.includes('www.openstreetmap.org/copyright'), 'map attribution kept');
assert(js.includes('stopNavigationFollow()'), 'navigation lifecycle preserved');
console.log('PASS v0.2.52 map-first overlay tools and compact destination search');
