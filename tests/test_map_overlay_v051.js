'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('openrf/static/index.html', 'utf8');
const js = fs.readFileSync('openrf/static/app.js', 'utf8');
const css = fs.readFileSync('openrf/static/app.css', 'utf8');
assert(!html.includes('id="map-more-tools"'));
assert(!js.includes("$('map-tools-anchor').scrollIntoView"));
for (const kind of ['trip','settings','gps','offline']) {
  assert(html.includes(`data-map-tool="${kind}"`), `${kind} button present`);
  assert(js.includes(`${kind}: {title:`), `${kind} group present`);
}
for (const id of ['map-tool-rail','map-tool-overlay','map-tool-content','map-tool-close',
    'map-picked-action','map-picked-route','map-picked-begin','map-picked-change','map-picked-status'])
  assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1,`unique ${id}`);
for (const id of ['map-trip-planner','map-control-settings','survey-waypoint-manager',
    'sdr-site-map-manager','offline-basemap-settings','map-area-manager'])
  assert(js.includes(`'${id}'`),`existing ${id} control reused`);
assert(js.includes('pane.append(...mapToolNodes[kind])'), 'original controls moved without cloning IDs');
assert(js.includes('mapToolContent.append(pane)'), 'all tool panels stay attached for existing startup handlers');
assert(js.includes('pane.hidden = name !== kind'), 'hidden panels remain in document');
assert(js.includes("$('map-destination-form').requestSubmit($('map-start-navigation'))"), 'picked route shares existing Valhalla route action');
assert(js.includes('syncMapPickedAction();'), 'picked destination action appears');
assert(js.includes('setMapSearchCollapsed(true);') && js.includes('if (page === \'map\' && !wasMap)'), 'search is not reset on same-page actions');
assert(js.includes('if (activeMapTool) closeMapToolOverlay()'), 'map selection clears tool overlays');
assert(css.includes('#page-map .map-tool-overlay') && css.includes('max-height:calc(100dvh - 107px)'), 'panels scroll within map viewport');
assert(css.includes('#page-map .map-tool-button svg'), 'tool icons aligned');
assert(css.includes('body.map-workspace #page-map .map-wrap{height:100dvh!important'), 'full viewport retained');
assert(html.includes('www.openstreetmap.org/copyright'), 'attribution retained');
console.log('PASS v0.2.51 floating overlay tools, selected-point actions, no below-map scroll jump, and source preservation');
